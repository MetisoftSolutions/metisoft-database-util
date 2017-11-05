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

describe('databaseUtil suite', function() {
  
  describe("SQL/JS name converter suite", function() {
    var testSet = [
          {
            sqlName: 'qstnr_id',
            jsName: 'qstnrId'
          },
          {
            sqlName: 'crm',
            jsName: 'crm'
          },
          {
            sqlName: 'really_long_column_name',
            jsName: 'reallyLongColumnName'
          },
          {
            sqlName: '',
            jsName: ''
          },
          {
            sqlName: '1',
            jsName: '1'
          },
          {
            sqlName: 'zip_code_5',
            jsName: 'zipCode5'
          },
          {
            sqlName: 'column_name_123',
            jsName: 'columnName123'
          },
          {
            sqlName: 'column_123_name',
            jsName: 'column123Name'
          }
        ];
    
    
    testSet.forEach(function(test) {
      it("should convert an SQL name to a JS name correctly", function() {
        var actual = dbu.sqlName2JsName(test.sqlName);
        expect(actual).to.equal(test.jsName);
      });
      
      it("should convert a JS name to an SQL name correctly", function() {
        var actual = dbu.jsName2SqlName(test.jsName);
        expect(actual).to.equal(test.sqlName);
      });
      
      it("should convert back and forth to the same thing", function() {
        var secondRoundJsName,
            secondRoundSqlName;
        
        secondRoundJsName = dbu.sqlName2JsName(dbu.jsName2SqlName(test.jsName));
        expect(secondRoundJsName).to.equal(test.jsName);
        
        secondRoundSqlName = dbu.jsName2SqlName(dbu.sqlName2JsName(test.sqlName));
        expect(secondRoundSqlName).to.equal(test.sqlName);
      });
    });    
  });
  
  
  
  describe("cleanStringForLike() suite", function() {
    var testSet = [
          {
            str: 'normal string',
            expected: 'normal string'
          },
          {
            str: '',
            expected: ''
          },
          {
            str: 'string % with % percent chars',
            expected: 'string  with  percent chars'
          },
          {
            str: 'string ___ under _ sco_res',
            expected: 'string  under  scores'
          },
          {
            str: '%%_both_%%',
            expected: 'both'
          },
          {
            str: '%%%%',
            expected: ''
          },
          {
            str: '__',
            expected: ''
          }
        ];
    
    testSet.forEach(function(test) {
      it("should clean the string properly", function() {
        var actual = dbu.cleanStringForLike(test.str);
        expect(actual).to.equal(test.expected);
      });      
    });
  });
  
  
  
  describe("genWhereLikePrefixConditions() suite", function() {
    var testSet = [
          {
            criteria: {
              firstName: 'Ja',
              lastName: 'Br'
            },
            args: [],
            expected: {
              conditions: [
                "\"first_name\" LIKE $1 || '%'",
                "\"last_name\" LIKE $2 || '%'"
              ],
              args: ['Ja', 'Br']
            }
          },
          {
            criteria: {
              zipCode5: '53711',
              zipCode4: '47'
            },
            args: ['already', 'got', 'some', 'args'],
            expected: {
              conditions: [
                "\"zip_code_5\" LIKE $5 || '%'",
                "\"zip_code_4\" LIKE $6 || '%'"
              ],
              args: ['already', 'got', 'some', 'args', '53711', '47']
            }
          },
          {
            criteria: {},
            args: [],
            expected: {
              conditions: [],
              args: []
            }
          }
        ];
        
    testSet.forEach(function(test) {
      it("should generate the conditions and args correctly", function() {
        var actual = dbu.genWhereLikePrefixConditions(test.criteria, test.args);        
        expect(actual).to.deep.equal(test.expected);
      });
    });
  });



  describe("columnList2ColumnMap() suite", function() {
    var testSet = [
          {
            columnList: [],
            expected: {}
          },
          
          {
            columnList: [
              'id'
            ],
            expected: {
              'id': 'id'
            }
          },

          {
            columnList: [
              'lots_of_under_scores',
              'id'
            ],
            expected: {
              'lots_of_under_scores': 'lotsOfUnderScores',
              'id': 'id'
            }
          },
          
          {
            columnList: [
              'id',
              'meta_entry_user_id',
              'meta_entry_user_company_id',
              'zip_code_5_and_4',
              'is_template'
            ],
            expected: {
              'id': 'id',
              'meta_entry_user_id': 'metaEntryUserId',
              'meta_entry_user_company_id': 'metaEntryUserCompanyId',
              'zip_code_5_and_4': 'zipCode5And4',
              'is_template': 'isTemplate'
            }
          }
        ];

    testSet.forEach(function(test) {
      it("should create the correct map", function() {
        var actual = dbu.columnList2ColumnMap(test.columnList);
        expect(actual).to.deep.equal(test.expected);
      });
    });
  });



  describe("newValidateByIdsFunc() suite", function() {
    var invalidReqErrorCode = 'INVALID_REQUEST',

        testSet = [
          {
            req: {},
            expected: {
              errorCodes: [invalidReqErrorCode],
              retVal: false
            }
          },

          {
            req: {
              id: 47
            },
            expected: {
              errorCodes: [invalidReqErrorCode],
              retVal: false
            }
          },

          {
            req: {
              ids: []
            },
            expected: {
              errorCodes: [],
              retVal: true
            }
          },

          {
            req: {
              ids: [47, 'not an ID', 'these are strings']
            },
            expected: {
              errorCodes: [invalidReqErrorCode],
              retVal: false
            }
          },

          {
            req: {
              ids: [47]
            },
            expected: {
              errorCodes: [],
              retVal: true
            }
          },

          {
            req: {
              ids: [100, 1073, 87]
            },
            expected: {
              errorCodes: [],
              retVal: true
            }
          },

          {
            req: {
              ids: [-100, 1073, 87]
            },
            expected: {
              errorCodes: [invalidReqErrorCode],
              retVal: false
            }
          },

          {
            req: {
              ids: [100.1, 1073, 87]
            },
            expected: {
              errorCodes: [invalidReqErrorCode],
              retVal: false
            }
          },

          {
            req: {
              ids: [0]
            },
            expected: {
              errorCodes: [invalidReqErrorCode],
              retVal: false
            }
          }
        ];

    testSet.forEach(function(test) {
      it("should validate properly", function() {
        var fn = dbu.newValidateByIdsFunc(invalidReqErrorCode),
            errorCodes = [],
            actual = fn(test.req, errorCodes);

        expect(actual).to.equal(test.expected.retVal);
        expect(errorCodes).to.deep.equal(test.expected.errorCodes);
      });
    });
  });



  describe("hasNonEmptyStringProp() suite", function() {
    var obj = {
          name: 'derefed',
          propertyAddress: '917 N Southern Dr',
          emptyString: '',
          someNumber: 47
        },

        testSet = [
          {
            obj: obj,
            prop: 'name',
            expected: true
          },
          {
            obj: obj,
            prop: 'propertyAddress',
            expected: true
          },
          {
            obj: obj,
            prop: 'emptyString',
            expected: false
          },
          {
            obj: obj,
            prop: 'someNumber',
            expected: false
          },
          {
            obj: obj,
            prop: 'noSuchKey',
            expected: false
          }
        ];

    testSet.forEach(function(test) {
      it("should find non-empty strings properly", function() {
        var actual = dbu.hasNonEmptyStringProp(test.obj, test.prop);
        expect(actual).to.equal(test.expected);
      });
    });
  });



  describe("convertErrorCodes2Messages() suite", function() {
    var errorCodeMap = {
          INVALID_ID: "Invalid ID.",
          NO_USERNAME_GIVEN: "No username given.",
          MALFORMED_URL: "Malformed URL.",
          NOT_ENOUGH_CRITERIA: "Not enough criteria. Please enter more criteria."
        },

        testSet = [
          {
            codeMap: errorCodeMap,
            errorCodes: [],
            expected: {}
          },
          {
            codeMap: errorCodeMap,
            errorCodes: [
              'INVALID_ID'
            ],
            expected: {
              'INVALID_ID': errorCodeMap.INVALID_ID
            }
          },
          {
            codeMap: errorCodeMap,
            errorCodes: [
              'INVALID_ID',
              'MALFORMED_URL'
            ],
            expected: {
              'INVALID_ID': errorCodeMap.INVALID_ID,
              'MALFORMED_URL': errorCodeMap.MALFORMED_URL
            }
          },
          {
            codeMap: errorCodeMap,
            errorCodes: [
              'NOT_ENOUGH_CRITERIA',
              'INVALID_ID',
              'NO_USERNAME_GIVEN'
            ],
            expected: {
              'NOT_ENOUGH_CRITERIA': errorCodeMap.NOT_ENOUGH_CRITERIA,
              'INVALID_ID': errorCodeMap.INVALID_ID,
              'NO_USERNAME_GIVEN': errorCodeMap.NO_USERNAME_GIVEN
            }
          },
          {
            codeMap: errorCodeMap,
            errorCodes: [
              'NOT_ENOUGH_CRITERIA',
              'NO_SUCH_CODE',
              'INVALID_ID'
            ],
            expected: {
              'NOT_ENOUGH_CRITERIA': errorCodeMap.NOT_ENOUGH_CRITERIA,
              'INVALID_ID': errorCodeMap.INVALID_ID
            }
          },
        ];

    testSet.forEach(function(test) {
      it("should map to the correct messages properly", function() {
        var actual = dbu.convertErrorCodes2Map(test.codeMap, test.errorCodes);
        expect(actual).to.deep.equal(test.expected);
      });
    });
  });
  
});




























