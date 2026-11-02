import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 30000,
    server: {
      deps: {
        // Les packages workspace liés en .ts sont inlinés pour être transpilés.
        inline: [/@suivi\/shared/],
      },
    },
  },
});
