import pg from 'pg';
import { getDatabaseUrl } from './database-url.mjs';

const { Client } = pg;
const databaseUrl = getDatabaseUrl();

const client = new Client({ connectionString: databaseUrl });

await client.connect();

try {
  await client.query(
    `
      INSERT INTO rooms (name, description)
      VALUES ('Lobby', 'Default room for everyone joining the chat.')
      ON CONFLICT (name) DO NOTHING
    `,
  );
} finally {
  await client.end();
}
