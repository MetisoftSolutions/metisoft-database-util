'use strict';
var _ = require('lodash');
var pg = require('pg');
var Validator = require('jsonschema').Validator;
var sprintf = require('sprintf-js').sprintf;
var squel = require('squel');

var ModuleExporter = require('metisoft-module-exporter').ModuleExporter;
var m = new ModuleExporter();



/** @module databaseUtil */



/**
 * Converts an SQL-style name to a JavaScript-style name.
 *
 * Examples:
 * - `really_long_column_name` &rarr; `reallyLongColumnName`
 * - `zip_code_5` &rarr; `zipCode5`
 * - `numbers_in_123_the_middle` &rarr; `numbersIn123TheMiddle`
 *
 * @memberof module:databaseUtil
 * @param {String} name
 * @returns {String}
 */
function sqlName2JsName(name) {
  var underscoreRegex = /\_/g,
      match,
      underscoreIndex,
      wordInitial = '';
      
  while ((match = underscoreRegex.exec(name)) !== null) {
    underscoreIndex = match.index;
    
    if (underscoreIndex + 1 < name.length) {
      wordInitial = name[underscoreIndex+1];
      wordInitial = wordInitial.toUpperCase();
    }
    
    name = name.slice(0, underscoreIndex) + wordInitial + name.slice(underscoreIndex+2);
  }
  
  return name;
}
m.$$public(sqlName2JsName);



/**
 * Converts a JavaScript-style name to an SQL-style name. Reverse operation
 * of `sqlName2JsName()`. See that function for examples.
 *
 * @memberof module:databaseUtil
 * @param {String} name
 * @returns {String}
 */
function jsName2SqlName(name) {
  var upperCaseRegex = /[A-Z]/g,
      firstNumeralRegex = /[0-9][0-9]*/g,
      match,
      upperCaseIndex,
      wordInitial = '';
  
  function spliceInUnderscore(index, regex) {
    if (index !== 0) {
      upperCaseIndex = index;
      wordInitial = name[upperCaseIndex].toLowerCase();
      name = name.slice(0, upperCaseIndex) + '_' + wordInitial + name.slice(upperCaseIndex+1);
      regex.lastIndex++;
    }
  }
      
  while ((match = upperCaseRegex.exec(name)) !== null) {
    spliceInUnderscore(match.index, upperCaseRegex);
  }
  while ((match = firstNumeralRegex.exec(name)) !== null) {
    spliceInUnderscore(match.index, firstNumeralRegex);
  }
  
  return name;
}
m.$$public(jsName2SqlName);



/**
 * Prepares a string for use in an SQL `LIKE` expression by removing
 * all occurrences of `%` and `_`.
 *
 * @memberof module:databaseUtil
 * @param {String} str
 * @returns {String}
 */
function cleanStringForLike(str) {
  if (!_.isString(str)) return '';
  
  str = str.replace(/\%/g, '');
  str = str.replace(/\_/g, '');
  
  return str;
}
m.$$public(cleanStringForLike);



/**
 * Given a set of name/value pairs, this function will generate a list of
 * `WHERE ... LIKE` clauses.
 *
 * For each `columnName` (key) / `prefix` (value) pair in `criteria`, a
 * string `cond` is generated such that `cond` is a `WHERE ... LIKE` clause
 * that attempts to match rows where `prefix` is the prefix of a string in
 * the `columnName` column. The function returns a list of all conditions.
 *
 * Please note that JavaScript-style names should be used for keys in `criteria`.
 * They will be automatically converted to SQL-style names.
 *
 * Example: If `criteria` is
 * ```
 * {firstName: 'Ja', lastName: 'Br'}
 * ```
 * and `args` is
 * ```
 * []
 * ```
 * the output should be
 * ```
 * {
 *    conditions: [
 *      "\"first_name\" LIKE $1 || '%'",
 *      "\"last_name\" LIKE $2 || '%'"
 *    ],
 *    args: [
 *      'Ja',
 *      'Br'
 *    ]
 * }
 * ```
 *
 * @memberof module:databaseUtil
 *
 * @param {Object} criteria
 *    An object where each key is a column name given in JavaScript-style
 *    and each value is a prefix of a string to match on that column.
 *
 * @param {Array<Any>} args
 *    A parameterized query arguments array to build upon. This array will
 *    not be mutated. A copy of the array with the new elements added will
 *    be returned in the return object.
 *
 * @returns {Object}
 * - `conditions` - An array of strings where each element is a condition.
 * - `args` - The new array of arguments. Includes the elements from the parameter `args`.
 */
