#!/usr/bin/env node

var Datastore = require('nedb');
var Discord = require('discord.js');
var async = require('async');
var auth = require('../blitzbot.json');

// set WarGaming API key, so require does not return an init function
process.env.APPLICATION_ID = auth.wotblitz.key;

var Commands = require('../lib/command').Commands;
var helpers = require('../lib/helpers.js');

(function() { // Add commands scope, no need to pollute module scope.
  var add = require('../lib/command/add.js');
  var createHelp = require('../lib/command').createHelp;
  var devel = require('../lib/command/development.js');
  var greet = require('../lib/command/greet.js');
  var masteryList = require('../lib/command/masteryList.js');
  var roster = require('../lib/command/roster.js');
  var wr = require('../lib/command/winRate.js');

  Commands.addCommand(add);
  Commands.addCommand(devel.changes);
  Commands.addCommand(devel.version);
  Commands.addCommand(greet.hello);
  Commands.addCommand(greet.hi);
  Commands.addCommand(masteryList);
  Commands.addCommand(roster);
  Commands.addCommand(wr.winRate);
  Commands.addCommand(wr.tankWinRate);
  Commands.addCommand(createHelp());
})();

var client = new Discord.Client({
  autoReconnect: true,
});
var db = new Datastore({
  filename: './blitzbot.db',
  timestampData: true,
});
var commands = new Commands(client, db);

client.on('ready', function() {
  console.log('blitzbot ready!');
  console.log('===============');
});

client.on('message', function(message) {
  // Bot will only respond in a DM or when mentioned.
  if (!message.channel.isPrivate && !message.isMentioned(client.user)) return;
  if (message.author.id === client.user.id) return;

  var userId = message.author.id;
  var text = message.cleanContent;
  var mention = `@${client.user.username} `;
  var start = 0;

  if (!message.channel.isPrivate) {
    start = text.indexOf(mention);

    if (start < 0) return;

    start += mention.length;
  }

  var end = text.indexOf(' ', start);

  if (end < 0) end = text.length;

  var command = text.slice(start, end);

  if (!commands.$has(command)) return;

  var options = commands[command].options;
  var textArgs = text.slice(end).trim();

  async.auto({
    record: function(cb) { db.findOne({_id: userId}, cb); },
    runCmd: ['record', function(cb, d) {
      console.log(userId + ' -- running command: "' + command + '"');

      var args = [message];

      if (options.passRecord) {
        // commands require a saved 'account_id'.
        if (d.record && d.record.account_id) {
          args.push(d.record);
        } else {
          var send = 'I don\'t know who you are! Do `' + mention + 'add <screen-name>` first.';

          return client.reply(message, send, {}, function(aErr, sent) {
            if (aErr) return cb(aErr);

            console.log('sent msg: ' + sent);
            cb(null);
          });
        }
      }

      if (textArgs && options.argCount > 0) {
        Array.prototype.push.apply(args, textArgs.split(options.argSplit).slice(0, options.argCount));
      }

      Commands.prototype[command].apply(commands, args).then(update => cb(null, update), cb);
    }],
    update: ['runCmd', function(cb, d) {
      if (!d.runCmd) return cb(null);

      console.log(userId + ' -- update document');

      var newRecord = d.runCmd;

      newRecord._id = userId;
      delete newRecord.updatedAt;

      db.update({_id: userId}, newRecord, {upsert: true}, cb);
    }],
  }, function(err) {
    if (err) return console.error(helpers.getFieldByPath(err, 'response.error.text') || err.stack || err);

    console.log(userId + ' -- done');
  });
});

async.auto({
  loadDb: function(cb) { db.loadDatabase(cb); },
  discordLogin: function(cb) { client.loginWithToken(auth.user.token, null, null, cb); },
}, function(err) {
  if (err) return console.error(helpers.getFieldByPath(err, 'response.error.text') || err.stack || err);
});
