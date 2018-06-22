'use strict';
var _ = require('lodash');
var PgPool = require('pg-pool');
var Promise = require('bluebird');
var path = require('path');
var sprintf = require('sprintf-js').sprintf;
var squel = require('squel');
var dbu = require('./databaseUtil.js');



/**
 * *NOTE:* Outside callers should use `DatabaseConnection.getConnection()`
 * to retrieve a connection instead of this constructor.
 *
 * Creates a new connection object with the given configuration.
 *
 * @class
 * @classdesc `DatabaseConnection` objects are configured to connect
 *    to a particular databse, and provide the ability to run
 *    queries on that database.
 *
 * @param {String} name
 * @param {DatabaseConnection~ConnectionConfig} config
 */
function DatabaseConnection(name, config) {
  this.__name = name;
  this.__config = config;
  this.__pool = null;
}



DatabaseConnection.__connections = {};



/**
 * This function retrieves a `DatabaseConnection` by name. If a `DatabaseConnection`
 * for the given name has already been created, that object will be returned. Otherwise,
 * a new `DatabaseConnection` object will be created and returned.
 *
 * @public
 * @param {String} name
 *
 * @param {String} mode
 *    Pass in `'standalone'` if the caller is running `database-util` as a standalone
 *    module -- that is, `database-util` is not being `require()`d by another module.
 *    This is typically only used by the automated tests within the `database-util`
 *    module.
 *
 *    The default value is `'asDependency'`, which is when the caller has `require()`d
 *    `database-util` as a dependency.
 *
 * @param {DatabaseConnection~ConnectionConfig} configOverride
 *    When passed in, the module will associate `name` with this configuration instead
 *    of trying to find a config file with that same name. Subsequent calls will still
 *    return this override configuration.
 *
 * @returns {DatabaseConnection}
 * @throws {Error} If a configuration file for `name` is not found.
 */
DatabaseConnection.getConnection = function getConnection(name, mode, configOverride) {
  var errStr, config, dbc;

  if (!mode) {
    mode = 'asDependency';
  }

  if (!DatabaseConnection.__connections.hasOwnProperty(name)) {
    if (configOverride) {
      config = configOverride;
    } else {
      config = DatabaseConnection.__loadConnectionConfigFromFile(name, mode);
    }

    dbc = new DatabaseConnection(name, config);
    dbc.__startPool(name, config.connection);
  
    DatabaseConnection.__connections[name] = dbc;
  }

  return DatabaseConnection.__connections[name];
};



/**
 * @typedef DatabaseConnection~ConfigOptions
 * @type Object
 *
 * @property {Boolean} verbose
 */



/**
 * @typedef DatabaseConnection~ConnectionDetails
 * @type Object
 *
 * @property {String} host
 * @property {Number} port
 *
 * @property {String} database
 *    Database name
 *
 * @property {String} user
 * @property {String} password
 *
 * @property {Number} max
 *    Maximum number of clients in the pool.
 *
 * @property {Number} idleTimeoutMillis
 *    How long a client is allowed to remain idle before
 *    being closed.
 */



/**
 * @typedef DatabaseConnection~ConnectionConfig
 * @type Object
 *
 * @property {DatabaseConnection~ConfigOptions} config
 *    Usage configuration defaults. For instance, `verbose` can be
 *    set as a default for the given connection.
 *
 * @property {DatabaseConnection~ConnectionDetails} connection
 *    The configuration data necessary to create a connection to the
 *    SQL server.
 */



/**
 * Loads connection data from a configuration file.
 *
 * @private
 * @param {String} name
 *
 * @param {String} mode
 *    See `mode` in `getConnection()`.
 *
 * @returns {DatabaseConnection~ConnectionConfig}
 */
DatabaseConnection.__loadConnectionConfigFromFile = function __loadConnectionConfigFromFile(name, mode) {
  var errStr, filename;

  if (mode === 'standalone') {
    filename = path.join(process.cwd(), 'config', sprintf('%s.js', name));
  } else {
    filename = path.join(process.cwd(), 'node_modules', 'metisoft-databaseUtil', 'config', sprintf('%s.js', name));
  }

  try {
    return require(filename);
  } catch(err) {
    errStr = "Configuration file not found: %s";
    throw new Error(sprintf(errStr, filename));
  }
};



/* Configuration */



