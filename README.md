# CSSR.IN — Next.js + Prisma + Neon PostgreSQL

This is the Next.js conversion of the CSSR.IN Redemptorists Bangalore Province website and CMS.

## What changed

- Replaced the Vite frontend and separate Express server with one Next.js App Router application.
- Replaced dual MySQL/Neon database support with Neon PostgreSQL only.
- Moved the API to Next.js Route Handlers at `/api/*`.
- Preserved the existing public website and administration UI, including its CSSR emblem, 14px content typography, homepage spacing, verified blog stories, responsive footer and SheStrong developer credit.
- Preserved the CMS modules: pages, blogs, menus, homepage banners, media, inquiries, users, roles, permissions, reports and website settings.
- Preserved the existing uploaded content source files and seed records.

The existing React Router UI is mounted inside a Next.js client shell to preserve the already-approved page layouts and navigation behaviour. Next.js owns the build, hosting, static assets and API deployment. There is no Vite server and no Express listener.

## Requirements

- Node.js 22.x
- npm 10+
- Neon PostgreSQL project
- Vercel Blob for persistent production media uploads

## 1. Configure Neon

Copy `.env.example` to `.env` and replace the placeholders. Use the pooled Neon connection for `DATABASE_URL` and the direct, non-pooled connection for `DATABASE_URL_UNPOOLED`.

```bash
cp .env.example .env
```

Generate a new JWT secret:

```bash
openssl rand -hex 32
```

Use a unique administrator password of at least 12 characters. Never commit `.env`.

## 2. Install dependencies

```bash
npm install
```

## 3. Generate Prisma Client and create the Neon schema

```bash
npm run db:generate
npm run db:push
```

`db:push` creates/updates tables in the Neon database. It does not automatically copy existing records from your former MySQL database.

## 4. Seed the initial CMS content and administrator

Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env`, then run:

```bash
npm run db:seed
```

The seed creates the initial roles and permissions, administrator, pages, menu tree, site settings, homepage slides and the verified-news posts. Existing content is not overwritten by rerunning the seed.

## 5. Run locally

```bash
npm run dev
```

Open:

- Website: http://localhost:3000
- Admin login: http://localhost:3000/admin/login
- API health: http://localhost:3000/api/health
- Public site data: http://localhost:3000/api/public/site

The website, admin panel and API all run through the same Next.js development server on port 3000.

## 6. Deploy to Vercel

Push the project root to one GitHub repository and import that repository as one Vercel project.

Recommended Vercel settings:

| Setting | Value |
|---|---|
| Framework Preset | Next.js |
| Root Directory | `./` |
| Build Command | `npm run vercel-build` |
| Output Directory | Leave blank / Next.js default |
| Install Command | `npm install` |
| Node.js | 22.x |

Set these Environment Variables in Vercel for Production and Preview as appropriate:

- `DATABASE_URL` — Neon pooled URL
- `DATABASE_URL_UNPOOLED` — Neon direct URL
- `JWT_SECRET` — fresh random secret
- `CLIENT_ORIGIN` — canonical website origin, e.g. `https://cssr.in`
- `COOKIE_SECURE` — `true`
- `BLOB_READ_WRITE_TOKEN` — connect Vercel Blob and use its token for persistent media uploads
- `ADMIN_EMAIL` and `ADMIN_PASSWORD` — needed only if seeding from the Vercel build environment; recommended to run the seed locally against Neon instead

Do not add `PORT` to Vercel. Vercel manages the port and serverless routing. No `vercel.json` rewrite is required for a standard Next.js App Router deployment.

Run `npm run db:generate` and `npm run db:push` locally against Neon before the first deployment. Run `npm run db:seed` once to create the initial data and administrator. Do not run `db:push` or seed automatically on every production build.

## 7. Media uploads

In local development, uploads are written under `public/uploads`. In Vercel production, connect Vercel Blob and set `BLOB_READ_WRITE_TOKEN`. Vercel function filesystems are ephemeral and must not be used for persistent uploads.

## 8. Security notes

- Rotate any database password, JWT secret or administrator password previously pasted into chat or source files.
- Keep `.env` out of Git.
- Admin passwords are stored as bcrypt hashes.
- API mutations use a CSRF cookie/header check and same-origin validation.
- Admin API operations enforce database-backed permissions.
- Rich text is sanitized before storage.
- Login and contact endpoints include per-instance rate limits. For high-volume production, use a shared rate-limit store.

## 9. Project structure

```text
app/
  api/[...path]/route.js     # Next.js API route handlers
  [[...slug]]/page.jsx       # Public/admin client application shell
  layout.jsx
  globals.css
components/
  LegacyApp.jsx               # Loads the preserved approved React UI
src/
  legacy/                     # Existing public and admin React screens
  lib/prisma.js               # Neon Prisma adapter/client
prisma/
  schema.prisma               # PostgreSQL-only Prisma schema
  seed.js
  *.txt                       # Supplied source content
public/assets/images/         # CSSR logo and design assets
```

## Validation status

Source syntax, JSON configuration, Prisma schema formatting and project structure should be checked after installation using:

```bash
node --check 'app/api/[...path]/route.js'
node --check prisma/seed.js
npx prisma validate
npm run build
```

A successful local build and live Neon/Vercel connection must be confirmed in the user's environment using their own Neon credentials.
