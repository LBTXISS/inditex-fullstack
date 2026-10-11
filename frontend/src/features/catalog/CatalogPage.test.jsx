import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { CatalogPage } from './CatalogPage.jsx';
import { catalogRepository } from './catalogRepository.js';

vi.mock('./catalogRepository.js', () => ({ catalogRepository: { getProducts: vi.fn(), expiresAt: () => undefined } }));
afterEach(cleanup);

const products = [
  { id: '1', brand: 'Acer', model: 'Iconia', price: 170, imageUrl: '/1.jpg' },
  { id: '2', brand: 'Alcatel', model: 'Flash', price: null, imageUrl: '/2.jpg' },
];

describe('CatalogPage', () => {
  /** Caso cubierto: loads products, filters locally and presents unavailable price. */
  it('loads products, filters locally and presents unavailable price', async () => {
    // Given (Dado): catálogo simulado y router local sin API real.
    vi.mocked(catalogRepository.getProducts).mockResolvedValue(products);
    // When (Cuando): activar el comportamiento o la interacción que se evalúa.
    render(<MemoryRouter><CatalogPage /></MemoryRouter>);
    // Then (Entonces): verificar el contrato observable y los efectos permitidos.
    expect(screen.getByRole('status')).toHaveTextContent('Cargando');
    await screen.findByText('Iconia');
    expect(screen.getByText('Precio no disponible')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'flash' } });
    expect(screen.queryByText('Iconia')).not.toBeInTheDocument();
    expect(screen.getByText('Flash')).toBeInTheDocument();
    expect(catalogRepository.getProducts).toHaveBeenCalledOnce();
  });

  /** Caso cubierto: offers a retry after a failed load. */
  it('offers a retry after a failed load', async () => {
    // Given (Dado): catálogo simulado y router local sin API real.
    vi.mocked(catalogRepository.getProducts).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(products);
    // When (Cuando): activar el comportamiento o la interacción que se evalúa.
    render(<MemoryRouter><CatalogPage /></MemoryRouter>);
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    // Then (Entonces): verificar el contrato observable y los efectos permitidos.
    await waitFor(() => expect(screen.getByText('Iconia')).toBeInTheDocument());
  });
});
