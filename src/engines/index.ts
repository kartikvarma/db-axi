import { AxiError } from 'axi-sdk-js';
import { EngineName, Engine } from './types.js';

const DRIVER_PACKAGES: Record<EngineName, string> = {
  postgres: 'pg',
  mysql: 'mysql2',
  oracle: 'oracledb',
};

export function installedEngines(): EngineName[] {
  const engines: EngineName[] = [];
  for (const [name, pkg] of Object.entries(DRIVER_PACKAGES)) {
    try {
      // Use import.meta.resolve or try-require style logic for checking presence
      // For Node, we can try to resolve the entry point
      import.meta.resolve(pkg);
      engines.push(name as EngineName);
    } catch {
      // Not installed
    }
  }
  return engines;
}

export async function getEngine(name: EngineName): Promise<Engine> {
  try {
    switch (name) {
      case 'postgres': return (await import('./postgres.js')).postgresEngine;
      case 'mysql': return (await import('./mysql.js')).mysqlEngine;
      case 'oracle': return (await import('./oracle.js')).oracleEngine;
      default: throw new Error(`Unknown engine: ${name}`);
    }
  } catch (err: any) {
    if (err.code === 'ERR_MODULE_NOT_FOUND' || err.message?.includes('Cannot find module')) {
      const pkg = DRIVER_PACKAGES[name];
      throw new AxiError(
        `driver for ${name} is not installed`,
        'DRIVER_MISSING',
        [`Install it: npm install ${pkg}`]
      );
    }
    throw err;
  }
}
