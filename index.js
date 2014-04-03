
var MongoClient = require('mongodb').MongoClient;
var uuid = require('node-uuid');
var bcrypt = require('bcrypt');
var ms = require('ms');
var moment = require('moment');

module.exports = function(config) {

  // create connection as soon as module is required and share global db object
  var db;
  MongoClient.connect(config.db, function(err, database) {
    if (err) throw err;
    db = database;
  });

  var adapter = {};

  // create a new user and return user object
  adapter.save = function(name, email, pw, done) {

    // set sign up token expiration date

    var now = moment().toDate();
    var timespan = ms(config.signup.tokenExpiration);
    var future = moment().add(timespan, 'ms').toDate();

    var user = {
      username: name,
      email: email,
      signupToken: uuid.v4(),
      signupTimestamp: now,
      signupTokenExpires: future,
      failedLoginAttempts: 0
    };

    // create hashed password
    bcrypt.hash(pw, 10, function(err, hash) {
      if (err) return done(err);
      user.hash = hash;
      db.collection(config.dbCollection).save(user, done);
    });

  };

  // find an existing user
  adapter.find = function(match, query, done) {

    var qry = {};
    qry[match] = query;

    db.collection(config.dbCollection).find(qry).nextObject(done);

  };

  // update an existing user and return updated user object
  adapter.update = function(user, done) {

    // update user in db
    db.collection(config.dbCollection).save(user, function(err, res) {
      if (err) console.log(err);

      // res is not the updated user object! -> find manually
      db.collection(config.dbCollection).find({_id: user._id}).nextObject(done);

    });

  };

  // remove an existing user from db
  adapter.remove = function(username, done) {

    db.collection(config.dbCollection).remove({username: username}, function(err, numberOfRemovedDocs) {
      if (err) return done(err);
      if (numberOfRemovedDocs === 0) return done(new Error('lockit - Cannot find user "' + username + '"'));
      done(null, true);
    });

  };

  return adapter;

};
