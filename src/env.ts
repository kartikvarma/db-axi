import { EngineName } from './engines/types.js';

export interface EnvConn {
  engine?: EngineName;
  host?: string;
  port?: string;
  user?: string;
  password?: string;
  database?: string;
  url?: string;
}

interface FamilyFields {
  engine: EngineName;
  host?: string;
  port?: string;
  user?: string;
  password?: string;
  database?: string;
}

function readPg(env: NodeJS.ProcessEnv): FamilyFields | null {
  if (!(env.PGHOST || env.PGPORT || env.PGUSER || env.PGPASSWORD || env.PGDATABASE)) {
    return null;
  }
  return {
    engine: 'postgres',
    host: env.PGHOST,
    port: env.PGPORT,
    user: env.PGUSER,
    password: env.PGPASSWORD,
    database: env.PGDATABASE,
  };
}

function readMysql(env: NodeJS.ProcessEnv): FamilyFields | null {
  if (
    !(
      env.MYSQL_HOST ||
      env.MYSQL_PORT ||
      env.MYSQL_USER ||
      env.MYSQL_PASSWORD ||
      env.MYSQL_DATABASE
    )
  ) {
    return null;
  }
  return {
    engine: 'mysql',
    host: env.MYSQL_HOST,
    port: env.MYSQL_PORT,
    user: env.MYSQL_USER,
    password: env.MYSQL_PASSWORD,
    database: env.MYSQL_DATABASE,
  };
}

function readOracle(env: NodeJS.ProcessEnv): FamilyFields | null {
  if (
    !(
      env.ORACLE_HOST ||
      env.ORACLE_PORT ||
      env.ORACLE_USER ||
      env.ORACLE_PASSWORD ||
      env.ORACLE_DATABASE
    )
  ) {
    return null;
  }
  return {
    engine: 'oracle',
    host: env.ORACLE_HOST,
    port: env.ORACLE_PORT,
    user: env.ORACLE_USER,
    password: env.ORACLE_PASSWORD,
    database: env.ORACLE_DATABASE,
  };
}

/**
 * Merge DATABASE_URL + dialect families.
 * Precedence when several families present: do not mix hosts;
 * apply the first family in order PG → MYSQL → ORACLE for field defaults,
 * but set `engine` only when exactly one family is present (or URL will infer).
 */
export function readEnv(env: NodeJS.ProcessEnv): EnvConn {
  const result: EnvConn = {};

  if (env.DATABASE_URL) result.url = env.DATABASE_URL;

  const families = [readPg(env), readMysql(env), readOracle(env)].filter(
    (f): f is FamilyFields => f !== null,
  );

  if (families.length === 0) return result;

  if (families.length === 1) {
    const f = families[0];
    result.engine = f.engine;
    if (f.host) result.host = f.host;
    if (f.port) result.port = f.port;
    if (f.user) result.user = f.user;
    if (f.password) result.password = f.password;
    if (f.database) result.database = f.database;
    return result;
  }

  // Multiple families: use deterministic first family for fields only when no URL,
  // and do not set engine (caller must use --engine / URL / port).
  if (!result.url) {
    const f = families[0];
    if (f.host) result.host = f.host;
    if (f.port) result.port = f.port;
    if (f.user) result.user = f.user;
    if (f.password) result.password = f.password;
    if (f.database) result.database = f.database;
  }

  return result;
}
