import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import { env } from './config/env.js';
import routes from './routes/index.js';
import { setupSwagger } from './docs/swagger.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

function isOriginAllowed(origin) {
  if (!origin) return true;
  if (env.clientOrigins.includes('*')) return true;
  if (env.clientOrigins.includes(origin)) return true;
  if (/^https:\/\/kisanmall-hr(?!-backend)[a-z0-9-]*\.vercel\.app$/i.test(origin)) return true;
  if (/^https:\/\/localhost(?::\d+)?$/i.test(origin)) return true;
  if (/^http:\/\/localhost(?::\d+)?$/i.test(origin)) return true;
  return false;
}

function applyCorsHeaders(req, res) {
  const origin = req.headers.origin;
  if (!isOriginAllowed(origin)) return false;
  res.setHeader('Access-Control-Allow-Origin', origin || '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    req.headers['access-control-request-headers'] || 'Authorization,Content-Type,X-Requested-With'
  );
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('Vary', 'Origin');
  return true;
}

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

app.use((req, res, next) => {
  applyCorsHeaders(req, res);
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});

app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

const uploadRoot = env.isVercel ? '/tmp/uploads' : path.join(__dirname, '../../uploads');
app.use('/uploads', express.static(uploadRoot));

app.get('/', (_req, res) => {
  res.json({
    success: true,
    service: 'Kisan Mall Staff Management API',
    health: '/api/health',
    docs: '/api/docs',
    openapi: '/api/docs.json',
    admin: '/api/admin',
    staff: '/api/staff',
  });
});

setupSwagger(app);

app.use('/api', routes);

app.use(notFound);
app.use(errorHandler);

export default app;
