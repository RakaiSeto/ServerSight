import path from 'node:path';
import { defineConfig, env } from 'prisma/config';
import 'dotenv/config';

export default defineConfig({
  schema: path.join('prisma'),
  migrations: {
    path: 'prisma/migrations',
    seed: 'prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});