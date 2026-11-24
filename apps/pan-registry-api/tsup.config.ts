import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  clean: true,
  splitting: false,
  // Only loaded when MONGODB_URI is empty (local development); it cannot be bundled.
  external: ['mongodb-memory-server'],
});
