import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.js'),
      name: 'PortID',
      fileName: 'portid-sdk',
      formats: ['es', 'umd'],
    },
    rollupOptions: {
      external: ['dexie'],
      output: {
        globals: {
          dexie: 'Dexie',
        },
      },
    },
  },
});
