import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { neonConfig } from '@neondatabase/serverless';
import WebSocket from 'ws';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is missing. Add your Neon pooled connection string to .env or Vercel Environment Variables.');
}

if (!process.env.DATABASE_URL_UNPOOLED) {
  console.warn('DATABASE_URL_UNPOOLED is not set. Runtime queries can work, but Prisma CLI schema operations need the direct Neon URL.');
}

neonConfig.webSocketConstructor = WebSocket;

const globalForPrisma = globalThis;

const adapter = new PrismaNeon({
  connectionString: process.env.DATABASE_URL
});

export const db = globalForPrisma.cssrPrisma || new PrismaClient({ adapter });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.cssrPrisma = db;
}
