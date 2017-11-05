'use strict';
var sinon = require('sinon');
var Promise = require('bluebird');



/*
 * Utility functions
 */

function bind(fn, obj) {
  return fn.bind(obj);
}



/*
 * MockClient
 */

function MockClient(options) {
  this.options = options;
  this.releaseWasCalled = false;
}

MockClient.prototype.release = function release() {
  this.releaseWasCalled = true;
};

MockClient.prototype.query = function query(queryStr, args, callback) {
  var self = this;

  if (callback) {
    if (self.options.throwError) {
      callback(new Error('CLIENT_ERROR'));
    } else {
      callback(null, 'OK');
    }
  
  } else {
    return new Promise(function(resolve, reject) {
      if (self.options.throwError) {
        throw new Error('CLIENT_ERROR');
      } else {
        resolve('OK');
      }
    });
  }
};



/*
 * MockPgPool
 */

function MockPgPool(options) {
  this.options = options;
  this.releaseWasCalled = false;
  this.client = null;
}

MockPgPool.prototype.connect = function connect(connectionConfig, callback) {
  var self = this;

  return new Promise(function(resolve, reject) {
    if (self.options.throwError) {
      throw new Error('PG_ERROR');
    } else {
      self.client = self.getClient(self.options.clientOptions);
      resolve(self.client);
    }
  });
};

MockPgPool.prototype.getClient = function getClient(options) {
  return new MockClient(options);
};



module.exports = exports = {
  MockClient: MockClient,
  MockPgPool: MockPgPool
};