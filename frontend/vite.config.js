import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sharedPath = fs.existsSync(path.resolve(__dirname, '../shared'))
  ? path.resolve(__dirname, '../shared')
  : path.resolve(__dirname, './shared');

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['tests/e2e/**'],
  },
  resolve: {
    alias: {
      '@shared': sharedPath,
    },
  },
  server: {
    port: 5173,
    host: true,
    strictPort: true,
    allowedHosts: ['learned-nikon-dec-package.trycloudflare.com'],
    hmr: {
      clientPort: 443,
    },
  },
});
