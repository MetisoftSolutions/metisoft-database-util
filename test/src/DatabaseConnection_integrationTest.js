'use strict';

var _ = require('lodash');
var chai = require('chai');
var chaiAsPromised = require('chai-as-promised');
chai.use(chaiAsPromised);
var expect = chai.expect;
var assert = chai.assert;
var should = chai.should();
var sinon = require('sinon');
var Promise = require('bluebird');

var DatabaseConnection = require('../../index.js').DatabaseConnection;
var dbc = new DatabaseConnection('test', {});

var pgMocks = require('./pg_mock.js');
var MockPgPool = pgMocks.MockPgPool;
var MockClient = pgMocks.MockClient;

const DEFAULT_TIMEOUT = 5000;

describe("DatabaseConnection integration suite", function() {

  describe("query() suite", function () {
    it("should connect to the devtest database and successfully execute a query", function(testDone) {
      this.timeout(DEFAULT_TIMEOUT);
      var dbc = DatabaseConnection.getConnection('devtest', 'standalone');

      dbc.query('SELECT 47 AS "some_number"')
        .then(function(result) {
          expect(result).to.exist;
          expect(result.rows).to.exist;
          expect(result.rows.length).to.equal(1);
          expect(result.rows[0]).to.deep.equal({
            'some_number': 47
          });
        })
        .finally(function() {
          testDone();
        });
    });
  });



  describe("__simpleQuery() suite", function() {
    it("should successfully execute a query", function(testDone) {
      this.timeout(DEFAULT_TIMEOUT);
      var dbc = DatabaseConnection.getConnection('devtest', 'standalone');

      dbc.__simpleQuery('SELECT \'hello\' AS "a_string"')
        .then(function(result) {
          expect(result).to.exist;
          expect(result.rows).to.exist;
          expect(result.rows.length).to.equal(1);
          expect(result.rows[0]).to.deep.equal({
            'a_string': 'hello'
          });
        })
        .finally(function() {
          testDone();
        });
    });
  });



  describe("Querying with clients suite", function() {
    it("should successfully execute a query using a returned client object", function(testDone) {
      this.timeout(DEFAULT_TIMEOUT);
      var dbc = DatabaseConnection.getConnection('devtest', 'standalone'),
          client,
          query = 'SELECT \'hello\' AS "a_string"';

      dbc.getClient()
        .then(function(c) {
          client = c;

          // Try the raw function first
          return dbc.__queryWithClient(query, [], client);
        })

        .then(function(result) {
          expect(result).to.exist;
          expect(result.rows).to.exist;
          expect(result.rows.length).to.equal(1);
          expect(result.rows[0]).to.deep.equal({
            'a_string': 'hello'
          });

          // Now try the API version
          return dbc.query(query, [], client);
        })

        .then(function(result) {
          expect(result).to.exist;
          expect(result.rows).to.exist;
          expect(result.rows.length).to.equal(1);
          expect(result.rows[0]).to.deep.equal({
            'a_string': 'hello'
          });
        })

        .finally(function() {
          client.release();
          testDone();
        });
    });
  });



  describe("queryReturningOne() suite", function() {
    it("should successfully execute a query using a returned client object", function(testDone) {
      this.timeout(DEFAULT_TIMEOUT);
      var dbc = DatabaseConnection.getConnection('devtest', 'standalone'),
          query = 'SELECT \'hello\' AS "a_string"';

      dbc.queryReturningOne(query, [])
        .then(function(row) {
          expect(row).to.deep.equal({
            'a_string': 'hello'
          });
        })

        .finally(function() {
          testDone();
        });
    });
  });



  describe("queryReturningMany() suite", function() {
    it("should successfully execute a query using a returned client object", function(testDone) {
      this.timeout(DEFAULT_TIMEOUT);
      var dbc = DatabaseConnection.getConnection('devtest', 'standalone'),
          query = "SELECT * FROM (VALUES (1, 'one'), (2, 'two'), (3, 'three')) AS t (num, letter)";

      dbc.queryReturningMany(query, [])
        .then(function(rows) {
          expect(rows).to.deep.equal([
            {
              num: 1,
              letter: 'one'
            },
            {
              num: 2,
              letter: 'two'
            },
            {
              num: 3,
              letter: 'three'
            }
          ]);
        })

        .finally(function() {
          testDone();
        });
    });
  });



  describe("squelQuery() suite", function() {
    it("should successfully execute a Squel query", function(testDone) {
      this.timeout(DEFAULT_TIMEOUT);
      var dbc = DatabaseConnection.getConnection('devtest', 'standalone'),
          sq = dbc.getSquel(),
          query;

      query = dbc.getSquelSelect(sq)
        .field('\'hello\'', 'a_string')
        .toParam();

      dbc.squelQuery(query)
        .then(function(result) {
          expect(result).to.exist;
          expect(result.rows).to.exist;
          expect(result.rows.length).to.equal(1);
          expect(result.rows[0]).to.deep.equal({
            'a_string': 'hello'
          });
        })

        .finally(function() {
          testDone();
        });
    });
  });



  describe("squelQueryReturningOne() suite", function() {
    it("should successfully execute a Squel query returning one row", function(testDone) {
      this.timeout(DEFAULT_TIMEOUT);
      var dbc = DatabaseConnection.getConnection('devtest', 'standalone'),
          sq = dbc.getSquel(),
          query;

      query = dbc.getSquelSelect(sq)
        .field('\'hello\'', 'a_string')
        .toParam();

      dbc.squelQueryReturningOne(query)
        .then(function(row) {
          expect(row).to.deep.equal({
            'a_string': 'hello'
          });
        })

        .finally(function() {
          testDone();
        });

    });
  });



  describe("squelQueryReturningMany() suite", function() {
    it("should successfully execute a Squel query returning many rows", function(testDone) {
      this.timeout(DEFAULT_TIMEOUT);
      var dbc = DatabaseConnection.getConnection('devtest', 'standalone'),
          sq = dbc.getSquel(),
          query;

      query = dbc.getSquelSelect(sq)
        .from("(VALUES (1, 'one'), (2, 'two'), (3, 'three')) AS t (num, letter)")
        .toParam();

      dbc.squelQueryReturningMany(query)
        .then(function(rows) {
          expect(rows).to.deep.equal([
            {
              num: 1,
              letter: 'one'
            },
            {
              num: 2,
              letter: 'two'
            },
            {
              num: 3,
              letter: 'three'
            }
          ]);
        })

        .finally(function() {
          testDone();
        });

    });
  });

});