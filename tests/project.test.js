import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = file => readFile(new URL(file, import.meta.url), 'utf8');

test('root package uses Next.js and Neon-only commands', async () => {
  const pkg = JSON.parse(await read('../package.json'));
  assert.ok(pkg.dependencies.next);
  assert.equal(pkg.scripts.dev, 'next dev -p 3000');
  assert.match(pkg.scripts.build, /prisma generate.*next build/);
  assert.equal(pkg.scripts['db:push'], 'prisma db push');
  assert.ok(!pkg.workspaces);
});

test('Prisma schema is PostgreSQL-only with Neon direct URL', async () => {
  const schema = await read('../prisma/schema.prisma');
  assert.match(schema, /provider\s*=\s*"postgresql"/);
  assert.match(schema, /url\s*=\s*env\("DATABASE_URL"\)/);
  assert.match(schema, /directUrl\s*=\s*env\("DATABASE_URL_UNPOOLED"\)/);
  assert.doesNotMatch(schema, /provider\s*=\s*"mysql"/);
});

test('Next.js app shell and API route handlers exist', async () => {
  const page = await read('../app/[[...slug]]/page.jsx');
  const api = await read('../app/api/[...path]/route.js');
  assert.match(page, /LegacyAppShell/);
  for (const method of ['GET', 'POST', 'PUT', 'DELETE']) assert.match(api, new RegExp(`export function ${method}`));
  assert.match(api, /admin\/media\/upload/);
  assert.match(api, /auth\/login/);
  assert.match(api, /public\/site/);
});

test('old Vite and Express listeners are not part of root runtime', async () => {
  const pkg = JSON.parse(await read('../package.json'));
  assert.doesNotMatch(pkg.scripts.dev, /vite|express|4000/);
  assert.doesNotMatch(pkg.scripts.start, /server|4000/);
});
