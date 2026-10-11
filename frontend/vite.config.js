import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// jsdom cubre contratos y estado; la aceptación Chrome verifica bootstrap y layout reales.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    clearMocks: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{js,jsx}'],
      exclude: ['src/**/*.test.{js,jsx}', 'src/test/**'],
      reporter: ['text', 'html', 'lcov', 'json-summary'],
    },
  },
});
