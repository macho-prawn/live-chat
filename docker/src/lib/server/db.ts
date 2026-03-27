import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { getDatabaseUrl } from './env';
import * as schema from './schema';

const createDatabase = (connection: Pool) => drizzle(connection, { schema });
type Database = ReturnType<typeof createDatabase>;

declare global {
  // eslint-disable-next-line no-var
  var __liveChatPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __liveChatDb: Database | undefined;
}

const getPool = () => {
  if (!globalThis.__liveChatPool) {
    globalThis.__liveChatPool = new Pool({ connectionString: getDatabaseUrl() });
  }

  return globalThis.__liveChatPool;
};

const getDbInstance = () => {
  if (!globalThis.__liveChatDb) {
    globalThis.__liveChatDb = createDatabase(getPool());
  }

  return globalThis.__liveChatDb;
};

export const db = new Proxy({} as Database, {
  get(_target, property, receiver) {
    return Reflect.get(getDbInstance(), property, receiver);
  },
});

export const pool = new Proxy({} as Pool, {
  get(_target, property, receiver) {
    return Reflect.get(getPool(), property, receiver);
  },
});