/**
 * This function configures the module to be used in a certain environment.
 * It looks up settings for the given environment from the `config`
 * directory. To set configuration options directly, use `configDirectly()`.
 *
 * You only need to call this function once. After that, any future uses, even
 * from a separate file that has to `require` the module, will use
 * the same configuration settings.
 * 
 * @public
 *
 * @param {String} envName -
 *    The name of the environment to use connection settings for.
 *    The function will look for a file named `'../config/<envName>.js'`
 *    to load the settings from.
 *
 * @throws Will throw an error if the environment settings file can't be found.
 */
DatabaseConnection.prototype.configFromEnvSettings = function configFromEnvSettings(envName) {
  try {
    this.__config = require(sprintf('../config/%s.js', envName));
  } catch (err) {
    throw new Error(sprintf("Invalid environment name: '%s'", envName));
  }
};



/**
 * Starts a new pool with the given configuration options.
 *
 * @private
 *
 * @param {String} name
 * @param {DatabaseConnection~ConnectionDetails} connectionDetails
 */
DatabaseConnection.prototype.__startPool = function __startPool(name, connectionDetails) {
  var pool;

  connectionDetails['Promise'] = require('bluebird');
  pool = new PgPool(connectionDetails);

  pool.on('error', function(err, client) {
    console.error("[dbUtil] Idle client error.", err.message, err.stack);
  });

  pool.on('connect', function(client) {
    client.on('error', function(err) {
      console.log("[dbUtil] Client error. " + client.processID);
      console.error(err);
    });
  });

  this.__pool = pool;
  
  DatabaseConnection.__connections[name] = {
    pool: pool
  };
};



/* Querying */



/**
 * Dependency-injected version of `__simpleQuery()`. 
 *
 * @private
 * @param {PgPool} __pool
 *
 * @param {DatabaseConnection~ConfigOptions} __config
 *
 * @param {String} queryString -
 *    The raw SQL query.
 *
 * @param {Array} args -
 *    Parameterized values for the query.
 *
 * @return {QueryResults}
 */
DatabaseConnection.prototype.__DI_simpleQuery = function __DI_simpleQuery(__pool, __config, queryString, args) {
  var debug = __config.verbose || false,
      client,
      self = this;
  
  return __pool.connect()
    .then(function(c) {
      client = c;

      if (debug) {
        console.log('Executing query: ' + queryString);
      }

      if (!args) {
        args = [];
      } else if (debug) {
        console.log('With args:\n', args);
      }

      return self.__makeClientQueryPromise(client, queryString, args);
    })

    .then(function(result) {
      client.release();
      client = null;
      
      if (debug) {
        console.log('Query returned:');
        console.log(result);
      }

      return result;
    })

    .catch(function(err) {
      if (client) {
        client.release();
        client = null;
      }

      if (debug) {
        console.error('Error with query:\n', err);
      }

      throw err;
    })

    .finally(function() {
      if (client) {
        client.release();
      }
    });
};



/**
 * This function runs a query on the given client and returns the result as a Promise
 * rather than via a callback.
 *
 * The underlying database API (pg and pg-pool) apparently supports returning Promises
 * already, but I had issues getting it to work properly. Thus, we have this function
 * which manually creates a Promise from the callback version of calling the query function.
 *
 * @private
 * @param {PoolClient} client
 * @param {String} queryString
 * @param {Array} args
 * @returns {QueryResults}
 */
DatabaseConnection.prototype.__makeClientQueryPromise =
function __makeClientQueryPromise(client, queryString, args) {
  return new Promise(function(resolve, reject) {
    client.query(queryString, args, function(err, result) {
      if (err) {
        reject(err);
      } else {
        resolve(result);
      }
    });
  });
}



/**
 * This function runs a query on a new client from the pool and returns the client
 * to the pool immediately after. This function is recommended for simple queries
 * that are not part of a sequence of queries.
 *
 * @private
 *
 * @param {String} queryString
 * @param {Array<Any>} args
 *
 * @returns {Promise<QueryResults>}
 */
DatabaseConnection.prototype.__simpleQuery = function __simpleQuery(queryString, args) {
  return this.__DI_simpleQuery(this.__pool, this.__config.config, queryString, args);
};



/**
 * Dependency-injected version of `__queryWithClient()`.
 *
 * @private
 *
 * @param {DatabaseConnection~ConfigOptions} config
 * @param {String} queryString
 * @param {Array<Any>} args
 * @param {PoolClient} client
 *
 * @returns {Promise<QueryResults>}
 */
