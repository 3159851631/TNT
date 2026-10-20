import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://explodingtnt.pages.dev',
  integrations: [sitemap()],
  build: { format: 'directory' },
  devToolbar: { enabled: false },
  vite: {
    server: {
      watch: {
        ignored: ['**/_tools/**', '**/dist/**', '**/node_modules/**'],
      },
    },
  },
});
