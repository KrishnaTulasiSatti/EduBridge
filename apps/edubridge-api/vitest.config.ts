import os from 'node:os';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    // Tests always use an in-memory database and a throwaway upload folder.
    env: {
      NODE_ENV: 'test',
      UPLOAD_DIR: path.join(os.tmpdir(), 'edubridge-test-uploads'),
    },
  },
});
