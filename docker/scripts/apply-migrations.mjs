import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { getDatabaseUrl } from './database-url.mjs';

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, '../drizzle');
const databaseUrl = getDatabaseUrl();

const client = new Client({ connectionString: databaseUrl });

await client.connect();

try {
  await client.query(`
    CREATE TABLE IF NOT EXISTS app_migrations (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const entries = await fs.readdir(migrationsDir);
  const migrations = entries.filter((entry) => entry.endsWith('.sql')).sort();

  for (const migration of migrations) {
    const applied = await client.query('SELECT 1 FROM app_migrations WHERE name = $1 LIMIT 1', [migration]);
    if (applied.rowCount) {
      continue;
    }

    const migrationSql = await fs.readFile(path.join(migrationsDir, migration), 'utf8');

    await client.query('BEGIN');
    try {
      await client.query(migrationSql);
      await client.query('INSERT INTO app_migrations (name) VALUES ($1)', [migration]);
      await client.query('COMMIT');
      console.log(`Applied migration ${migration}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
} finally {
  await client.end();
}
