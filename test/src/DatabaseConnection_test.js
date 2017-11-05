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

var genFnQuery = function genFnQuery(payload) {
      return function(queryString, args, client) {
        return payload;
      };
    },
    genMirrorFnQuery = function genMirrorFnQuery() {
      return function(queryString, args, client) {
        return Promise.resolve({
          queryString: queryString,
          args: args,
          client: client
        });
      };
    };

describe('DatabaseConnection unit test suite', function() {
  
  describe('__DI_simpleQuery() suite', function() {
    
    it("should reject if there's an error", function(testIsDone) {
      var pool = new MockPgPool({ throwError: true }),
          config = {};
      
      dbc.__DI_simpleQuery(pool, config, 'SELECT * FROM everything', [])
        .then(function() {
          assert.fail();
        })
        .catch(function(err) {
          expect(err).to.exist;
        })
        .finally(function() {
          testIsDone();
        });
    });
    
    it("should call done and reject if there's a query error", function(testDone) {
      var pool = new MockPgPool({
            throwError: false,
            clientOptions: {
              throwError: true
            }
          });
      
      dbc.__DI_simpleQuery(pool, {}, 'SELECT * FROM everything', [])
        .then(function() {
          assert.fail();
        })
        .catch(function(err) {
          expect(err).to.exist;
          expect(pool.client.releaseWasCalled).to.be.true;
        })
        .finally(function() {
          testDone();
        });
    });
    
    it("should call done and resolve if everything's good", function(testDone) {
      var pool = new MockPgPool({
            throwError: false,
            clientOptions: {
              throwError: false
            }
          });
      
      dbc.__DI_simpleQuery(pool, {}, 'SELECT * FROM everything', [])
        .then(function(ret) {
          expect(ret).to.equal('OK');
          expect(pool.client.releaseWasCalled).to.be.true;
        })
        .catch(function(err) {
          assert.fail();
        })
        .finally(function() {
          testDone();
        });
    });
    
  });
  
  
  
  describe("__DI_queryWithClient() suite", function() {    
    
    it("should reject and not call done if there's an error", function(testDone) {      
      var pool = new MockPgPool({
            clientOptions: {
              throwError: true
            }
          }),
          config = {
            connection: ''
          },
          client,
          done;
          
      dbc.__DI_getClient(pool, config)
        .catch(function() {
          assert.fail();
        })
        .then(function(c) {
          client = c;
          done = sinon.spy(c.done);
          
          return dbc.__DI_queryWithClient(config, 'some query', [], client);          
        })
        
        .then(function() {
          expect(false).to.be.true;
        })
        .catch(function(err) {
          expect(err).to.exist;
          expect(done.calledOnce).to.be.false;
        })
        .finally(function() {
          testDone();
        });
    });
    
    it("should resolve and not call done if everything's good", function(testDone) {      
      var pool = new MockPgPool({
            clientOptions: {
              throwError: false
            }
          }),
          config = {
            connection: ''
          },
          client,
          done;    
          
      dbc.__DI_getClient(pool, config)
        .catch(function() {
          assert.fail();
        })
        .then(function(c) {
          client = c;
          done = sinon.spy(c.done);
          
          return dbc.__DI_queryWithClient(config, 'some query', [], client);
        })
        
        .then(function(ret) {
          expect(ret).to.equal('OK');
          expect(done.calledOnce).to.be.false;
        })
        .finally(function() {
          testDone();
        });
    });
    
  });
  
  
  
  describe("__DI_query() suite", function() {
    
    it("should call the queryWithClient function when you pass in a client", function() {
      var pool = new MockPgPool({}),
          queryWithClient = sinon.spy(),
          queryWithoutClient = sinon.spy(),
          client = {};
      
      dbc.__DI_query(queryWithClient, queryWithoutClient, 'query', [], client);
      
      expect(queryWithClient.calledOnce).to.be.true;
      expect(queryWithoutClient.calledOnce).to.be.false;
    });
    
    it("should call the queryWithoutClient function when you don't pass in a client", function() {
      var pool = new MockPgPool({}),
          queryWithClient = sinon.spy(),
          queryWithoutClient = sinon.spy();
      
      dbc.__DI_query(queryWithClient, queryWithoutClient, 'query', []);
      
      expect(queryWithClient.calledOnce).to.be.false;
      expect(queryWithoutClient.calledOnce).to.be.true;
    });
    
  });
  
  
  
  describe("__DI_getClient() suite", function() {
    
    it("should not call done and resolve if everything's good", function(testDone) {
      var pool = new MockPgPool({}),
          config = {
            connection: ''
          };
      
      dbc.__DI_getClient(pool, config)
        .then(function(c) {
          expect(c).to.not.be.undefined;
          expect(c.release).to.not.be.undefined;
          expect(c.releaseWasCalled).to.be.false;
          expect(_.isFunction(c.release)).to.be.true;
        })
        .catch(function(err) {
          console.error(err);
          assert.fail();
        })
        .finally(function() {
          testDone();
        });
      
    });
    
  });
  
  
  
  describe("__DI_queryReturningMany() suite", function() {    
    it("should return rows properly", function(testDone) {
      var testSet = [
            {
              retFromQuery: Promise.resolve({
                length: 10,
                otherDbMetaData: 'something',
                rows: [
                  {id: 3, name: 'CRM'},
                  {id: 1, name: 'Temporal Table Generator'},
                  {id: 5, name: 'User Authentication'}
                ]
              }),
              expectedRows: [
                {id: 3, name: 'CRM'},
                {id: 1, name: 'Temporal Table Generator'},
                {id: 5, name: 'User Authentication'}
              ]
            },
            {
              retFromQuery: Promise.resolve({
                stuff: 'skdafjsdlkfd',
                rows: [
                  {id: 3, name: 'CRM'}
                ],
                otherStuff: {
                  more: 10,
                  stuff: 100
                }
              }),
              expectedRows: [
                {id: 3, name: 'CRM'}
              ]
            },
            {
              retFromQuery: Promise.resolve({}),
              expectedRows: []
            }
          ];
      
      Promise.resolve(testSet.map(function(test) {
        return dbc.__DI_queryReturningMany(genFnQuery(test.retFromQuery), '', []);
      }))
      .each(function(actualRows, index) {
        expect(actualRows).to.deep.equal(testSet[index].expectedRows);
      })
      .finally(function() {testDone()});
    });    
  });
  
  
  
  describe("__DI_queryReturningOne() suite", function() {
    it("should return a single row properly", function(testDone) {
      var testSet = [
            {
              retFromQuery: Promise.resolve({
                length: 10,
                otherDbMetaData: 'something',
                rows: [
                  {id: 3, name: 'CRM'}
                ]
              }),
              expected: {id: 3, name: 'CRM'}
            },
            {
              retFromQuery: Promise.resolve({
                stuff: 'skdafjsdlkfd',
                rows: [
                  {id: 3, name: 'CRM'},
                  {id: 1, name: 'Temporal Table Generator'},
                  {id: 5, name: 'User Authentication'}
                ],
                otherStuff: {
                  more: 10,
                  stuff: 100
                }
              }),
              expected: {id: 3, name: 'CRM'}
            },
            {
              retFromQuery: Promise.resolve({}),
              expected: {}
            }
          ];
      
      Promise.resolve(testSet.map(function(test) {
        return dbc.__DI_queryReturningOne(genFnQuery(test.retFromQuery), '', []);
      }))
      .each(function(actual, index) {
        expect(actual).to.deep.equal(testSet[index].expected);
      })
      .finally(function() {testDone()});
    });
  });
  
  
  
  describe("__DI_squelQuery() suite", function() {
    var testSet = [
          {
            squelQuery: {
              text: 'SELECT * FROM crm WHERE $1 = $2',
              values: ['id', 99]
            },
            client: null
          }
        ];

    it("should send in the arguments correctly", function(testDone) {
      Promise.resolve(testSet.map(function(test) {
        return dbc.__DI_squelQuery(genMirrorFnQuery(), test.squelQuery, test.client);
      }))
      .each(function(result, index) {      
        var test = testSet[index];
        expect(result.queryString).to.equal(test.squelQuery.text);
        expect(result.args).to.deep.equal(test.squelQuery.values);
        expect(result.client).to.equal(test.client);
      })
      .finally(function() { testDone(); });
    });    
  });



  describe("__DI_runBasicService() suite", function() {
    var userData, req, errorCodeMap, fnValidate, fnMakeQuery, fnConvertErrors, config;

    beforeEach(function() {      
      userData = {
        userId: 47,
        username: 'derefed',
        company: {
          id: 24,
          name: 'Metisoft, LLC'
        }
      };

      req = {
        id: 123
      };

      errorCodeMap = {
        INVALID_ID: 'Invalid ID.'
      };

      fnValidate = function(req, errorCodes) {
        if (req.retVal === false) {
          errorCodes.push('INVALID_ID');
          return false;
        } else {
          return true;
        }
      };

      fnMakeQuery = function() {};

      fnConvertErrors = function(codeMap, codes) {
        return codes.map(function(code) {
          return codeMap[code];
        });
      };

      config = {
        userData: userData,
        req: req,
        errorCodeMap: errorCodeMap,
        fnValidate: fnValidate,
        fnMakeQuery: fnMakeQuery,
        oneOrMany: 'one'
      };
    });

    it("should error out if not given 'one' or 'many'", function(testDone) {
      var cfg = _.cloneDeep(config),
          p;

      cfg.oneOrMany = 'two';

      p = dbc.__DI_runBasicService(cfg)
        .then(function() {
          expect(true).to.be.false;
        })
        .catch(function(e) {
          expect(true).to.be.true;
        })
        .finally(function() { testDone(); });
    });
    
    it("should call fnMakeQuery() if fnValidate() passes", function(testDone) {
      var cfg = _.cloneDeep(config),
          fnQueryOne = sinon.spy(function() {
            return Promise.resolve(true);
          }),
          fnQueryMany = sinon.spy(function() {}),
          fnConvert = sinon.spy(fnConvertErrors);

      cfg.req.retVal = true;
      cfg.fnMakeQuery = sinon.spy(function() {});

      dbc.__DI_runBasicService(cfg, fnQueryOne, fnQueryMany, fnConvert)
        .then(function(actual) {
          expect(cfg.fnMakeQuery.calledOnce).to.be.true;
          expect(fnQueryOne.calledOnce).to.be.true;
          expect(fnConvert.calledOnce).to.be.false;
          expect(actual.errors).to.be.undefined;
        })

        .finally(function() { testDone(); });
    });

    it("should get error if fnValidate() fails", function(testDone) {
      var cfg = _.cloneDeep(config),
          fnQueryOne = sinon.spy(function() {
            return Promise.resolve(true);
          }),
          fnQueryMany = function() {};

      cfg.req.retVal = false;
      cfg.fnMakeQuery = sinon.spy(function() {});

      dbc.__DI_runBasicService(cfg, fnQueryOne, fnQueryMany)
        .then(function() {
          expect(true).to.be.false;
        })
        .catch(function(err) {
          expect(cfg.fnMakeQuery.calledOnce).to.be.false;
          expect(fnQueryOne.calledOnce).to.be.false;
          expect(err.__errors).to.deep.equal(['INVALID_ID']);
        })

        .finally(function() { testDone(); });      
    })
  });
  
});