DatabaseConnection.prototype.__DI_queryWithClient = function __DI_queryWithClient(__config, queryString, args, client) {
  var debug = __config.verbose;

  if (debug) {
    console.log('Executing query: ' + queryString);
  }

  if (!args) {
    args = [];
  } else if (debug) {
    console.log('With args:\n', args);
  }

  return this.__makeClientQueryPromise(client, queryString, args)
  
    .then(function(result) {
      if (debug) {
        console.log('Query returned:\n', result);
      }

      return result;
    })

    .catch(function(err) {
      if (debug) {
        console.error('Error with query:\n', err);
      }

      throw err;
    });
};



/**
 * Runs a query on the database using the provided client object. See `query()`.
 *
 * @private
 *
 * @param {String} queryString
 * @param {Array<Any>} args
 * @param {PoolClient} client
 *
 * @returns {Promise<QueryResults>}
 */
DatabaseConnection.prototype.__queryWithClient = function __queryWithClient(queryString, args, client) {
  return this.__DI_queryWithClient(this.__config.config, queryString, args, client);
};



/**
 * @callback DatabaseConnection~fnQueryWithClient
 * @param {String} queryString
 * @param {Array<Any>} args
 * @param {PoolClient} client
 */
 
/**
 * @callback DatabaseConnection~fnQueryWithoutClient
 * @param {String} queryString
 * @param {Array<Any>} args
 */

/**
 * Dependency-injected version of `query()`.
 *
 * @private
 *
 * @param {DatabaseConnection~fnQueryWithClient} fnQueryWithClient
 * @param {DatabaseConnection~fnQueryWithoutClient} fnQueryWithoutClient
 * @param {String} queryString
 * @param {Array<Any>} args
 * @param {PoolClient} client
 *
 * @returns {Promise<QueryResults>}
 */
DatabaseConnection.prototype.__DI_query = function __DI_query(__fnQueryWithClient, __fnQueryWithoutClient, queryString, args, client) {
  if (client) {
    return __fnQueryWithClient(queryString, args, client);
  } else {
    return __fnQueryWithoutClient(queryString, args);
  }
};



/**
 * Runs a query on the database. There are two implementations of this function:
 * one that runs without a passed-in client object, and one that does.
 *
 * If you do not pass in a client, the function will pull one from the client pool
 * to run your query, and then return it when it's done. This is recommended for
 * queries that aren't part of a sequence of queries.
 *
 * If you do pass in a client, the function will use that client to run your query.
 * Use this functionality when you need to run a series of queries -- for instance,
 * Query A runs, which returns results used to build Query B. If you are using a
 * transaction, you must pass in a client.
 *
 * This function supports [parameterized queries][1].
 * [1]:https://github.com/brianc/node-postgres/wiki/Prepared-Statements
 *
 * @public
 *
 * @param {String} queryString
 *    The raw SQL query to send to the server. Can include `$1`, `$2`, etc.
 *    which will refer to elements of `args`. (Note that `$1` would refer to
 *    `args[0]`.)
 *
 * @param {Array} args
 *    For parameterized queries, this array should hold the values (arguments).
 *    Omit or pass in `[]` if you are not using a parameterized query.
 *
 * @param {PoolClient} client
 *    A client object returned by `getClient()`.
 *
 * @returns {Promise<QueryResults>} -
 *    The full results object returned by node-postgres.
 */
DatabaseConnection.prototype.query = function query(queryString, args, client) {
  return this.__DI_query(
    this.__queryWithClient.bind(this),
    this.__simpleQuery.bind(this),
    queryString,
    args,
    client
  );
};



/**
 * Dependency-injected version of `getClient()`.
 *
 * @private
 * @param {PgPool} __pool
 * @param {DatabaseConnection~ConnectionDetails} __connectionDetails
 * @returns {Promise<PoolClient>}
 */
DatabaseConnection.prototype.__DI_getClient = function __DI_getClient(__pool, __connectionDetails) {
  return __pool.connect()    
    .then(function(client) {
      return client;
    });
};



/**
 * Retrieves a client that can be used to execute a series of queries.
 *
 * @public
 * @returns {Promise<PoolClient>}
 */
