/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  serverExternalPackages: [
    '@prisma/client',
    '@prisma/adapter-neon',
    '@neondatabase/serverless',
    'ws'
  ]
};

export default nextConfig;
