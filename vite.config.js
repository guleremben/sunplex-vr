import { defineConfig } from 'vite';

// VR gozluk testi icin: `npm run dev -- --mode https` ile basic-ssl devreye girer
// (Quest tarayicisi localhost disinda HTTPS ister). Normal gelistirmede sade HTTP.
export default defineConfig(async ({ mode }) => {
  const plugins = [];
  if (mode === 'https') {
    const { default: basicSsl } = await import('@vitejs/plugin-basic-ssl');
    plugins.push(basicSsl());
  }
  return {
    // GitHub Pages alt dizininde de calissin diye goreli taban
    base: './',
    plugins,
    server: {
      port: 5183,
      host: true
    }
  };
});