DatabaseConnection.prototype.getClient = function getClient() {
  return this.__DI_getClient(this.__pool, this.__config.connection);
};



/**
 * Takes the results object of a query and returns just the rows from
 * those results. If there are no rows, `[]` is returned.
 *
 * @public
 * @param {QueryResults} queryResult
 * @returns {Array}
 */
DatabaseConnection.prototype.turnQueryResultIntoRows = function turnQueryResultIntoRows(queryResult) {
  if (_.has(queryResult, 'rows')) {
    return queryResult.rows;
  } else {
    return [];
  }
};



/**
 * Takes the resulting rows of a query and returns the first row.
 * Intended for use on queries where you expect to receive only
 * one row.
 *
 * @public
 * @param {Array} rows
 * @returns {Object}
 */
DatabaseConnection.prototype.turnRowsIntoSingleResult = function turnRowsIntoSingleResult(rows) {
  if (rows && rows.length > 0) {
    return rows[0];
  } else {
    return {};
  }
};



/**
 * @callback DatabaseConnection~fnQuery
 * @param {String} queryString
 * @param {Array<Any>} args
 * @param {PoolClient} client
 */



/**
 * Dependency-injected version of `queryReturningMany()`.
 *
 * @private
 *
 * @param {DatabaseConnection~fnQuery} __fnQuery
 * @param {String} queryString
 * @param {Array<Any>} args
 * @param {PoolClient} client
 *
 * @returns {Promise<Array>}
 */
DatabaseConnection.prototype.__DI_queryReturningMany = function __DI_queryReturningMany(__fnQuery, queryString, args, client) {
  return __fnQuery(queryString, args, client)
    .then(this.turnQueryResultIntoRows.bind(this));
};



/**
 * Runs a query using `query()`, but returns only the rows from the
 * results, instead of the full results object.
 *
 * @public
 *
 * @param {String} queryString
 * @param {Array} args
 * @param {PoolClient} client
 *
 * @returns {Array}
 */
DatabaseConnection.prototype.queryReturningMany = function queryReturningMany(queryString, args, client) {
  return this.__DI_queryReturningMany(this.query.bind(this), queryString, args, client);
};



/**
 * Dependency-injected version of `queryReturningOne()`.
 *
 * @private
 *
 * @param {DatabaseConnection~fnQuery} __fnQuery
 * @param {String} queryString
 * @param {Array<Any>} args
 * @param {PoolClient} client
 *
 * @returns {Promise<Object>}
 */
DatabaseConnection.prototype.__DI_queryReturningOne = function __DI_queryReturningOne(__fnQuery, queryString, args, client) {
  return __fnQuery(queryString, args, client)
    .then(this.turnQueryResultIntoRows.bind(this))
    .then(this.turnRowsIntoSingleResult.bind(this));
};



/**
 * Runs a query using `query()`, but returns only the first row from
 * the results, instead of the full results object. Intended for use
 * on queries that you expect to return only one row.
 *
 * @public
 *
 * @param {String} queryString
 * @param {Array} args
 * @param {PoolClient} client
 *
 * @returns {Array}
 */
DatabaseConnection.prototype.queryReturningOne = function queryReturningOne(queryString, args, client) {
  return this.__DI_queryReturningOne(this.query.bind(this), queryString, args, client);
};



/* Squel-specific */



/**
 * @typedef DatabaseConnection~SquelQuery
 * @type Object
 * @property {String} text -
 *              Parameterized SQL query.
 * @property {Array<Any>} values
 *              Parameter arguments.
 */



/**
 * Dependency-injected version of `__squelQuery()`.
 *
 * @private
 *
 * @param {DatabaseConnection~fnQuery} __fnQuery
 * @param {DatabaseConnection~SquelQuery} q
 * @param {PoolClient} client
 *
 * @returns {Promise<QueryResults>}
 */
DatabaseConnection.prototype.__DI_squelQuery = function __DI_squelQuery(__fnQuery, q, client) {
  var queryStr = q.text,
      args = q.values;
 
  if (!args) args = [];
  
  if (!queryStr) {
    return Promise.resolve([]);  
  } else {
    return __fnQuery(queryStr, args, client);
  }  
};



/**
 * Convenience function that runs a query using `query()` given the returned
 * object from a call to `.toParam()` on a Squel query object.
 *
 * @public
 *
 * @param {SquelToParam} q -
 *    Object with two properties. `text` holds the parameterized query,
 *    and `values` holds the array of arguments.
 * @param {PoolClient} client
 *
 * @returns {Promise<QueryResults>}
 */
