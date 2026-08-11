import dotenv from 'dotenv';
import {
  ensureDatabaseUrlEnv,
  resolveDatabaseUrl,
  resolveDirectDatabaseUrl,
  databaseHostHint,
} from './dbUrl.js';

dotenv.config();
dotenv.config({ path: '.env.local', override: true });
ensureDatabaseUrlEnv();

const defaultOrigins = [
  'https://kisanmall-hr.vercel.app',
  'https://kisanmall-hr-backend.vercel.app',
  'http://localhost:5173',
  'https://localhost:5173',
  'http://localhost:5174',
  'https://localhost:5174',
];

export const env = {
  port: Number(process.env.PORT) || 5001,
  nodeEnv: process.env.NODE_ENV || 'development',
  isVercel: Boolean(process.env.VERCEL),

  databaseUrl: resolveDatabaseUrl(),
  databaseUrlDirect: resolveDirectDatabaseUrl(),
  databaseHost: databaseHostHint(),

  jwtSecret: process.env.JWT_SECRET || 'kisan-mall-hr-dev-secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',

  supabaseRegion: process.env.SUPABASE_REGION || 'ap-southeast-1',

  postgres: {
    url: process.env.POSTGRES_URL || '',
    prismaUrl: process.env.POSTGRES_PRISMA_URL || '',
    urlNonPooling: process.env.POSTGRES_URL_NON_POOLING || '',
    user: process.env.POSTGRES_USER || '',
    host: process.env.POSTGRES_HOST || '',
    password: process.env.POSTGRES_PASSWORD || '',
    database: process.env.POSTGRES_DATABASE || 'postgres',
  },

  clientOrigins: [
    ...new Set([
      ...defaultOrigins,
      ...(process.env.CLIENT_URL || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ]),
  ],
};
