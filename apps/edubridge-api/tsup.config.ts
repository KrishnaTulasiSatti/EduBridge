import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  clean: true,
  splitting: false,
  // Bundle the shared workspace package (it ships TypeScript source).
  noExternal: ['@edubridge/shared', '@eduvault/shared'],
});
