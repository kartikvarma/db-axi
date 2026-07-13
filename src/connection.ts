import { AxiError } from 'axi-sdk-js';
import { EngineName, ConnectionConfig } from './engines/types.js';
import { readEnv } from './env.js';

export const DEFAULT_PORTS: Record<EngineName, number> = {
  postgres: 5432,
  mysql: 3306,
  oracle: 1521,
};

export function inferEngine(input: {
  engineFlag?: string;
  urlScheme?: string;
  port?: number;
  envFamily?: EngineName;
  installed: EngineName[];
}): EngineName {
  if (input.engineFlag) return input.engineFlag as EngineName;
  
  if (input.urlScheme) {
    if (input.urlScheme === 'postgresql' || input.urlScheme === 'postgres') return 'postgres';
    if (input.urlScheme === 'mysql' || input.urlScheme === 'mariadb') return 'mysql';
    if (input.urlScheme === 'oracle') return 'oracle';
  }

  if (input.port) {
    for (const [engine, port] of Object.entries(DEFAULT_PORTS)) {
      if (input.port === port) return engine as EngineName;
    }
  }

  if (input.envFamily) return input.envFamily;

  if (input.installed.length === 1) return input.installed[0];

  throw new AxiError('cannot infer database engine — use --engine', 'ENGINE_AMBIGUOUS', [
    'Pass --engine [postgres|mysql|oracle]',
    'Or use a URL with scheme (e.g. postgresql://...)',
  ]);
}

export function resolveConnection(
  positionals: string[],
  flags: Record<string, string | boolean>,
  env: NodeJS.ProcessEnv,
  installed: EngineName[],
): { config: ConnectionConfig; rest: string[] } {
  const envConn = readEnv(env);
  let rest = positionals;

  let urlStr = (flags.url as string) || envConn.url;
  if (!urlStr && positionals.length > 0 && positionals[0].includes('://')) {
    urlStr = positionals[0];
    rest = positionals.slice(1);
  }

  let scheme: string | undefined;
  let host = (flags.host as string) || envConn.host;
  let portStr = (flags.port as string) || envConn.port;
  let user = (flags.user as string) || envConn.user;
  let password = (flags.password as string) || envConn.password;
  let database = (flags.database as string) || (flags.db as string) || envConn.database;

  if (urlStr) {
    try {
      const u = new URL(urlStr);
      scheme = u.protocol.replace(':', '');
      host = host || u.hostname;
      if (u.port) portStr = portStr || u.port;
      user = user || u.username;
      password = password || u.password;
      if (u.pathname && u.pathname !== '/') {
        database = database || u.pathname.slice(1);
      }
    } catch {
      // Ignore invalid URL, fallback to flags/env
    }
  }

  const port = portStr ? Number.parseInt(portStr, 10) : undefined;
  const engine = inferEngine({
    engineFlag: flags.engine as string,
    urlScheme: scheme,
    port,
    envFamily: envConn.engine,
    installed,
  });

  if (!host) host = 'localhost';
  if (!user) {
    throw new AxiError('database user is required', 'VALIDATION_ERROR', [
      'Pass --user <name> or use a URL with userinfo',
    ]);
  }

  return {
    config: {
      engine,
      host,
      port: port || DEFAULT_PORTS[engine],
      user,
      password: password || undefined,
      database: database || undefined,
    },
    rest,
  };
}
