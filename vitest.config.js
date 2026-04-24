import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
  },
  resolve: {
    alias: {
      'cloudflare:workers': path.resolve(__dirname, 'tests/__mocks__/cloudflare-workers.js'),
    },
  },
});
