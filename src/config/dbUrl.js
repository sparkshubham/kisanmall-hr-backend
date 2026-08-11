/**
 * Resolve Postgres / Supabase connection strings from env vars you set
 * (Vercel dashboard or local .env). No host/password is hardcoded.
 *
 * Preferred on Vercel:
 *   DATABASE_URL  = Transaction pooler (*.pooler.supabase.com:6543)
 *   DIRECT_URL    = Direct (db.*.supabase.co:5432) — optional, for migrate
 *
 * If you paste the direct URL as DATABASE_URL, it is rewritten to the
 * IPv4 pooler automatically on Vercel (direct host is IPv6-only).
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

function supabaseRegion() {
  return stripQuotes(process.env.SUPABASE_REGION) || 'ap-south-1';
}

/** Rewrite direct Supabase URL → transaction pooler (IPv4) for serverless. */
export function toSupabasePoolerUrl(url, region = supabaseRegion()) {
  const raw = stripQuotes(url);
  if (!raw || raw.includes('pooler.supabase.com')) return raw;

  const match = raw.match(
    /^postgresql:\/\/([^:]+):([^@]+)@db\.([^.]+)\.supabase\.co(?::\d+)?\/([^?]*)(.*)$/i
  );
  if (!match) return raw;

  const [, user, password, projectRef, database, query = ''] = match;
  const userName = user.includes('.') ? user : `postgres.${projectRef}`;
  const params = new URLSearchParams(query.startsWith('?') ? query.slice(1) : query);
  params.set('pgbouncer', 'true');
  if (!params.has('connection_limit')) params.set('connection_limit', '5');
  if (!params.has('pool_timeout')) params.set('pool_timeout', '20');
  if (!params.has('sslmode')) params.set('sslmode', 'require');

  return `postgresql://${userName}:${password}@aws-0-${region}.pooler.supabase.com:6543/${database || 'postgres'}?${params.toString()}`;
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
        'Missing DATABASE_URL. Add it in Vercel → Settings → Environment Variables (use the Supabase pooler URI).'
      );
    }
    return 'postgresql://postgres:postgres@localhost:5432/kisan_hr';
  }

  if (process.env.VERCEL) {
    return toSupabasePoolerUrl(resolved);
  }
  return resolved;
}

/** Session pooler (port 5432) — use for prisma migrate on Vercel (IPv4). */
export function toSupabaseSessionPoolerUrl(url, region = supabaseRegion()) {
  const raw = stripQuotes(url);
  if (!raw) return raw;
  if (raw.includes('pooler.supabase.com') && raw.includes(':5432') && !raw.includes('pgbouncer=true')) {
    return raw;
  }

  const match = raw.match(
    /^postgresql:\/\/([^:]+):([^@]+)@(?:db\.([^.]+)\.supabase\.co|aws-0-[^.]+\.pooler\.supabase\.com)(?::\d+)?\/([^?]*)(.*)$/i
  );
  if (!match) return raw;

  const [, user, password, projectRefFromHost, database, query = ''] = match;
  const projectRef =
    projectRefFromHost ||
    (user.includes('.') ? user.split('.').pop() : null) ||
    'unknown';
  const userName = user.includes('.') ? user : `postgres.${projectRef}`;
  const params = new URLSearchParams(query.startsWith('?') ? query.slice(1) : query);
  params.delete('pgbouncer');
  params.delete('connection_limit');
  params.delete('pool_timeout');
  if (!params.has('sslmode')) params.set('sslmode', 'require');

  return `postgresql://${userName}:${password}@aws-0-${region}.pooler.supabase.com:5432/${database || 'postgres'}?${params.toString()}`;
}

export function resolveDirectDatabaseUrl() {
  const resolved = firstUrl([
    process.env.DIRECT_URL,
    process.env.POSTGRES_URL_NON_POOLING,
    process.env.DATABASE_URL,
    process.env.POSTGRES_URL,
    buildFromParts(),
  ]);

  if (!resolved) {
    return 'postgresql://postgres:postgres@localhost:5432/kisan_hr';
  }

  if (process.env.VERCEL) {
    return toSupabaseSessionPoolerUrl(resolved);
  }
  return resolved;
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
