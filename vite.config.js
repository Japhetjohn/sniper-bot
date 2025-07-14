/** @type {import('vite').UserConfig} */
import { defineConfig } from 'vite';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

export default defineConfig({
  root: 'src', // Project root is src
  publicDir: '../public', // Public assets outside src
  base: '/', // Adjust to '/repo-name/' if hosting in a subdirectory

  server: {
    open: '/index.html' // Open index.html in dev
  },
  css: {
    postcss: {
      plugins: [
        tailwindcss,
        autoprefixer
      ]
    }
  },
  optimizeDeps: {
    include: ['ethers'] // Pre-bundle ethers for faster dev
  },
  build: {
    outDir: '../dist', // Output build files into dist folder outside src
    emptyOutDir: true, // Clear dist folder before building
  }
});