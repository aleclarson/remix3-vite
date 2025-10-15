import { defineConfig } from 'vite'
import { remix3 } from './src/vite/plugin'

export default defineConfig({
  plugins: [remix3()],
  server: {
    port: 3000,
  },
})
