import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { ProductImage } from './ProductImage.jsx';

afterEach(cleanup);
/** Caso cubierto: never loads an image with an unsafe URL scheme. */
it('never loads an image with an unsafe URL scheme', () => {
  // Given (Dado): URL sintética de esquema inseguro.
  // When (Cuando): activar el comportamiento o la interacción que se evalúa.
  render(<ProductImage src="javascript:alert(1)" alt="Producto" />);
  // Then (Entonces): verificar el contrato observable y los efectos permitidos.
  expect(screen.getByRole('img', { name: 'Producto' })).not.toHaveAttribute('src');
  expect(screen.getByText('Imagen no disponible')).toBeInTheDocument();
});
