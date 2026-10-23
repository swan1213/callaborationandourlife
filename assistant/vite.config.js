import { createRequire } from 'node:module';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The server's port, from NEXT_PUBLIC_ASSISTANT_URL in TailorBid's .env.local (default 4317).
const { PORT } = createRequire(import.meta.url)('./server/env.cjs');

// In development the local server (server/index.cjs) handles /api; in production it also
// serves the built app from dist/ with a strict Content-Security-Policy.
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    open: true,
    proxy: { '/api': `http://127.0.0.1:${PORT}` },
  },
});
