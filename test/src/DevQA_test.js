'use strict';

var _ = require('lodash');
var chai = require('chai');
var expect = chai.expect;
var assert = chai.assert;
var should = chai.should();
var sinon = require('sinon');
var Promise = require('bluebird');

var dbu = require('../../index.js').databaseUtil;

var pgMocks = require('./pg_mock.js');
var MockPg = pgMocks.MockPg;
var MockClient = pgMocks.MockClient;

var dbu = require('../../src/databaseUtil.js');
var dbc = require('../../src/DatabaseConnection.js');

describe('dev-qa databaseUtil Suite', function() {

  it("should convert sql name to Js name", function() {
    expect(dbu.sqlName2JsName('hello_world')).to.equal('helloWorld');
  });

  it('should convert camelCase to snake_case', function () {
    expect(dbu.jsName2SqlName('helloWorld')).to.equal('hello_world');   
    expect(dbu.jsName2SqlName('helloWorlD')).to.equal('hello_worl_d');
  });


  it('should generate correct like prefix conditions', function() {
    var retVal = dbu.genWhereLikePrefixConditions({
      firstName: 'AndyPandy',
      lastName: 'CottonCandy'
    }, []);

    var expectedValue = {
      conditions: [
        "\"first_name\" LIKE $1 || '%'",
        "\"last_name\" LIKE $2 || '%'"
      ],
      args: [
        'AndyPandy',
        'CottonCandy'
      ]
    };

    expect(retVal.conditions[0]).to.equal(expectedValue.conditions[0]);
    expect(retVal.conditions[1]).to.equal(expectedValue.conditions[1]);
    expect(retVal.args[0]).to.equal(expectedValue.args[0]);
    expect(retVal.args[1]).to.equal(expectedValue.args[1]);
  });

  it('should properly generate column list to column map', function() {
    var columnList = ['andy_pandy', 'stuff_and_things', 'hello_world'];

    var expected = {
      'andy_pandy': 'andyPandy',
      'stuff_and_things': 'stuffAndThings',
      'hello_world': 'helloWorld'
    };

    var retVal = dbu.columnList2ColumnMap(columnList);
    for (var key in retVal) {
      expect(expected.hasOwnProperty(key)).to.be.true;
      expect(retVal[key]).to.equal(expected[key]);
    }
  });
});