import { NextResponse } from 'next/server';
import { randomBytes, timingSafeEqual, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z, ZodError } from 'zod';
import { put } from '@vercel/blob';
import { db } from '@/lib/prisma';
import { safeBody } from '@/lib/safeBody';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const pageInclude = { translations: true };
const blogInclude = { translations: true };
const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true',
  path: '/'
};

const collection = {
  pages: { model: 'page', include: pageInclude, read: 'pages.read', write: 'pages.write' },
  blogs: { model: 'blog', include: blogInclude, read: 'blogs.read', write: 'blogs.write' },
  menus: { model: 'menuItem', read: 'menus.read', write: 'menus.write' },
  slides: { model: 'homeSlide', read: 'slides.read', write: 'slides.write' },
  inquiries: { model: 'inquiry', read: 'inquiries.read', write: 'inquiries.write' },
  media: { model: 'media', read: 'media.read', write: 'media.write' },
  permissions: { model: 'permission', read: 'permissions.read', write: 'permissions.write' },
  settings: { model: 'siteSetting', read: 'settings.read', write: 'settings.write' },
  users: { model: 'user', read: 'users.read', write: 'users.write' },
  roles: { model: 'role', read: 'roles.read', write: 'roles.write' }
};

const userSelect = {
  id: true,
  name: true,
  email: true,
  active: true,
  createdAt: true,
  roles: { include: { role: true } }
};
const roleInclude = {
  permissions: { include: { permission: true } },
  users: true
};

const fields = {
  pages: ['slug', 'section', 'status', 'imageUrl', 'sortOrder'],
  blogs: ['slug', 'category', 'status', 'imageUrl', 'publishedAt'],
  menus: ['label', 'href', 'parentId', 'sortOrder', 'visible'],
  slides: ['title', 'subtitle', 'imageUrl', 'buttonText', 'buttonHref', 'sortOrder', 'active'],
  inquiries: ['status'],
  permissions: ['key', 'description'],
  settings: ['key', 'value'],
  users: ['name', 'email', 'active'],
  roles: ['name', 'description']
};

const globalForLimits = globalThis;
const rateBuckets = globalForLimits.cssrRateBuckets || new Map();
if (process.env.NODE_ENV !== 'production') globalForLimits.cssrRateBuckets = rateBuckets;

function rateLimit(key, limit, windowMs) {
  const now = Date.now();
  const current = rateBuckets.get(key);
  if (!current || now - current.start >= windowMs) {
    rateBuckets.set(key, { start: now, count: 1 });
    return true;
  }
  current.count += 1;
  return current.count <= limit;
}

function getCookie(request, name) {
  const cookieHeader = request.headers.get('cookie') || '';
  const item = cookieHeader.split(';').map(x => x.trim()).find(x => x.startsWith(`${name}=`));
  if (item) return decodeURIComponent(item.slice(name.length + 1));
  return request.cookies?.get?.(name)?.value || '';
}

function json(data, status = 200, headers = {}) {
  return NextResponse.json(data, { status, headers });
}

function menuTree(items, parent = null, seen = new Set()) {
  return items
    .filter(item => (item.parentId || null) === parent && !seen.has(item.id))
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(item => ({
      ...item,
      children: menuTree(items, item.id, new Set([...seen, item.id]))
    }));
}

function translationFor(item, lang) {
  return item?.translations?.find(t => t.locale === lang)
    || item?.translations?.find(t => t.locale === 'en')
    || item?.translations?.[0]
    || {};
}

function formatTranslated(item, lang) {
  const translation = translationFor(item, lang);
  return { ...item, ...translation, translations: undefined };
}

async function getSettings() {
  const rows = await db.siteSetting.findMany();
  return Object.fromEntries(rows.map(row => [row.key, row.value]));
}

function permissionsOf(user) {
  return (user?.roles || []).flatMap(userRole =>
    userRole.role.permissions.map(rolePermission => rolePermission.permission.key)
  );
}

