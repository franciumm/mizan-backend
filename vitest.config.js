import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: [],
    pool: 'forks', // isolate DB tests
    env: {
      MONGODB_DB_NAME: 'mizan-test'
    }
  },
});
