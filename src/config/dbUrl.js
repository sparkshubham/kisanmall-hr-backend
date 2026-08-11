/**
 * Vercel is IPv4-only. This project's db.*.supabase.co host is IPv6-only,
 * so serverless Prisma cannot use the direct URI.
 *
 * The working shared pooler is NOT aws-0-ap-south-1 (tenant missing there).
 * It is aws-0-ap-southeast-1. Do not guess other clusters.
 */

const HR_PROJECT_REF = 'hmzlplfvaphyhgmmiryl';
const HR_POOLER_HOST = 'aws-0-ap-southeast-1.pooler.supabase.com';

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

function parsePgUrl(raw) {
  try {
    const u = new URL(String(raw).replace(/^postgres(ql)?:/i, 'http:'));
    return {
      user: decodeURIComponent(u.username || ''),
      password: decodeURIComponent(u.password || ''),
      host: u.hostname,
      database: (u.pathname || '/postgres').replace(/^\//, '') || 'postgres',
    };
  } catch {
    return null;
  }
}

function projectRefFrom(parsed) {
  if (!parsed) return null;
  const fromUser = parsed.user.match(/\.([a-z0-9]{20})$/i);
  if (fromUser) return fromUser[1];
  const fromHost = parsed.host.match(/^db\.([a-z0-9]+)\.supabase\.co$/i);
  if (fromHost) return fromHost[1];
  return null;
}

function poolerUrl(parsed, { transaction }) {
  const ref = projectRefFrom(parsed) || HR_PROJECT_REF;
  const user = `postgres.${ref}`;
  const pass = encodeURIComponent(parsed.password);
  const db = parsed.database || 'postgres';
  if (transaction) {
    return `postgresql://${user}:${pass}@${HR_POOLER_HOST}:6543/${db}?sslmode=require&pgbouncer=true&connection_limit=1`;
  }
  return `postgresql://${user}:${pass}@${HR_POOLER_HOST}:5432/${db}?sslmode=require`;
}

function needsIpv4Pooler(parsed) {
  if (!parsed) return false;
  const ref = projectRefFrom(parsed);
  if (ref && ref !== HR_PROJECT_REF) return false;
  if (parsed.host === `db.${HR_PROJECT_REF}.supabase.co`) return true;
  if (parsed.host.endsWith('.pooler.supabase.com') && parsed.host !== HR_POOLER_HOST) {
    return ref === HR_PROJECT_REF || parsed.user === 'postgres';
  }
  return false;
}

function toReachableUrl(url, { transaction }) {
  const parsed = parsePgUrl(url);
  if (needsIpv4Pooler(parsed) && parsed.password) {
    return poolerUrl(parsed, { transaction });
  }
  return withSsl(url);
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

  return toReachableUrl(resolved, { transaction: true });
}

export function resolveDirectDatabaseUrl() {
  const resolved = firstUrl([
    process.env.DIRECT_URL,
    process.env.POSTGRES_URL_NON_POOLING,
    process.env.DATABASE_URL,
    process.env.POSTGRES_URL,
    buildFromParts(),
  ]);

  const fallback = resolved || 'postgresql://postgres:postgres@localhost:5432/kisan_hr';
  if (process.env.VERCEL) {
    return toReachableUrl(fallback, { transaction: false });
  }
  return withSsl(fallback);
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
