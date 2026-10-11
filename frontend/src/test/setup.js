import '@testing-library/jest-dom/vitest';
import { beforeEach } from 'vitest';

// Given común: aislar persistencia entre escenarios para que ningún test herede un carrito/caché.
beforeEach(() => {
  localStorage.clear();
});
