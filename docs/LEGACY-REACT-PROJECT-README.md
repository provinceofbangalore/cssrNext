# CSSR.IN — React CMS / Node.js / Prisma / MySQL or Neon PostgreSQL

**Version 2.0 — one HTTP port locally, one Vercel deployment in production.**

This is the complete, source-based update to the supplied CSSR.IN project. It keeps the latest homepage and admin design, emblem, 14px body typography, wider section spacing, aligned footer, SheStrong Technology Services attribution, and source-attributed recent blog stories. The page content includes the original supplied History, Saints, Prayer, What We Do, and Join Us material. It includes the admin CMS, roles/permissions, pages, nested menus, blog editor, media, website settings, enquiries and charts.

**One application, one selected database:** this code supports either MySQL **or** Neon PostgreSQL. It does *not* query two databases simultaneously; each running instance uses the selected provider. They have separate data, separate migrations/schema setup and separate seed runs.

## 1. Requirements

- Node.js **22.x** and npm 10+
- For MySQL: MySQL 8+ running with a usable username, password, and an existing database `cssr_cms`
- For Neon: a Neon PostgreSQL project, pooled and direct connection strings
- GitHub and Vercel accounts for production deployment

## 2. Database configuration: TWO environment files

The ZIP contains the two requested files at the **project root**:

| File | Purpose |
| --- | --- |
| `.env.mysql` | Local MySQL; `DB_TARGET=mysql`; `DATABASE_URL=mysql://...` |
| `.env.neon` | Neon PostgreSQL; `DB_TARGET=neon`; pooled `DATABASE_URL` plus direct `DATABASE_URL_UNPOOLED` |

Both are safe placeholders. **Edit them locally with your own credentials**. Real `.env.*` files are excluded by `.gitignore`; GitHub only gets `.env.mysql.example` and `.env.neon.example`. For production, set environment variables directly inside Vercel; do not commit the edited env files. Do not reuse passwords/JWT secrets pasted into a conversation.

MySQL passwords containing `@`, `:`, `$`, `/`, `#`, `?` etc. must be URL-encoded in `DATABASE_URL`; for example `$` becomes `%24`.

Generate a strong JWT secret with:

```bash
openssl rand -hex 32
```

## 3. Run locally using MySQL (NO port 4000)

1. Edit `.env.mysql` and start MySQL; create `cssr_cms` if needed.
2. From the project root run:

```bash
npm install
npm run db:setup:mysql
npm run dev:mysql
```

**All services use `http://localhost:5173`**, including:

- Website: `http://localhost:5173/`
- Admin: `http://localhost:5173/admin/login`
- API: `http://localhost:5173/api/health`

The Express backend and Vite React dev middleware are attached to one Node.js HTTP server, including Vite's HMR WebSocket. `npm run dev` is an alias for `npm run dev:mysql`. **Do not start `npm run dev -w client`** because Vite is now served through the Node entrypoint.

If `EADDRINUSE:5173`, stop the old Vite process on port 5173 first (`lsof -nP -iTCP:5173 -sTCP:LISTEN` and `kill PID`).

## 4. Run locally using Neon

1. In Neon Console > Connect, copy the **pooled** database URL and **direct** database URL (connection pooling disabled). Fill `.env.neon` with them.
2. Run:

```bash
npm install
npm run db:setup:neon
npm run dev:neon
```

The website/admin/API are **also on `http://localhost:5173`**. Do not run MySQL and Neon local variants simultaneously on that port. To switch providers, stop the app and use the other `dev:*` command. The command automatically regenerates Prisma Client from the matching provider schema.

`db:setup:*` runs `prisma generate`, `prisma db push`, and **seed**. The seed requires `ADMIN_EMAIL` and a unique `ADMIN_PASSWORD` of **at least 12 characters** in the selected env file. The seed is repeatable and preserves existing pages/blog edits; it never automatically migrates content between MySQL and Neon. **Back up an existing database before `db push`.**

