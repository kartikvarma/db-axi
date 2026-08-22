import { AxiError } from 'axi-sdk-js';
import { EngineName, ConnectionConfig, SslMode } from './engines/types.js';
import { readEnv } from './env.js';

export const DEFAULT_PORTS: Record<EngineName, number> = {
  postgres: 5432,
  mysql: 3306,
  oracle: 1521,
};

const ENGINE_ALIASES: Record<string, EngineName> = {
  postgres: 'postgres',
  postgresql: 'postgres',
  pg: 'postgres',
  mysql: 'mysql',
  mariadb: 'mysql',
  oracle: 'oracle',
};

const SSL_MODES = new Set<SslMode>([
  'disable',
  'allow',
  'prefer',
  'require',
  'verify-ca',
  'verify-full',
]);

export function normalizeEngine(name: string): EngineName {
  const mapped = ENGINE_ALIASES[name.toLowerCase()];
  if (!mapped) {
    throw new AxiError(`unknown engine: ${name}`, 'VALIDATION_ERROR', [
      'Pass --engine [postgres|mysql|oracle]',
    ]);
  }
  return mapped;
}

export function parseSslMode(raw: string | boolean | undefined): SslMode | undefined {
  if (typeof raw !== 'string' || raw.length === 0) return undefined;
  const v = raw.toLowerCase() as SslMode;
  if (!SSL_MODES.has(v)) {
    throw new AxiError(`unknown sslmode: ${raw}`, 'VALIDATION_ERROR', [
      'Use --sslmode [disable|allow|prefer|require|verify-ca|verify-full]',
    ]);
  }
  return v;
}

export function inferEngine(input: {
  engineFlag?: string;
  urlScheme?: string;
  port?: number;
  envFamily?: EngineName;
  installed: EngineName[];
}): EngineName {
  if (input.engineFlag) return normalizeEngine(input.engineFlag);

  if (input.urlScheme) {
    const fromScheme = ENGINE_ALIASES[input.urlScheme.toLowerCase()];
    if (fromScheme) return fromScheme;
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

function sslModeFromUrl(u: URL): string | undefined {
  const sslmode = u.searchParams.get('sslmode') || u.searchParams.get('ssl-mode');
  if (sslmode) return sslmode;
  const ssl = u.searchParams.get('ssl');
  if (ssl === 'true' || ssl === '1') return 'require';
  if (ssl === 'false' || ssl === '0') return 'disable';
  return undefined;
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
  let urlSslMode: string | undefined;

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
      urlSslMode = sslModeFromUrl(u);
      // Intentionally ignore URL `options=` / extra libpq params (session GUC injection).
    } catch {
      // Ignore invalid URL, fallback to flags/env
    }
  }

  const sslMode =
    parseSslMode(flags.sslmode) ?? parseSslMode(urlSslMode) ?? parseSslMode(env.PGSSLMODE);

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
      ...(sslMode ? { sslMode } : {}),
    },
    rest,
  };
}
