import { readFileSync } from 'node:fs';
import { defineConfig } from 'drizzle-kit';

const readEnv = (name: string, fallback?: string) => {
  const value = process.env[name] ?? fallback;

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
};

const readSecret = (name: string) => readFileSync(readEnv(name), 'utf8').trim();

const resolveDatabaseUrl = () => {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const host = readEnv('DB_HOST', 'live-chat-db');
  const port = readEnv('DB_PORT', '5432');
  const databaseName = encodeURIComponent(readSecret('DB_NAME_FILE'));
  const databaseUser = encodeURIComponent(readSecret('DB_USER_FILE'));
  const databasePassword = encodeURIComponent(readSecret('DB_PASSWORD_FILE'));

  return `postgresql://${databaseUser}:${databasePassword}@${host}:${port}/${databaseName}`;
};

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/lib/server/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: resolveDatabaseUrl(),
  },
});
