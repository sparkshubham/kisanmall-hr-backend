# Kisan Mall Staff Management API

Structure matches stock-verify / `test-backend`:

```text
server/
  api/index.js          # Vercel serverless entry
  vercel.json
  VERCEL_ENV.txt
  prisma/               # schema + seed
  src/
    app.js              # Express app
    server.js           # Local Node server
    config/             # env, dbUrl
    middleware/         # auth, errorHandler
    utils/              # prisma, jwt, response, asyncHandler
    services/           # attendance, face, payroll
    routes/
      index.js          # /api/health, /api/auth, /api/admin, /api/staff
      auth.js
      admin/
      staff/
```

## API map

| Area | Base path |
|------|-----------|
| Health | `GET /api/health` |
| Auth | `POST /api/auth/login`, `GET /api/auth/me` |
| Admin | `/api/admin/*` |
| Staff | `/api/staff/*` |

## Run

```bash
npm install
npx prisma db push
npm run db:seed
npm run dev
```

## Deploy

See `../DEPLOY.md`.
