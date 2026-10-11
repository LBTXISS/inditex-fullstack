import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary.jsx';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
/** Caso cubierto: recovers a render exception with safe navigation without deleting storage. */
it('recovers a render exception with safe navigation without deleting storage', () => {
  // Given (Dado): excepción deliberada de render con datos persistidos.
  vi.spyOn(console, 'error').mockImplementation(() => {});
  localStorage.setItem('itx:cart:v1', 'preserved');
  /** Provoca un fallo de render, no un fallo HTTP o asíncrono.
   * @returns {never}
   */
  function Broken() { throw new Error('private diagnostic'); }
  // When (Cuando): activar el comportamiento o la interacción que se evalúa.
  render(<ErrorBoundary><Broken /></ErrorBoundary>);
  // Then (Entonces): verificar el contrato observable y los efectos permitidos.
  expect(screen.getByRole('alert')).not.toHaveTextContent('private diagnostic');
  expect(screen.getByRole('button', { name: 'Recargar' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Volver al catálogo' })).toHaveAttribute('href', '/products');
  expect(localStorage.getItem('itx:cart:v1')).toBe('preserved');
});
