import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';

const sharedPath = fs.existsSync(path.resolve(__dirname, '../shared'))
  ? path.resolve(__dirname, '../shared')
  : path.resolve(__dirname, './shared');

export default defineConfig({
  plugins: [react()],
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