async function authenticate(request) {
  const token = getCookie(request, 'cssr_session');
  if (!token) return { error: json({ error: 'Please sign in' }, 401) };

  let claim;
  try {
    claim = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch {
    return { error: json({ error: 'Session expired. Please sign in again.' }, 401) };
  }

  const user = await db.user.findUnique({
    where: { id: claim.sub },
    include: {
      roles: {
        include: {
          role: {
            include: {
              permissions: { include: { permission: true } }
            }
          }
        }
      }
    }
  });

  if (!user || !user.active) return { error: json({ error: 'Account disabled' }, 401) };
  return { user, permissions: new Set(permissionsOf(user)) };
}

function normalize(resource, raw) {
  const source = { ...raw };
  delete source.id;
  delete source.createdAt;
  delete source.updatedAt;
  const result = Object.fromEntries((fields[resource] || []).filter(key => source[key] !== undefined).map(key => [key, source[key]]));

  if (result.slug) result.slug = z.string().regex(/^[a-z0-9][a-z0-9/_-]*$/).max(160).parse(result.slug);
  if (result.email) result.email = z.string().email().max(200).parse(result.email.trim().toLowerCase());
  if (result.publishedAt) result.publishedAt = new Date(result.publishedAt);
  if (result.sortOrder !== undefined) result.sortOrder = Number(result.sortOrder) || 0;
  for (const key of ['active', 'visible']) {
    if (result[key] !== undefined) result[key] = Boolean(result[key]);
  }
  if (result.status && !['DRAFT', 'PUBLISHED', 'ARCHIVED', 'NEW', 'READ', 'RESOLVED'].includes(result.status)) {
    throw new Error('Invalid status');
  }
  if (resource === 'menus' && result.parentId === '') result.parentId = null;
  return result;
}

async function audit(user, action, entity, entityId) {
  await db.auditLog.create({
    data: {
      userId: user.id,
      action,
      entity,
      entityId: String(entityId || '')
    }
  });
}

function validateMutation(request, pathname) {
  const origin = request.headers.get('origin');
  if (origin) {
    const requestOrigin = new URL(request.url).origin;
    const allowed = new Set([requestOrigin, process.env.CLIENT_ORIGIN].filter(Boolean));
    if (!allowed.has(origin)) return json({ error: 'Origin not allowed' }, 403);
  }

  const exempt = [
    '/api/auth/login',
    '/api/public/contact',
    '/api/public/visit'
  ];
  if (!exempt.includes(pathname)) {
    const cookie = getCookie(request, 'cssr_csrf');
    const header = request.headers.get('x-csrf-token') || '';
    if (!cookie || !header || cookie.length !== header.length || !timingSafeEqual(Buffer.from(cookie), Buffer.from(header))) {
      return json({ error: 'Invalid security token. Refresh the page.' }, 403);
    }
  }
  return null;
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

async function getResource(request, resource) {
  const config = collection[resource];
  if (!config) return json({ error: 'Unknown resource' }, 404);
  const auth = await authenticate(request);
  if (auth.error) return auth.error;
  if (!auth.permissions.has(config.read)) return json({ error: 'Insufficient permission' }, 403);

  const options = {
    ...(config.include ? { include: config.include } : {}),
    ...(resource === 'users' ? { select: userSelect } : {}),
    ...(resource === 'roles' ? { include: roleInclude } : {}),
    ...(!['permissions', 'settings', 'roles', 'users'].includes(resource)
      ? { orderBy: { [resource === 'inquiries' || resource === 'media' || resource === 'blogs' ? 'createdAt' : 'sortOrder']: resource === 'inquiries' || resource === 'media' || resource === 'blogs' ? 'desc' : 'asc' } }
      : {})
  };

  return json(await db[config.model].findMany(options));
}

async function createResource(request, resource, body) {
  const config = collection[resource];
  if (!config) return json({ error: 'Unknown resource' }, 404);
  const auth = await authenticate(request);
  if (auth.error) return auth.error;
  if (!auth.permissions.has(config.write)) return json({ error: 'Insufficient permission' }, 403);
  if (['inquiries', 'media'].includes(resource)) return json({ error: 'Creation not allowed here' }, 405);

  const data = normalize(resource, body);
  let item;

  if (['pages', 'blogs'].includes(resource)) {
    const translations = body.translations?.length ? body.translations : [{
      locale: 'en', title: body.title || data.slug, body: body.body || '', summary: body.summary || '', excerpt: body.excerpt || ''
    }];
    const translated = translations.map(value => ({
      locale: String(value.locale || 'en').slice(0, 8),
      title: String(value.title || '').slice(0, 300),
      ...(resource === 'pages' ? { summary: String(value.summary || ''), body: safeBody(value.body) } : { excerpt: String(value.excerpt || ''), body: safeBody(value.body) })
    }));
    item = await db[config.model].create({ data: { ...data, translations: { create: translated } }, include: config.include });
  } else if (resource === 'users') {
    const password = z.string().min(12).max(128).parse(body.password);
    const roleIds = z.array(z.string()).default([]).parse(body.roleIds || []);
    item = await db.user.create({
      data: {
        ...data,
        passwordHash: await bcrypt.hash(password, 12),
        roles: { create: roleIds.map(roleId => ({ role: { connect: { id: roleId } } })) }
      },
      select: userSelect
    });
  } else if (resource === 'roles') {
    item = await db.role.create({
      data: {
        ...data,
        permissions: { create: (body.permissionIds || []).map(permissionId => ({ permission: { connect: { id: permissionId } } })) }
      },
      include: roleInclude
    });
  } else {
    item = await db[config.model].create({ data });
  }

  await audit(auth.user, 'create', resource, item.id || item.key);
  return json(item, 201);
}

async function updateResource(request, resource, id, body) {
  const config = collection[resource];
  if (!config) return json({ error: 'Unknown resource' }, 404);
  const auth = await authenticate(request);
  if (auth.error) return auth.error;
  if (!auth.permissions.has(config.write)) return json({ error: 'Insufficient permission' }, 403);

  const data = normalize(resource, body);
  const where = resource === 'settings' ? { key: id } : { id };
  let item;

  if (['pages', 'blogs'].includes(resource)) {
    if (body.translations) {
      data.translations = {
        deleteMany: {},
        create: body.translations.map(value => ({
          ...(resource === 'pages' ? { summary: String(value.summary || '') } : { excerpt: String(value.excerpt || '') }),
          locale: String(value.locale || 'en'),
          title: String(value.title || ''),
          body: safeBody(value.body)
        }))
      };
    }
    item = await db[config.model].update({ where, data, include: config.include });
  } else if (resource === 'users') {
    if (body.password) data.passwordHash = await bcrypt.hash(z.string().min(12).parse(body.password), 12);
    if (body.roleIds) data.roles = { deleteMany: {}, create: body.roleIds.map(roleId => ({ role: { connect: { id: roleId } } })) };
    item = await db.user.update({ where, data, select: userSelect });
  } else if (resource === 'roles') {
    if (body.permissionIds) data.permissions = { deleteMany: {}, create: body.permissionIds.map(permissionId => ({ permission: { connect: { id: permissionId } } })) };
    item = await db.role.update({ where, data, include: roleInclude });
  } else {
    item = await db[config.model].update({ where, data });
  }

  await audit(auth.user, 'update', resource, id);
  return json(item);
}

async function deleteResource(request, resource, id) {
  const config = collection[resource];
  if (!config) return json({ error: 'Unknown resource' }, 404);
  const auth = await authenticate(request);
  if (auth.error) return auth.error;
  const permission = `${resource}.delete`;
  if (!auth.permissions.has(permission)) return json({ error: `Permission required: ${permission}` }, 403);
  if (resource === 'users' && id === auth.user.id) return json({ error: 'Cannot delete your own account' }, 400);

  await db[config.model].delete({ where: resource === 'settings' ? { key: id } : { id } });
  await audit(auth.user, 'delete', resource, id);
  return json({ ok: true });
}

async function handleGet(request, parts, url) {
  const route = parts.join('/');
  if (route === 'health') return json({ ok: true, service: 'cssr-nextjs-api', database: 'neon-postgresql' });

  if (route === 'auth/csrf') {
    const token = randomBytes(32).toString('hex');
    const response = json({ csrf: token });
    response.cookies.set('cssr_csrf', token, {
      httpOnly: false,
      sameSite: 'lax',
      secure: cookieOptions.secure,
      path: '/'
    });
    return response;
  }

  if (route === 'auth/me') {
    const auth = await authenticate(request);
    if (auth.error) return auth.error;
    return json({
      id: auth.user.id,
      name: auth.user.name,
      email: auth.user.email,
      roles: auth.user.roles.map(item => item.role.name),
      permissions: [...auth.permissions]
    });
  }

  if (route === 'public/site') {
    const [settings, menus, slides] = await Promise.all([
      getSettings(),
      db.menuItem.findMany({ where: { visible: true } }),
      db.homeSlide.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } })
    ]);
    return json({ settings, menus: menuTree(menus), slides });
  }

  if (route === 'public/pages') {
    const rows = await db.page.findMany({ where: { status: 'PUBLISHED' }, include: pageInclude, orderBy: { sortOrder: 'asc' } });
    return json(rows.map(row => formatTranslated(row, url.searchParams.get('lang') || 'en')));
  }

  if (parts[0] === 'public' && parts[1] === 'page' && parts.length >= 3) {
    const slug = parts.slice(2).join('/');
    const row = await db.page.findUnique({ where: { slug, status: 'PUBLISHED' }, include: pageInclude });
    if (!row) return json({ error: 'Page not found or not published' }, 404);
    return json(formatTranslated(row, url.searchParams.get('lang') || 'en'));
  }

  if (route === 'public/blogs') {
    const rows = await db.blog.findMany({ where: { status: 'PUBLISHED' }, include: blogInclude, orderBy: { publishedAt: 'desc' } });
    return json(rows.map(row => formatTranslated(row, url.searchParams.get('lang') || 'en')));
  }

  if (parts[0] === 'public' && parts[1] === 'blog' && parts.length === 3) {
    const row = await db.blog.findUnique({ where: { slug: parts[2], status: 'PUBLISHED' }, include: blogInclude });
    if (!row) return json({ error: 'Article not found' }, 404);
    return json(formatTranslated(row, url.searchParams.get('lang') || 'en'));
  }

  if (route === 'public/search') {
    const query = String(url.searchParams.get('q') || '').trim().slice(0, 80);
    if (query.length < 2) return json([]);
    const contains = { contains: query, mode: 'insensitive' };
    const [pages, blogs] = await Promise.all([
      db.page.findMany({ where: { status: 'PUBLISHED', OR: [{ slug: contains }, { translations: { some: { title: contains } } }] }, include: pageInclude, take: 20 }),
      db.blog.findMany({ where: { status: 'PUBLISHED', OR: [{ slug: contains }, { translations: { some: { title: contains } } }] }, include: blogInclude, take: 20 })
    ]);
    const lang = url.searchParams.get('lang') || 'en';
    return json([
      ...pages.map(row => ({ title: translationFor(row, lang).title, url: `/${row.slug}`, type: 'Page' })),
      ...blogs.map(row => ({ title: translationFor(row, lang).title, url: `/blog/${row.slug}`, type: 'Blog' }))
    ]);
  }

  if (route === 'admin/dashboard') {
    const auth = await authenticate(request);
    if (auth.error) return auth.error;
    if (!auth.permissions.has('dashboard.read')) return json({ error: 'Permission required: dashboard.read' }, 403);
    const [pages, blogs, inquiries, users, visits, logs] = await Promise.all([
      db.page.count(), db.blog.count(), db.inquiry.count(), db.user.count(),
      db.dailyVisit.findMany({ orderBy: { date: 'desc' }, take: 30 }),
      db.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 8, include: { user: { select: { name: true } } } })
    ]);
    return json({ stats: { pages, blogs, inquiries, users }, visits: visits.reverse(), logs });
  }

  if (route === 'admin/reports') {
    const auth = await authenticate(request);
    if (auth.error) return auth.error;
    if (!auth.permissions.has('reports.read')) return json({ error: 'Permission required: reports.read' }, 403);
    const [views, content, inquiryStatuses] = await Promise.all([
      db.dailyVisit.findMany({ orderBy: { date: 'desc' }, take: 90 }),
      db.page.groupBy({ by: ['status'], _count: { _all: true } }),
      db.inquiry.groupBy({ by: ['status'], _count: { _all: true } })
    ]);
    return json({ views, content, inquiryStatuses });
  }

  if (parts[0] === 'admin' && parts.length === 2) return getResource(request, parts[1]);
  return json({ error: 'API route not found' }, 404);
}

