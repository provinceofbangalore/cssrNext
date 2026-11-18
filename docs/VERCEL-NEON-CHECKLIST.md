# Vercel + Neon checklist

1. Create/verify Neon PostgreSQL database and copy both pooled and direct URLs.
2. Set local `.env` from `.env.example`.
3. Run `npm install`, `npm run db:generate`, `npm run db:push`, `npm run db:seed`.
4. Confirm `npm run dev` serves the site and API at `http://localhost:3000`.
5. Push the project root to GitHub.
6. Import that repository into Vercel. Framework should auto-detect as Next.js.
7. Set `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `JWT_SECRET`, `CLIENT_ORIGIN`, `COOKIE_SECURE=true`, and `BLOB_READ_WRITE_TOKEN`.
8. Deploy. Vercel uses the Next.js build output; do not set `client/dist` as an output directory.
9. Test `/api/health`, `/api/public/site`, `/`, and `/admin/login`.
10. Add the `cssr.in` domain in Vercel after the preview deployment works.

Never commit `.env` or rotate credentials that were exposed in chat.
