# CSSR.IN Next.js migration notes

- Replaced Vite + Express workspace structure with a single Next.js App Router application.
- Removed dual MySQL/Neon runtime selection; only Neon PostgreSQL remains.
- Moved the Prisma schema to `prisma/schema.prisma` and retained all CMS models.
- Added Neon Prisma driver adapter singleton in `src/lib/prisma.js`.
- Ported the existing Express API endpoints into `app/api/[...path]/route.js` using Next.js Route Handlers.
- Preserved the approved React UI and CSS as a client-side compatibility layer so the visual design and admin workflows are not silently redesigned during backend migration.
- Added Next.js metadata/layout and static public assets.
- Kept Vercel Blob for durable production media uploads; local development can save media under `public/uploads`.
- Local Next.js development uses port 3000. Vercel controls production ports automatically.
