import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * Two projects so a hook can run one without the other: pre-push runs `unit`, and
 * the jsdom `components` project stays CI-only.
 *
 * Plain Vite config rather than astro's `getViteConfig`, which would pull the
 * Cloudflare adapter and every integration into test startup.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/lib/**/*.test.ts'],
        },
      },
      {
        plugins: [react()],
        test: {
          name: 'components',
          environment: 'jsdom',
          include: ['src/components/**/*.test.tsx'],
          setupFiles: ['./vitest.setup.ts'],
        },
      },
    ],
  },
});
