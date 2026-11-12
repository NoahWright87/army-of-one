import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
  },
  define: {
    // (PHASE12-e) Netlify's permanent URL for this exact deploy: shared replay links point at
    // it, so they keep working after the game is updated ([D79]). Empty elsewhere (the links
    // then use the page's own address).
    __AOO_DEPLOY_URL__: JSON.stringify(process.env.DEPLOY_URL ?? ''),
  },
});
