import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup/test-env.js'],
    coverage: {
      reporter: ['text', 'lcov'],
      include: ['commands/**/*.js', 'services/**/*.js', 'utils/**/*.js'],
    },
  },
});
