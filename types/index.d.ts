import pg = require('pg');
import pgPool = require('pg-pool');
import express = require('express');
import * as Promise from 'bluebird';



/* Object interfaces */

declare interface ConfigOptions {
  verbose: boolean
}

declare interface ConnectionDetails {
  host: string,
  port: number,
  database: string,
  user: string,
  password: string,
  max: number,
  idleTimeoutMillis: number
}

declare interface ConnectionConfig {
  config: ConfigOptions,
  connection: ConnectionDetails
}

declare interface RunBasicServiceConfig {
  userData: object,
  req: express.Request,
  errorCodeMap: object,
  fnValidate: fnValidate,
  fnSanitizeRequest: fnSanitizeRequest,
  fnMakeQuery: fnMakeQuery,
  oneOrMany: string,
  client?: pg.PoolClient
}

declare interface SquelQuery {
  text: string,
  values: any[]
}



/* Function signature interfaces */

declare interface fnQuery {
  (
    queryString: string,
    args: any[],
    client?: pg.PoolClient
  ): Promise<pg.QueryResult[]>;
}

declare interface fnValidate {
  (
    req: express.Request,
    errorCodes: string[]
  ): boolean;
}

declare interface fnSanitizeRequest {
  (
    req: express.Request
  ): express.Request;
}

declare interface fnMakeQuery {
  (
    userData: object,
    req: express.Request
  ): object;
}

declare interface fnSquelQueryReturningOne {
  (
    q: SquelQuery,
    client?: pg.PoolClient
  ): Promise<any>;
}

declare interface fnSquelQueryReturningMany {
  (
    q: SquelQuery,
    client?: pg.PoolClient
  ): Promise<any[]>;
}

declare interface fnValidateByIds {
  (
    req: express.Request,
    errorCodes: string[]
  ): boolean;
}



/* Classes */

declare class DatabaseConnection {
  constructor(
    name: string,
    config: ConnectionConfig
  );

  static getConnection(
    name: string,
    mode?: string,
    configOverride?: ConnectionConfig
  ): DatabaseConnection;
  
  private static __loadConnectionConfigFromFile(
    name: string,
    mode: string
  ): ConnectionConfig;

  configFromEnvSettings(
    envName: string
  ): void;

  private __startPool(
    name: string,
    connectionDetails: ConnectionDetails
  ): void;
  
  private __DI_simpleQuery(
    __pool: pgPool.Pool,
    __config: ConfigOptions,
    queryString: string,
    args: any[]
  ): Promise<pg.QueryResult[]>;

  private __makeClientQueryPromise(
    client: pg.PoolClient,
    queryString: string,
    args: any[]
  ): Promise<pg.QueryResult[]>;

  private __simpleQuery(
    queryString: string,
    args: any[]
  ): Promise<pg.QueryResult[]>;

  private __DI_queryWithClient(
    __config: ConfigOptions,
    queryString: string,
    args: any[],
    client?: pg.PoolClient
  ): Promise<pg.QueryResult[]>;

  private __queryWithClient(
    queryString: string,
    args: any[],
    client?: pg.PoolClient
  ): Promise<pg.QueryResult[]>;

  private __DI_query(
    __fnQueryWithClient: (
      queryString: string,
      args: any[],
      client?: pg.PoolClient
    ) => Promise<pg.QueryResult[]>,
    __fnQueryWithoutClient: (
      queryString: string,
      args: any[]
    ) => Promise<pg.QueryResult[]>,
    queryString: string,
    args: any[],
    client?: pg.PoolClient
  ): Promise<pg.QueryResult[]>;

  query(
    queryString: string,
    args: any[],
    client?: pg.PoolClient
  ): Promise<pg.QueryResult[]>;

  private __DI_getClient(
    __pool: pgPool.Pool,
    __connectionDetails: ConnectionDetails
  ): Promise<pg.PoolClient>;

  getClient(): Promise<pg.PoolClient>;

  turnQueryResultIntoRows(
    queryResult: Promise<pg.QueryResult[]>
  ): any[];

  turnRowsIntoSingleResult(
    rows: any[]
  ): object;

  private __DI_queryReturningMany(
    __fnQuery: fnQuery,
    queryString: string,
    args: any[],
    client?: pg.PoolClient
  ): Promise<any[]>;

  queryReturningMany(
    queryString: string,
    args: any[],
    client?: pg.PoolClient
  ): Promise<any[]>;

  private __DI_queryReturningOne(
    __fnQuery: fnQuery,
    queryString: string,
    args: any[],
    client?: pg.PoolClient
  ): Promise<object>;

  queryReturningOne(
    queryString: string,
    args: any[],
    client?: pg.PoolClient
  ): Promise<object>;

  private __DI_squelQuery(
    __fnQuery: fnQuery,
    q: SquelQuery,
    client?: pg.PoolClient
  ): Promise<pg.QueryResult[]>;

  squelQuery(
    q: SquelQuery,
    client?: pg.PoolClient
  ): Promise<pg.QueryResult[]>;

  squelQueryReturningMany(
    q: SquelQuery,
    client?: pg.PoolClient
  ): Promise<any[]>;

  squelQueryReturningOne: fnSquelQueryReturningOne;

  getDefaultSquelSelectOptions(): object;

  getSquel(): object; // Really should be a Squel object, but typings don't exist yet for Squel

  getSquelSelect(
    squelObj?: object
  ): object;

  getSquelInsert(
    squelObj?: object
  ): object;

  runBasicService(
    config: RunBasicServiceConfig
  ): Promise<any[] | object>;

  private __DI_runBasicService(
    config: RunBasicServiceConfig,
    __fnSquelQueryReturningOne: fnSquelQueryReturningOne,
    __fnSquelQueryReturningMany: fnSquelQueryReturningMany,
    __fnConvertErrorCodes2Messages: (str: string) => string
  ): Promise<any[] | object>;

  beginTransaction(
    client: pg.PoolClient
  ): Promise<void>;

  commitTransaction(
    client: pg.PoolClient
  ): Promise<void>;

  rollbackTransaction(
    client: pg.PoolClient
  ): Promise<void>;
}

declare namespace databaseUtil {
  function sqlName2JsName(
    name: string
  ): string;

  function jsName2SqlName(
    name: string
  ): string;

  function cleanStringForLike(
    str: string
  ): string;

  function genWhereLikePrefixConditions(
    criteria: object,
    args: any[]
  ): {
    conditions: string[],
    args: any[]
  };

  function columnList2ColumnMap(
    columnList: string[]
  ): object;

  function newValidateByIdsFunc(
    invalidReqErrorCode: string
  ): fnValidateByIds;

  function hasNonEmptyStringProp(
    obj: object,
    prop: string
  ): boolean;

  function convertErrorCodes2Map(
    codeMap: object,
    errorCodes: string[]
  ): object;
}