DatabaseConnection.prototype.squelQuery = function squelQuery(q, client) {
  return this.__DI_squelQuery(this.query.bind(this), q, client);
};



/**
 * Same as `squelQuery()`, but returns only rows. See `queryReturningMany()`.
 *
 * @public
 */
DatabaseConnection.prototype.squelQueryReturningMany = function squelQueryReturningMany(q, client) {
  return this.squelQuery(q, client)
    .then(this.turnQueryResultIntoRows.bind(this));
};



/**
 * Same as `squelQuery()`, but returns only the first row. See `queryReturningOne()`.
 *
 * @public
 */
DatabaseConnection.prototype.squelQueryReturningOne = function squelQueryReturningOne(q, client) {
  return this.squelQueryReturningMany(q, client)
    .then(this.turnRowsIntoSingleResult.bind(this));
};



/**
 * Retrieves an object that defines the Metisoft default configuration options
 * for a Squel select query.
 *
 * @public
 * @returns {Object}
 */
DatabaseConnection.prototype.getDefaultSquelSelectOptions = function getDefaultSquelSelectOptions() {
  return {
    autoQuoteAliasNames: true,
    nameQuoteCharacter: '"',
    tableAliasQuoteCharacter: '"'
  };
};



/**
 * Convenience function that returns a Metisoft default Squel object.
 *
 * @public
 * @returns {Squel}
 */
DatabaseConnection.prototype.getSquel = function getSquel() {
  return squel.useFlavour('postgres');
};



/**
 * Convenience function that returns a Squel object with
 * a select query set up with Metisoft defaults.
 *
 * @public
 *
 * @param {Squel} squelObj -
 *    If you pass in a Squel object, the default select options
 *    will be added to that object instead of creating a new one.
 *
 * @returns {Squel}
 */
DatabaseConnection.prototype.getSquelSelect = function getSquelSelect(squelObj) {
  squelObj = squelObj || this.getSquel();
  return squelObj.select(this.getDefaultSquelSelectOptions());
};



/**
 * Convenience function that returns a Squel object with an insert query
 * set up with Metisoft defaults.
 *
 * @public
 *
 * @param {Squel} squelObj -
 *    If you pass in a Squel object, the default select options
 *    will be added to that object instead of creating a new one.
 *
 * @returns {Squel}
 */
DatabaseConnection.prototype.getSquelInsert = function getSquelInsert(squelObj) {
  squelObj = squelObj || this.getSquel();  
  return squelObj.insert({
    numberedParameters: true
  });
};



/**
 * This function validates the incoming request data from the client.
 * It should error out if the request is malformed.
 *
 * @callback DatabaseConnection~fnValidate
 *
 * @param {Request} req -
 *    The request object from the client.
 *
 * @param {String[]} errorCodes -
 *    Pass in an empty array. This function will fill it with
 *    error codes for the errors it encounters.
 *
 * @returns {Boolean} -
 *    `true` if validation succeeded; `false` otherwise.
 *    If `false`, `errorCodes` should have at least one element.
 */

/**
 * This function sanitizes the incoming request data from the client.
 *
 * @callback DatabaseConnection~fnSanitizeRequest
 *
 * @param {Request} req -
 *    The request object from the client.
 *
 * @returns {Request} -
 *    A request object, likely with fewer keys than `req`.
 */

/**
 * This function constructs a Squel query object from the given user data
 * and request.
 *
 * @callback DatabaseConnection~fnMakeQuery
 *
 * @param {UserData} userData -
 *    The data for the logged-in user.
 *
 * @param {Request} req -
 *    The request object from the client.
 *
 * @returns {Object} -
 *    A Squel query param object.
 */

/**
 * @typedef DatabaseConnection~runBasicServiceConfig
 *
 * @type Object
 *
 * @property {Object} userData
 * @property {Request} req
 *
 * @property {Object} errorCodeMap -
 *    The mapping of error codes to error messages for this service.
 *
 * @property {DatabaseConnection~fnValidate} fnValidate -
 *    Validation function.
 *
 * @property {DatabaseConnection~fnSanitizeRequest} fnSanitizeRequest -
 *    The function that will sanitize the incoming request object.
 *
 * @property {DatabaseConnection~fnMakeQuery} fnMakeQuery -
 *    The function that will construct a Squel query param object.
 *
 * @property {String} oneOrMany -
 *    Pass in `'one'` if the query should always return one result.
 *    Pass in `'many'` if the query may return multiple results.
 *
 * @property {PoolClient} client -
 *    If using the same client for multiple queries, pass it in here.
 */

