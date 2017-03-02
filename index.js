'use strict';

var MongoClient = require('mongodb').MongoClient;
var uuid = require('node-uuid');
var pwd = require('couch-pwd');
var ms = require('ms');
var moment = require('moment');



/**
 * Adapter constructor function.
 *
 * @example
   var Adapter = require('lockit-mongodb-adapter');
   var config = require('./config.js');
   var adapter = new Adapter(config);
 *
 * @param {Object} config - Lockit configuration
 * @constructor
 */
var Adapter = module.exports = function(config) {

  if (!(this instanceof Adapter)) {return new Adapter(config); }

  this.config = config;
  this.collection = config.db.collection;

  // create connection string
  var url = config.db.url + config.db.name;

  // create connection as soon as module is required and share global db object
  var that = this;
  MongoClient.connect(url, function(err, database) {
    if (err) {throw err; }
    that.db = database;

    // Create single key indexes for username and email adress so they're both unique and faster to find
    // @see http://docs.mongodb.org/manual/core/index-single/
    // only use name key if they are unique
    if(config.uniqueName) {
      database.collection(that.collection).createIndex({name:1},{unique:true});
    } else {
      database.collection(that.collection).dropIndex({name:1});
    }
    database.collection(that.collection).createIndex({email:1},{unique:true});

    // This would create a compound index
    // @see http://docs.mongodb.org/manual/core/index-compound/
    // database.collection(that.collection).createIndex({name:1, email:1},{unique:true});
  });

};



/**
 * Create new user.
 *
 * @example
   adapter.save('john', 'john@email.com', 'secret', function(err, user) {
     if (err) console.log(err);
     console.log(user);
     // {
     //  name: 'john',
     //  email: 'john@email.com',
     //  signupToken: 'ef32a95a-d6ee-405a-8e4b-515b235f7c54',
     //  signupTimestamp: Wed Jan 15 2014 19:08:27 GMT+0100 (CET),
     //  signupTokenExpires: Wed Jan 15 2014 19:08:27 GMT+0100 (CET),
     //  failedLoginAttempts: 0,
     //  salt: '48cf9da376703199c30ba5c274580c98',
     //  derived_key: '502967e5a6e55091f4c2c80e7989623f051070fd',
     //  _id: 52d6ce9b651b4d825351641f
     // }
   });
 *
 * @param {String} name - User name
 * @param {String} email - User email
 * @param {String} pw - Plain text user password
 * @param {Function} done - Callback function `function(err, user){}`
 */
Adapter.prototype.save = function(name, email, pw, extra, done) {
  var that = this;

  var now = moment().toDate();
  var timespan = ms(that.config.signup.tokenExpiration);
  var future = moment().add(timespan, 'ms').toDate();

  var user = {
    name: name,
    email: email,
    signupToken: uuid.v4(),
    signupTimestamp: now,
    signupTokenExpires: future,
    failedLoginAttempts: 0
  };

  // insert extra if required
  if(that.config.useExtra) {
    user.extra = extra;
  }

  // create salt and hash
  pwd.hash(pw, function(err, salt, hash) {
    if (err) {return done(err); }
    user.salt = salt;
    user.derived_key = hash;
    that.db.collection(that.collection).save(user, function(saveErr, result) {
      done(saveErr, result.ops[0]);
    });
  });
};



/**
 * Find user. Match is either `'name'`, `'email'` or `'signupToken'`.
 *
 * @example
   adapter.find('name', 'john', function(err, user) {
     if (err) console.log(err);
     console.log(user);
     // {
     //   name: 'john',
     //   email: 'john@email.com',
     //   signupToken: '3a7f0f54-32f0-44f7-97c6-f1470b94c170',
     //   signupTimestamp: Fri Apr 11 2014 21:31:54 GMT+0200 (CEST),
     //   signupTokenExpires: Sat Apr 12 2014 21:31:54 GMT+0200 (CEST),
     //   failedLoginAttempts: 0,
     //   salt: '753981e8d8e30e8047cf5685d1f0a0d4',
     //   derived_key: '18ce03eddab6729aeaaf76729c90cb31f16a863c',
     //   _id: 5348432a98a8a6a4fef1f595
     // }
   });
 *
 * @param {String} match - Property to find user by. `'name'`, `'email'` or `'signupToken'`
 * @param {String} query - Corresponding value to `match`
 * @param {Function} done - Callback function `function(err, user){}`
 */
Adapter.prototype.find = function(match, query, done) {
  console.log("qry", query)
  var qry = {};
  qry[match] = query;
  this.db.collection(this.collection).findOne(qry, done);
};



/**
 * Update existing user.
 *
 * @example
   // get user from db
   adapter.find('name', 'john', function(err, user) {
     if (err) console.log(err);

     // add some new properties
     user.newKey = 'and some value';
     user.hasBeenUpdated = true;

     // save updated user to db
     adapter.update(user, function(err, user) {
       if (err) console.log(err);
       // ...
     });
   });
 *
 * @param {Object} user - Existing user from db
 * @param {Function} done - Callback function `function(err, user){}`
 */
Adapter.prototype.update = function(user, done) {
  var that = this;
  // update user in db
  that.db.collection(that.collection).save(user, function(err) {
    if (err) {return done(err); }
    // res is not the updated user object! -> find manually
    that.db.collection(that.collection).findOne({_id: user._id}, done);
  });
};



/**
 * Delete existing user.
 *
 * @example
   adapter.remove('john', function(err, res) {
     if (err) console.log(err);
     console.log(res);
     // true
   });
 *
 * @param {String} name - User name
 * @param {Function} done - Callback function `function(err, res){}`
 */
Adapter.prototype.remove = function(name, done) {
  this.db.collection(this.collection).remove({name: name}, function(err, result) {
    if (err) {return done(err); }
    if (result.result.n === 0) {return done(new Error('lockit - Cannot find user "' + name + '"')); }
    done(null, true);
  });
};
