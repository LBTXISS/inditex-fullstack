import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LoadingSkeleton } from './LoadingSkeleton.jsx';

describe('LoadingSkeleton', () => {
  afterEach(cleanup);
  /** Caso cubierto: announces loading without fake controls (detail=%s). */
  it.each([false, true])('announces loading without fake controls (detail=%s)', (detail) => {
    // Given (Dado): variante PLP/PDP sin datos de negocio.
    // When (Cuando): activar el comportamiento o la interacción que se evalúa.
    const { container } = render(<LoadingSkeleton detail={detail} />);
    // Then (Entonces): verificar el contrato observable y los efectos permitidos.
    expect(screen.getByRole('status')).toHaveTextContent(
      detail ? 'Cargando producto…' : 'Cargando productos…',
    );
    expect(container.querySelectorAll('[aria-hidden="true"] .skeleton-card')).toHaveLength(detail ? 2 : 4);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
