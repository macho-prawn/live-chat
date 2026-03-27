import { readFileSync } from 'node:fs';

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

export const getDatabaseUrl = () => resolveDatabaseUrl();

export const env = {
  get databaseUrl() {
    return resolveDatabaseUrl();
  },
  appOrigin: readEnv('APP_ORIGIN', 'http://live-chat.internal:8083'),
  nicknameCookieName: readEnv('NICKNAME_COOKIE_NAME', 'live_chat_nickname'),
  host: readEnv('HOST', '0.0.0.0'),
  port: Number(readEnv('PORT', '8083')),
};