/**
 * This function runs a service that follows a basic pattern of validation,
 * query construction, querying, and sending errors to the client.
 *
 * If your service always does the following, then consider using this function.
 * 1. Validates the client request object without querying the database.
 * 2. Executes a single query of the database.
 * 3. Passes error messages back to the client.
 *
 * @public
 *
 * @param {DatabaseConnection~runBasicServiceConfig} config
 *
 * @returns {Promise} -
 *    The result(s) of the query.
 */
DatabaseConnection.prototype.runBasicService = function runBasicService(config) {
  return this.__DI_runBasicService(
      config,
      this.squelQueryReturningOne.bind(this),
      this.squelQueryReturningMany.bind(this),
      dbu.convertErrorCodes2Messages
    );
};



/**
 * Dependency-injected version of `runBasicService()`.
 */
DatabaseConnection.prototype.__DI_runBasicService =
function __DI_runBasicService(config,
                              __fnSquelQueryReturningOne,
                              __fnSquelQueryReturningMany,
                              __fnConvertErrorCodes2Messages) {
  var errors = [],
      fnQuery,

      userData = config.userData,
      req = config.req,
      errorCodeMap = config.errorCodeMap,

      fnValidate = config.fnValidate,
      fnDbValidate = config.fnDbValidate,
      fnSanitizeRequest = config.fnSanitizeRequest,
      fnMakeQuery = config.fnMakeQuery,
      oneOrMany = config.oneOrMany,
      client,
      err;

  if (config.client) {
    client = config.client;
  } else if (config.configWithDone) {
    client = config.configWithDone.client;
  }

  if (oneOrMany === 'one') {
    fnQuery = __fnSquelQueryReturningOne;
  } else if (oneOrMany === 'many') {
    fnQuery = __fnSquelQueryReturningMany;
  }

  if (!fnDbValidate || !_.isFunction(fnDbValidate)) {
    fnDbValidate = function fnDbValidate(userData, req, client) {
      return Promise.resolve({});
    }
  }

  if (!fnQuery) {
    return Promise.resolve({})
      .then(function() {
        throw new Error('SERVER_REQUEST_ERROR');
      });
  }
  
  if (fnValidate(req, errors)) {
    if (fnSanitizeRequest && _.isFunction(fnSanitizeRequest)) {
      req = fnSanitizeRequest(req);
    }

    return fnDbValidate(userData, req, client)
      .then(function() {
        return fnQuery(fnMakeQuery(userData, req), client);
      });

  } else {
    return Promise.resolve({})
      .then(function() {
        err = new Error('VALIDATION_ERROR');
        err.__errors = errors;
        throw err;    
      });
  }
};



/**
 * Begins a transaction. Be sure to eventually call `commitTransaction()`
 * and/or `rollbackTransaction()`.
 *
 * @public
 * @param {PoolClient} client
 * @returns {Promise<Nothing>}
 */
DatabaseConnection.prototype.beginTransaction =
function beginTransaction(client) {
  return this.__makeClientQueryPromise(client, "BEGIN", []);
};



/**
 * Commits a transaction. `beginTransaction()` must be called at some
 * point before this call.
 *
 * @public
 * @param {PoolClient} client
 * @returns {Promise<Nothing>}
 */
DatabaseConnection.prototype.commitTransaction =
function commitTransaction(client) {
  return this.__makeClientQueryPromise(client, "COMMIT", []);
};



/**
 * Rolls back a transaction. `beginTransaction()` must be called at some
 * point before this call. Warning: This function will release the client
 * if the rollback fails, as not releasing the client after a failed rollback
 * can result in an invalid system state.
 *
 * @public
 * @param {PoolClient} client
 * @returns {Promise<Nothing>}
 */
DatabaseConnection.prototype.rollbackTransaction =
function rollbackTransaction(client) {
  return this.__makeClientQueryPromise(client, "ROLLBACK", [])
    .catch(function(err) {
      client.release();
    });
};



module.exports = exports = DatabaseConnection;