/** @type {import('vite').UserConfig} */
import { defineConfig } from 'vite';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import { Buffer } from 'buffer';

export default defineConfig({
  root: 'src',
  publicDir: '../public',
  base: '/',

  server: {
    open: '/index.html',
  },

  css: {
    postcss: {
      plugins: [tailwindcss, autoprefixer],
    },
  },

  optimizeDeps: {
    include: [
      'buffer',
      'ethers',
      '@solana/spl-token',
      '@solana/web3.js',
      '@viaprotocol/web3-wallets',
      '@solana/spl-name-service'
    ],
    force: true,
    esbuildOptions: {
      define: {
        global: 'globalThis',
        'global.Buffer': 'Buffer',
      },
    },
  },

  resolve: {
    alias: {
      buffer: 'buffer',
      '@solana/spl-token': '@solana/spl-token',
      '@solana/web3.js': '@solana/web3.js',
      '@solana/spl-name-service': '@solana/spl-name-service',
    },
  },

  define: {
    'global.Buffer': 'Buffer',
    'global': 'globalThis',
    'process.env': {},
  },

  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: 'src/index.html',
        addVolume: 'src/add-volume.html',
        about: 'src/about.html',
      },
      external: [],
    },
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },

  esbuild: {
    target: 'esnext',
  },
});