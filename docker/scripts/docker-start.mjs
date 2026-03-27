import { spawn } from 'node:child_process';
import pg from 'pg';
import { getDatabaseUrl } from './database-url.mjs';

const { Client } = pg;
const databaseUrl = getDatabaseUrl();
const retries = 30;
const retryDelayMs = 2000;

process.env.DATABASE_URL = databaseUrl;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const run = (command, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      env: process.env,
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(' ')} exited with code ${code ?? 'null'}`));
    });
    child.on('error', reject);
  });

const waitForDatabase = async () => {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const client = new Client({ connectionString: databaseUrl });

    try {
      await client.connect();
      await client.end();
      return;
    } catch (error) {
      await client.end().catch(() => undefined);
      if (attempt === retries) {
        throw error;
      }
      console.log(`Database unavailable, retrying (${attempt}/${retries})...`);
      await sleep(retryDelayMs);
    }
  }
};

await waitForDatabase();
await run('node', ['./scripts/apply-migrations.mjs']);
await run('node', ['./scripts/ensure-lobby.mjs']);

const server = spawn('node', ['./dist/server/entry.mjs'], {
  stdio: 'inherit',
  env: process.env,
});

const forwardSignal = (signal) => {
  if (!server.killed) {
    server.kill(signal);
  }
};

process.on('SIGINT', forwardSignal);
process.on('SIGTERM', forwardSignal);

server.on('exit', (code) => {
  process.exit(code ?? 0);
});
