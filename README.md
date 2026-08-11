# Kisan Mall Staff Management API

Express + Prisma + PostgreSQL backend. Same structure as the stock-verify server.

## Setup

```bash
cd server
cp .env.example .env
# set DATABASE_URL / DIRECT_URL / JWT_SECRET
npm install
npx prisma db push
npm run db:seed
npm run dev
```

API runs on `http://localhost:5001`.

## Demo logins

| Role | Mobile | Password |
| --- | --- | --- |
| Super Admin | 9999999999 | admin123 |
| HR Admin | 9999999998 | admin123 |
| Manager | 9000000018 | staff123 |
| Mukesh (staff) | 9000000014 | staff123 |
| Pooja (staff) | 9000000007 | staff123 |

## Docs

- Health: `/api/health`
- Swagger: `/api/docs`
