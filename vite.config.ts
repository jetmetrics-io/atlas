import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './', // относительные пути → dist можно хостить где угодно и открывать через любой статик-сервер
  plugins: [react()],
  server: { port: 5180, open: true },
})
