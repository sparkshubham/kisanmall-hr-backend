/**
 * Resolve Postgres / Supabase connection strings for the HR API.
 *
 * Same pattern as stock-verify / backend:
 *   DATABASE_URL  = Transaction pooler (IPv4) on Vercel
 *   DIRECT_URL    = Session pooler / direct for migrate
 *
 * This HR project lives on ap-southeast-1 (Singapore).
 * Do NOT use aws-0-ap-south-1 — tenant is missing there.
 * Direct db.*.supabase.co is IPv6-only and unreachable from Vercel.
 */

const HR_PROJECT_REF = 'hmzlplfvaphyhgmmiryl';
const HR_REGION = 'ap-southeast-1';
const HR_POOLER_HOST = `aws-0-${HR_REGION}.pooler.supabase.com`;

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

function parsePgUrl(raw) {
  try {
    const u = new URL(String(raw).replace(/^postgres(ql)?:/i, 'http:'));
    return {
      user: decodeURIComponent(u.username || ''),
      password: decodeURIComponent(u.password || ''),
      host: u.hostname,
      database: (u.pathname || '/postgres').replace(/^\//, '') || 'postgres',
      searchParams: u.searchParams,
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
  const fromPoolerUser = parsed.user.match(/^postgres\.([a-z0-9]+)$/i);
  if (fromPoolerUser) return fromPoolerUser[1];
  return null;
}

function isHrProject(parsed) {
  const ref = projectRefFrom(parsed);
  if (ref === HR_PROJECT_REF) return true;
  if (parsed?.host === `db.${HR_PROJECT_REF}.supabase.co`) return true;
  // Bare postgres@db.hmzl… without ref in user still belongs to this project when host matches
  if (parsed?.host?.includes(HR_PROJECT_REF)) return true;
  // Default: if no other project ref is detected and we are on Vercel / HR app, treat as HR
  if (!ref && process.env.VERCEL) return true;
  return false;
}

function withPoolParams(url, { transaction }) {
  const parsed = parsePgUrl(url);
  if (!parsed) return url;
  const params = new URLSearchParams(parsed.searchParams?.toString() || '');
  params.set('sslmode', 'require');
  if (transaction) {
    params.set('pgbouncer', 'true');
    params.set('connection_limit', '1');
    if (!params.has('pool_timeout')) params.set('pool_timeout', '20');
    if (!params.has('connect_timeout')) params.set('connect_timeout', '15');
  }
  const user = encodeURIComponent(parsed.user);
  const pass = encodeURIComponent(parsed.password);
  return `postgresql://${user}:${pass}@${parsed.host}:${transaction ? 6543 : 5432}/${parsed.database}?${params.toString()}`;
}

/**
 * Force Singapore IPv4 pooler for this HR Supabase project.
 * Fixes: direct IPv6 host, wrong region pooler, missing pgbouncer flags.
 */
export function toHrPoolerUrl(url, { transaction = true } = {}) {
  const raw = stripQuotes(url);
  if (!raw) return raw;

  const parsed = parsePgUrl(raw);
  if (!parsed?.password) return raw;

  // Only rewrite URLs that belong to this HR project (or unknown on Vercel)
  if (!isHrProject(parsed) && projectRefFrom(parsed)) {
    return withSsl(raw);
  }

  const ref = projectRefFrom(parsed) || HR_PROJECT_REF;
  const user = `postgres.${ref}`;
  const pass = encodeURIComponent(parsed.password);
  const db = parsed.database || 'postgres';
  const port = transaction ? 6543 : 5432;
  const qs = transaction
    ? 'sslmode=require&pgbouncer=true&connection_limit=1&pool_timeout=20&connect_timeout=15'
    : 'sslmode=require';

  return `postgresql://${user}:${pass}@${HR_POOLER_HOST}:${port}/${db}?${qs}`;
}

function withSsl(url) {
  const raw = stripQuotes(url);
  if (!raw) return raw;
  if (!/supabase\.(co|com)/i.test(raw)) return raw;
  if (/[?&]sslmode=/i.test(raw)) return raw;
  return raw.includes('?') ? `${raw}&sslmode=require` : `${raw}?sslmode=require`;
}

function needsPoolerRewrite(url) {
  const parsed = parsePgUrl(url);
  if (!parsed) return false;
  if (!isHrProject(parsed)) return false;

  // Direct db host (IPv6) → must rewrite
  if (parsed.host.startsWith('db.') && parsed.host.endsWith('.supabase.co')) return true;
  // Wrong region pooler (e.g. ap-south-1)
  if (parsed.host.includes('pooler.supabase.com') && parsed.host !== HR_POOLER_HOST) return true;
  // Correct host but missing serverless-safe params
  if (parsed.host === HR_POOLER_HOST) {
    const q = parsed.searchParams?.toString() || '';
    if (!/pgbouncer=true/i.test(q) || !/connection_limit=1/i.test(q)) return true;
  }
  return false;
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
        'Missing DATABASE_URL. Add the Singapore pooler URI in Vercel → Environment Variables.'
      );
    }
    return 'postgresql://postgres:postgres@localhost:5432/kisan_hr';
  }

  // Always normalize HR URLs to Singapore pooler (local + Vercel).
  // Local also benefits: avoids IPv6-only direct host failures on some networks.
  if (needsPoolerRewrite(resolved) || process.env.VERCEL) {
    return toHrPoolerUrl(resolved, { transaction: true });
  }

  // Already correct pooler with params
  if (parsePgUrl(resolved)?.host === HR_POOLER_HOST) {
    return withPoolParams(resolved, { transaction: true });
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

  const fallback = resolved || 'postgresql://postgres:postgres@localhost:5432/kisan_hr';

  if (needsPoolerRewrite(fallback) || process.env.VERCEL) {
    // Session mode pooler (5432) — still IPv4, better for migrate than direct IPv6
    return toHrPoolerUrl(fallback, { transaction: false });
  }

  return withSsl(fallback);
}

export function ensureDatabaseUrlEnv() {
  process.env.DATABASE_URL = resolveDatabaseUrl();
  process.env.DIRECT_URL = resolveDirectDatabaseUrl();
  // Keep region hint consistent for any tooling that reads it
  if (!process.env.SUPABASE_REGION) {
    process.env.SUPABASE_REGION = HR_REGION;
  }
}

export function databaseHostHint(url = process.env.DATABASE_URL) {
  try {
    return new URL(url.replace(/^postgresql:/, 'http:')).host;
  } catch {
    return 'unknown';
  }
}
