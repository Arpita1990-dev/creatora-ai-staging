/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['studio', 'ai-agent', 'workflow-builder', 'design-agent'],
  serverExternalPackages: ['@ffmpeg-installer/ffmpeg', '@ffmpeg-installer/win32-x64', 'bullmq'],
  outputFileTracingExcludes: {
    '/*': [
      './.next/cache/**/*',
      './uploads/**/*',
      './.data/**/*',
      './backups/**/*',
      './docs/**/*',
      './public/**/*',
      './scripts/**/*',
      './tests/**/*',
      './prisma/**/*.db',
      './prisma/**/*.db-*',
      './prisma/migrations/**/*',
      './prisma/postgresql-migrations/**/*',
      './generated/**/*.tmp*',
      './.env',
      './.env.local',
    ],
  },
  devIndicators: {
    appIsrStatus: false,
    buildActivity: false,
    position: 'bottom-right',
  },
};

export default nextConfig;