async function handlePost(request, parts, pathname) {
  const route = parts.join('/');
  // Multipart uploads must be parsed with formData() before consuming the body as JSON.
  if (route === 'admin/media/upload') {
    const auth = await authenticate(request);
    if (auth.error) return auth.error;
    if (!auth.permissions.has('media.write')) return json({ error: 'Permission required: media.write' }, 403);

    const form = await request.formData();
    const file = form.get('file');
    if (!file || typeof file.arrayBuffer !== 'function') return json({ error: 'Choose a PNG, JPG, WEBP or PDF file.' }, 400);
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowed.includes(file.type) || file.size > 4 * 1024 * 1024) {
      return json({ error: 'Choose a PNG, JPG, WEBP or PDF under 4MB.' }, 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const safeName = path.basename(file.name || 'upload').replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 100);
    let mediaUrl;
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const blob = await put(`cssr-media/${randomUUID()}-${safeName}`, buffer, { access: 'public', contentType: file.type });
      mediaUrl = blob.url;
    } else if (process.env.NODE_ENV !== 'production') {
      const filename = `${randomUUID()}-${safeName}`;
      await mkdir(path.join(process.cwd(), 'public', 'uploads'), { recursive: true });
      await writeFile(path.join(process.cwd(), 'public', 'uploads', filename), buffer);
      mediaUrl = `/uploads/${filename}`;
    } else {
      return json({ error: 'Connect Vercel Blob and set BLOB_READ_WRITE_TOKEN to enable persistent media uploads.' }, 503);
    }
    const item = await db.media.create({ data: { filename: file.name || safeName, url: mediaUrl, mime: file.type, size: file.size } });
    await audit(auth.user, 'upload', 'media', item.id);
    return json(item, 201);
  }

  const body = await readJson(request);

  if (route === 'auth/login') {
    if (!rateLimit(`login:${request.headers.get('x-forwarded-for') || 'unknown'}`, 15, 15 * 60 * 1000)) {
      return json({ error: 'Too many login attempts. Please try again later.' }, 429);
    }
    const credentials = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(body);
    const user = await db.user.findUnique({
      where: { email: credentials.email.trim().toLowerCase() },
      include: {
        roles: {
          include: {
            role: {
              include: { permissions: { include: { permission: true } } }
            }
          }
        }
      }
    });
    if (!user || !user.active || !(await bcrypt.compare(credentials.password, user.passwordHash))) {
      return json({ error: 'Invalid email or password' }, 401);
    }
    const token = jwt.sign({ sub: user.id }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '8h' });
    const response = json({
      id: user.id,
      name: user.name,
      email: user.email,
      permissions: permissionsOf(user),
      roles: user.roles.map(item => item.role.name)
    });
    response.cookies.set('cssr_session', token, { ...cookieOptions, maxAge: 8 * 60 * 60 });
    return response;
  }

  if (route === 'auth/logout') {
    const response = json({ ok: true });
    response.cookies.set('cssr_session', '', { ...cookieOptions, maxAge: 0 });
    return response;
  }

  if (route === 'public/contact') {
    if (!rateLimit(`contact:${request.headers.get('x-forwarded-for') || 'unknown'}`, 8, 60 * 60 * 1000)) {
      return json({ error: 'Too many messages. Please try again later.' }, 429);
    }
    const data = z.object({
      name: z.string().trim().min(2).max(100),
      email: z.string().trim().email().max(200),
      subject: z.string().trim().min(3).max(180),
      message: z.string().trim().min(10).max(5000),
      website: z.string().optional()
    }).parse(body);
    if (data.website) return json({ ok: true });
    await db.inquiry.create({ data: { name: data.name, email: data.email, subject: data.subject, message: data.message } });
    return json({ ok: true, message: 'Your message has been received.' }, 201);
  }

  if (route === 'public/visit') {
    const now = new Date();
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    await db.dailyVisit.upsert({ where: { date }, create: { date, views: 1 }, update: { views: { increment: 1 } } });
    return json({ ok: true });
  }


  if (parts[0] === 'admin' && parts.length === 2) return createResource(request, parts[1], body);
  return json({ error: 'API route not found' }, 404);
}