For individual steps:

```bash
npm run db:generate:mysql
npm run db:push:mysql
npm run db:seed:mysql
# OR
npm run db:generate:neon
npm run db:push:neon
npm run db:seed:neon
```

## 5. Preview compiled React + API on one port

```bash
npm run serve:single:mysql
# or
npm run serve:single:neon
```

This automatically regenerates Prisma Client and builds the frontend before starting the combined server on `http://localhost:5173`.

## 6. Deploy to Vercel + Neon (one project, one domain)

See **`VERCEL-NEON-DEPLOYMENT.md`** for detailed steps. In summary:

- Push all source folders (`api/`, `client/`, `server/`, `scripts/`, `package.json`, and `vercel.json`) to one GitHub repo.
- Import repo once into Vercel with root directory `./`, framework **Other**, install `npm install`, build `npm run vercel-build`, output `client/dist`, Node.js **22.x**.
- Configure `DB_TARGET=neon`, Neon `DATABASE_URL` (pooled), `DATABASE_URL_UNPOOLED` (direct), strong `JWT_SECRET`, and `CLIENT_ORIGIN=https://cssr.in` in Vercel Environment Variables.
- Initialize Neon locally first with `npm run db:setup:neon`, then deploy. Do **not** run the seed automatically at every Vercel build.
- For uploads connect Vercel Blob; set `BLOB_READ_WRITE_TOKEN` through Vercel storage integration.
- The Vercel function imports `server/src/index.js` but does not open any TCP listener. All website/admin/API URLs are served under the same Vercel domain. Vercel manages HTTPS; do not set `PORT` in Vercel.

## 7. Project structure

```text
CSSR-IN-Dual-Database-Single-Port/
├── .env.mysql                  # local credentials (placeholder)
├── .env.neon                   # local credentials (placeholder)
├── .env.mysql.example          # safe template to commit
├── .env.neon.example           # safe template to commit
├── api/
│   ├── index.js               # Vercel serverless API entry
│   └── route-path.js
├── client/
│   ├── public/assets/images/  # CSSR logo, original design images
│   └── src/                   # React pages, blog, admin panel, styles
├── server/
│   ├── prisma/
│   │   ├── schema.mysql.prisma # MySQL native field mappings
│   │   ├── schema.neon.prisma  # Neon Postgres and JS driver
│   │   ├── seed.js             # real content seed, user and permissions
│   │   └── *.txt              # supplied page content
│   └── src/
│       ├── index.js           # shared Express API (NO app.listen)
│       ├── db.js              # selects driver for active provider
│       ├── dev.js             # Express + Vite middleware, port 5173
│       └── production-local.js
├── scripts/runner.mjs         # loads selected env, generates matching Prisma client
├── tests/
└── vercel.json                # React catchall + /api rewrite
```

## 8. Notes / scope

- Existing drafts for parish/community directories, donation setup and approved vision/mission content remain drafts. Review before publishing.
- The CMS translations support is database-backed; only supplied translations are pre-seeded. Admin can provide additional languages.
- Preview images included are design reference assets. Verify image permissions before public use.
- Recent blog entries summarize reports from CSSR News and link to original sources; sample thumbnail images are illustrative.
- A generated Prisma Client is **specific to the database selected during build**. To switch Vercel databases, change `DB_TARGET` and database variables **and redeploy**.
- This repo does not automate migrating records from an existing MySQL database to Neon. For production content, plan a controlled migration or edit/publish the corresponding records in the Neon CMS.
- A database failing to connect often returns API HTTP 500; use Vercel Function Logs or Node terminal logs to distinguish authentication failures from missing tables.

## 9. Validation

Run `npm test` for source/routing checks. A complete run should also include `npm install`, `npm run db:setup:<provider>`, `npm run dev:<provider>` and an API/website browser check against **your actual database**. Those require valid credentials and a reachable database.
