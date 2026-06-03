import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: process.env.VITE_BASE_URL ?? '/',
  plugins: [react()],
  server: { fs: { allow: ['..'] } },
  resolve: {
    // Stub out Node built-ins that sneak in via @seamlyme/core's file.ts
    alias: {
      'node:fs': '/src/stubs/node-fs.ts',
      'node:path': '/src/stubs/node-path.ts',
    },
  },
});
