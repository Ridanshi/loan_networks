import { resolve } from 'node:path';
import dotenv from 'dotenv';
import pg from 'pg';
import type { QueryResultRow } from 'pg';

dotenv.config({ path: resolve(process.cwd(), '.env') });

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;
const sslConfig = {
  rejectUnauthorized: false
};

// Local Postgres (e.g. a cloned staging DB on localhost) doesn't support SSL —
// only enable it for remote hosts (RDS etc), which require it.
function isLocalHost(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

function buildConnectionString() {
  if (!databaseUrl) {
    return undefined;
  }

  const parsedUrl = new URL(databaseUrl);

  // node-postgres lets SSL query parameters override the explicit ssl object.
  // Strip them in memory so the Pool always uses sslConfig below.
  for (const key of ['ssl', 'sslmode', 'sslcert', 'sslkey', 'sslrootcert']) {
    parsedUrl.searchParams.delete(key);
  }

  return parsedUrl.toString();
}

function resolveSslOption(): false | typeof sslConfig {
  if (!databaseUrl) {
    return sslConfig;
  }

  return isLocalHost(new URL(databaseUrl).hostname) ? false : sslConfig;
}

function logConnectionConfig() {
  if (!databaseUrl) {
    console.log('PostgreSQL config:', {
      databaseUrlLoaded: false,
      sslEnabled: true,
      rejectUnauthorized: sslConfig.rejectUnauthorized
    });
    return;
  }

  const parsedUrl = new URL(databaseUrl);
  const sslEnabled = !isLocalHost(parsedUrl.hostname);

  console.log('PostgreSQL config:', {
    host: parsedUrl.hostname,
    database: parsedUrl.pathname.replace(/^\//, ''),
    sslEnabled,
    rejectUnauthorized: sslConfig.rejectUnauthorized
  });
}

logConnectionConfig();

export const pool = new Pool({
  connectionString: buildConnectionString(),
  ssl: resolveSslOption()
});

export async function query<T extends QueryResultRow>(text: string, params: unknown[] = []) {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set. Add it to backend/.env or the process environment before querying PostgreSQL.');
  }

  return pool.query<T>(text, params);
}
