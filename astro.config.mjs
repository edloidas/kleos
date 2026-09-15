// @ts-check
import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://kleos.edloidas.io',
  // Every page reads bindings (allowlist, cache), so nothing can be prerendered.
  output: 'server',
  // Nothing uses sessions; leaving them on makes the adapter ask for a KV namespace.
  session: false,
  adapter: cloudflare(),
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
});
