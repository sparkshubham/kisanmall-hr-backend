/**
 * Use the exact Postgres / Supabase URIs from env.
 * Do not rewrite db.*.supabase.co → a guessed pooler tenant.
 * This HR project’s pooler user postgres.hmzlplfvaphyhgmmiryl does not exist.
 */

function stripQuotes(value = '') {
  return String(value).trim().replace(/^["']|["']$/g, '');
}

function buildFromParts() {
  const user = stripQuotes(process.env.POSTGRES_USER);
  const password = stripQuotes(process.env.POSTGRES_PASSWORD);
  const host = stripQuotes(process.env.POSTGRES_HOST);
  const database = stripQuotes(process.env.POSTGRES_DATABASE) || 'postgres';
  if (!user || !password || !host) return null;
  return `postgresql://${user}:${encodeURIComponent(password)}@${host}:5432/${database}`;
}

function firstUrl(candidates) {
  return candidates.map(stripQuotes).find(Boolean) || null;
}

function withSsl(url) {
  const raw = stripQuotes(url);
  if (!raw) return raw;
  if (!/supabase\.(co|com)/i.test(raw)) return raw;
  if (/[?&]sslmode=/i.test(raw)) return raw;
  return raw.includes('?') ? `${raw}&sslmode=require` : `${raw}?sslmode=require`;
}

export function resolveDatabaseUrl() {
  const resolved = firstUrl([
    process.env.POSTGRES_PRISMA_URL,
    process.env.POSTGRES_URL,
    process.env.DATABASE_URL,
    buildFromParts(),
  ]);

  if (!resolved) {
    if (process.env.VERCEL) {
      throw new Error(
        'Missing DATABASE_URL. Add the exact URI from Supabase → Project Settings → Database.'
      );
    }
    return 'postgresql://postgres:postgres@localhost:5432/kisan_hr';
  }

  return withSsl(resolved);
}

export function resolveDirectDatabaseUrl() {
  const resolved = firstUrl([
    process.env.DIRECT_URL,
    process.env.POSTGRES_URL_NON_POOLING,
    process.env.DATABASE_URL,
    process.env.POSTGRES_URL,
    buildFromParts(),
  ]);

  return withSsl(resolved || 'postgresql://postgres:postgres@localhost:5432/kisan_hr');
}

export function ensureDatabaseUrlEnv() {
  process.env.DATABASE_URL = resolveDatabaseUrl();
  process.env.DIRECT_URL = resolveDirectDatabaseUrl();
}

export function databaseHostHint(url = process.env.DATABASE_URL) {
  try {
    return new URL(url.replace(/^postgresql:/, 'http:')).host;
  } catch {
    return 'unknown';
  }
}
