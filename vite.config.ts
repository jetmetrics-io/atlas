import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Английская сборка (Map Library, VITE_LANG=en — см. npm run dev:en / build:en):
// язык, заголовок и описание страницы. Русская сборка этот плагин не подключает.
const enHtml: Plugin = {
  name: 'map-library-html',
  transformIndexHtml: (html) => html
    .replace('<html lang="ru">', '<html lang="en">')
    .replace(/<title>[^<]*<\/title>/, '<title>Map Library · JetMetrics</title>')
    .replace(/<meta name="description" content="[^"]*" \/>/,
      '<meta name="description" content="Interactive metric maps by industry: what affects what, directly or inversely, and which levers you can pull." />'),
}

export default defineConfig({
  base: './', // относительные пути → dist можно хостить где угодно и открывать через любой статик-сервер
  plugins: [react(), ...(process.env.VITE_LANG === 'en' ? [enHtml] : [])],
  server: { port: 5180, open: true, fs: { allow: ['..', '../..'] } },
})
