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
  // The app transforms no images, and the default binding publishes a billable
  // /_image transform endpoint that anyone can call.
  adapter: cloudflare({ imageService: 'passthrough' }),
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
});
