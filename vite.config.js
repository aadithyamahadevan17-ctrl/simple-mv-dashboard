import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Relative asset paths allow deployment at a GitHub Pages repository URL.
export default defineConfig({
  base: './',
  plugins: [react()],
})