async function handlePut(request, parts) {
  const body = await readJson(request);
  if (parts[0] === 'admin' && parts.length === 3) return updateResource(request, parts[1], decodeURIComponent(parts[2]), body);
  return json({ error: 'API route not found' }, 404);
}

async function handleDelete(request, parts) {
  if (parts[0] === 'admin' && parts.length === 3) return deleteResource(request, parts[1], decodeURIComponent(parts[2]));
  return json({ error: 'API route not found' }, 404);
}

async function dispatch(request, method) {
  const url = new URL(request.url);
  const parts = url.pathname.split('/').filter(Boolean).slice(1).map(decodeURIComponent);
  const pathname = url.pathname;

  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 || process.env.JWT_SECRET.includes('REPLACE_WITH')) {
    return json({ error: 'JWT_SECRET must be configured with a new random secret of at least 32 characters.' }, 500);
  }

  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const validationError = validateMutation(request, pathname);
    if (validationError) return validationError;
  }

  try {
    if (method === 'GET') return await handleGet(request, parts, url);
    if (method === 'POST') return await handlePost(request, parts, pathname);
    if (method === 'PUT') return await handlePut(request, parts);
    if (method === 'DELETE') return await handleDelete(request, parts);
    return json({ error: 'Method not allowed' }, 405);
  } catch (error) {
    console.error('CSSR API error:', error);
    if (error instanceof ZodError) {
      return json({ error: error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ') }, 400);
    }
    if (error?.code === 'P2002') return json({ error: 'This value already exists.' }, 409);
    if (error?.code === 'P2025') return json({ error: 'Record not found' }, 404);
    if (error?.message === 'Invalid status') return json({ error: error.message }, 400);
    return json({ error: 'The request could not be completed.' }, 500);
  }
}

export function GET(request) { return dispatch(request, 'GET'); }
export function POST(request) { return dispatch(request, 'POST'); }
export function PUT(request) { return dispatch(request, 'PUT'); }
export function DELETE(request) { return dispatch(request, 'DELETE'); }