function genWhereLikePrefixConditions(criteria, args) {
  var sqlField = '',
      argNumber,
      condStr = '',
      conditions = [];
  
  if (!args)
    args = [];
  else
    args = _.cloneDeep(args);
  
  argNumber = args.length;
  
  _.forEach(criteria, function(value, field) {
    if (_.isString(value)) {        
      sqlField = jsName2SqlName(field);
      condStr = sprintf("\"%s\" LIKE $%i || '%%'", sqlField, ++argNumber);
      conditions.push(condStr);
      args.push(value);
    }
  });
  
  return {
    conditions: conditions,
    args: args
  };
}
m.$$public(genWhereLikePrefixConditions);



/**
 * This function takes a list of SQL column names and returns a mapping from
 * SQL column names to JS names.
 *
 * Example: If `columnList` is given as:
 * ```
 * [
 *    'id',
 *    'meta_entry_user_id',
 *    'meta_entry_user_company_id',
 *    'is_template'
 * ]
 * ```
 * then the return value will be:
 * ```
 * {
 *    'id': 'id',
 *    'meta_entry_user_id': 'metaEntryUserId',
 *    'meta_entry_user_company_id': 'metaEntryUserCompanyId',
 *    'is_template': 'isTemplate'
 * }
 * ```
 *
 * @memberof module:databaseUtil
 * @public
 *
 * @param {String[]} columnList
 *    An array of SQL column names, as they appear in the actual tables.
 *
 * @returns {Object}
 *    A mapping from SQL column name to its equivalent in JS naming conventions.
 */
function columnList2ColumnMap(columnList) {
  return _.reduce(columnList, function(result, sqlName) {
    result[sqlName] = sqlName2JsName(sqlName);
    return result;
  }, {});
}
m.$$public(columnList2ColumnMap);



/**
 * Validates the input for `byIds()`. `req` must have
 * an `ids` key that maps to an array of integers.
 *
 * @callback module:databaseUtil~validateByIds
 * @param {Object} req
 *
 * @param {String[]} errorCodes
 *    Returns error codes to document the reasons why validation failed.
 *
 * @returns {Boolean}
 *    `true` if validation succeeded; `false` otherwise.
 */

/**
 * Returns a function that validates the input for a `byIds()` service.
 * 
 * @memberof module:databaseUtil
 * @public
 *
 * @param {String} invalidReqErrorCode
 *    The error code to use if validation determines an invalid request was given.
 *
 * @returns {module:databaseUtil~validateByIds}
 */
 function newValidateByIdsFunc(invalidReqErrorCode) {
  return function validateByIds(req, errorCodes) {
    var v = new Validator(),
        result,

        schema = {
          type: 'object',
          required: true,
          properties: {
            'ids': {
              type: 'array',
              required: true,
              items: {
                type: 'integer',
                minimum: 1
              }
            }
          }
        };

    result = v.validate(req, schema);
    if (result.errors.length > 0) {
      errorCodes.push(invalidReqErrorCode);
      return false;
    } else {
      return true;
    }
  };
}
m.$$public(newValidateByIdsFunc);



/**
 * Convenience function to check that the given property in the given
 * object has a non-empty string value.
 *
 * @memberof module:databaseUtil
 * @public
 *
 * @param {Object} obj
 *    The object to check.
 *
 * @param {String} prop
 *    The property to check for.
 *
 * @returns {Boolean}
 *    `true` if the property has a non-empty string value;
 *    `false` otherwise.
 */
function hasNonEmptyStringProp(obj, prop) {
  if (obj.hasOwnProperty(prop)
      && _.isString(obj[prop])
      && obj[prop] !== '') {
    return true;
  } else {
    return false;
  }
};
m.$$public(hasNonEmptyStringProp);



/**
 * This function takes a list of error codes and returns a mapping
 * from those error codes to human-readable error messages.
 *
 * @memberof module:databaseUtil
 * @public
 *
 * @param {Object} codeMap
 * @param {String[]} errorCodes
 *
 * @returns {Object}
 *    A mapping from error codes to error messages.
 *
 */
function convertErrorCodes2Map(codeMap, errorCodes) {
  var msgMap;

  msgMap = _.reduce(errorCodes, function(result, errorCode) {
    if (codeMap.hasOwnProperty(errorCode) && _.isString(codeMap[errorCode])) {
      result[errorCode] = codeMap[errorCode];
    }
    return result;
  }, {});

  return msgMap;
};
m.$$public(convertErrorCodes2Map);



module.exports = exports = m.$$getExports();