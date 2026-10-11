import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { App } from '../../app/App.jsx';
import { catalogRepository } from './catalogRepository.js';
import { cartStore } from '../cart/useCart.js';
import { CartStore } from '../cart/cartStore.js';
import { normalizeProductDetail } from '../../shared/api/detailNormalizer.js';
import { detailDto } from '../../test/productFixtures.js';

vi.mock('./catalogRepository.js', () => ({ catalogRepository: {
  getProducts: vi.fn(), expiresAt: () => undefined, getProductDetail: vi.fn(), detailExpiresAt: vi.fn(), addToCart: vi.fn(),
} }));
afterEach(() => { cleanup(); vi.useRealTimers(); });
beforeEach(async () => {
  vi.clearAllMocks();
  vi.mocked(catalogRepository.detailExpiresAt).mockReturnValue(undefined);
  await cartStore.enqueue(async () => ({ count: 3 }));
  vi.mocked(catalogRepository.getProductDetail).mockResolvedValue(normalizeProductDetail(detailDto));
});

/** Navegación sintética para comprobar aislamiento de respuestas entre productos.
 * @returns {import('react').JSX.Element}
 */
function Navigator() {
  const navigate = useNavigate();
  return <button onClick={() => navigate('/product/b')}>Abrir B</button>;
}

/** Monta el árbol real con una ruta de detalle y un control de navegación determinista. */
function renderPage() {
  return render(<MemoryRouter initialEntries={[`/product/${detailDto.id}`]}><Navigator /><App /></MemoryRouter>);
}

describe('PDP and cart integration', () => {
  /** Caso cubierto: resets selections when the one-hour revalidation changes available options. */
  it('resets selections when the one-hour revalidation changes available options', async () => {
    // Given (Dado): detalle, opciones y contador sintéticos.
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    let expiry = 1000 + 3600000;
    vi.mocked(catalogRepository.detailExpiresAt).mockImplementation(() => expiry);
    vi.mocked(catalogRepository.getProductDetail).mockResolvedValueOnce(normalizeProductDetail(detailDto))
      .mockImplementationOnce(async () => {
        expiry = Date.now() + 3600000;
        return normalizeProductDetail({ ...detailDto, options: { ...detailDto.options, colors: [{ code: 1, name: 'Blanco' }] } });
      });
    // When (Cuando): activar el comportamiento o la interacción que se evalúa.
    renderPage();
    await act(async () => { await Promise.resolve(); });
    // Then (Entonces): verificar el contrato observable y los efectos permitidos.
    expect(screen.getByLabelText('Color')).toHaveValue('0');
    await act(async () => { await vi.advanceTimersByTimeAsync(3600000); });
    expect(screen.getByLabelText('Color')).toHaveValue('1');
    expect(catalogRepository.getProductDetail).toHaveBeenCalledTimes(2);
  });

  /** Caso cubierto: preselects unique options including code zero, sends once, restores authoritative count and returns to PLP. */
  it('preselects unique options including code zero, sends once, restores authoritative count and returns to PLP', async () => {
    // Given (Dado): detalle, opciones y contador sintéticos.
    /** @type {(value: { count: number }) => void} */
    let resolve = () => {};
    vi.mocked(catalogRepository.addToCart).mockImplementation(() => new Promise((done) => { resolve = done; }));
    vi.mocked(catalogRepository.getProducts).mockResolvedValue([]);
    // When (Cuando): activar el comportamiento o la interacción que se evalúa.
    renderPage();
    await screen.findByRole('heading', { name: 'Iconia' });
    // Then (Entonces): verificar el contrato observable y los efectos permitidos.
    expect(screen.getByLabelText('Color')).toHaveValue('0');
    expect(screen.getByLabelText('Almacenamiento')).toHaveValue('2000');
    const form = screen.getByRole('form', { name: 'Añadir producto al carrito' });
    fireEvent.submit(form);
    fireEvent.submit(form);
    await waitFor(() => expect(catalogRepository.addToCart).toHaveBeenCalledOnce());
    expect(screen.getByRole('button', { name: 'Añadiendo…' })).toBeDisabled();
    expect(catalogRepository.addToCart).toHaveBeenCalledWith({ id: 'a_b-c', colorCode: 0, storageCode: 2000 });
    await act(async () => resolve({ count: 12 }));
    expect(await screen.findByText('Producto añadido al carrito.')).toBeInTheDocument();
    expect(screen.getByLabelText('12 productos en el carrito')).toBeInTheDocument();
    expect(new CartStore().getSnapshot().count).toBe(12);
    fireEvent.click(screen.getByRole('link', { name: 'Volver al catálogo' }));
    await screen.findByRole('heading', { name: 'Dispositivos' });
    expect(screen.getByLabelText('12 productos en el carrito')).toBeInTheDocument();
  });

  /** Caso cubierto: requires explicit choice for multiple options and blocks empty choices. */
  it('requires explicit choice for multiple options and blocks empty choices', async () => {
    // Given (Dado): detalle, opciones y contador sintéticos.
    vi.mocked(catalogRepository.getProductDetail).mockResolvedValue(normalizeProductDetail({ ...detailDto, options: {
      colors: [{ code: 0, name: 'Negro' }, { code: 1, name: 'Blanco' }], storages: [{ code: 2000, name: '16 GB' }, { code: 2001, name: '32 GB' }],
    } }));
    // When (Cuando): activar el comportamiento o la interacción que se evalúa.
    renderPage();
    await screen.findByRole('heading', { name: 'Iconia' });
    const button = screen.getByRole('button', { name: 'Añadir al carrito' });
    // Then (Entonces): verificar el contrato observable y los efectos permitidos.
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Color'), { target: { value: '1' } });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Almacenamiento'), { target: { value: '2001' } });
    expect(button).toBeEnabled();
  });

  /** Caso cubierto: shows both selectors but cannot add when there are no available options. */
  it('shows both selectors but cannot add when there are no available options', async () => {
    // Given (Dado): detalle, opciones y contador sintéticos.
    vi.mocked(catalogRepository.getProductDetail).mockResolvedValue(normalizeProductDetail({ ...detailDto, options: { colors: [], storages: [] } }));
    // When (Cuando): activar el comportamiento o la interacción que se evalúa.
    renderPage();
    await screen.findByRole('heading', { name: 'Iconia' });
    // Then (Entonces): verificar el contrato observable y los efectos permitidos.
    expect(screen.getByLabelText('Color')).toBeDisabled();
    expect(screen.getByLabelText('Almacenamiento')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Añadir al carrito' })).toBeDisabled();
    expect(screen.getByText(/no tiene opciones disponibles/)).toBeInTheDocument();
  });

  /** Caso cubierto: preserves count on failed POST without automatic retry, then accepts a smaller count. */
  it('preserves count on failed POST without automatic retry, then accepts a smaller count', async () => {
    // Given (Dado): detalle, opciones y contador sintéticos.
    vi.mocked(catalogRepository.addToCart).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ count: 1 });
    // When (Cuando): activar el comportamiento o la interacción que se evalúa.
    renderPage();
    await screen.findByRole('heading', { name: 'Iconia' });
    fireEvent.click(screen.getByRole('button', { name: 'Añadir al carrito' }));
    await screen.findByRole('alert');
    // Then (Entonces): verificar el contrato observable y los efectos permitidos.
    expect(screen.getByLabelText('3 productos en el carrito')).toBeInTheDocument();
    expect(catalogRepository.addToCart).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Añadir al carrito' }));
    await screen.findByText('Producto añadido al carrito.');
    expect(screen.getByLabelText('1 productos en el carrito')).toBeInTheDocument();
  });

  /** Caso cubierto: retries failed GET and renders image fallback. */
  it('retries failed GET and renders image fallback', async () => {
    // Given (Dado): detalle, opciones y contador sintéticos.
    vi.mocked(catalogRepository.getProductDetail).mockRejectedValueOnce(new Error('500')).mockResolvedValueOnce(normalizeProductDetail(detailDto));
    // When (Cuando): activar el comportamiento o la interacción que se evalúa.
    renderPage();
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await screen.findByRole('heading', { name: 'Iconia' });
    fireEvent.error(screen.getByRole('img'));
    // Then (Entonces): verificar el contrato observable y los efectos permitidos.
    expect(screen.getByText('Imagen no disponible')).toBeInTheDocument();
  });

  /** Caso cubierto: does not let late detail A overwrite B after rapid navigation. */
  it('does not let late detail A overwrite B after rapid navigation', async () => {
    // Given (Dado): detalle, opciones y contador sintéticos.
    /** @type {(value: import('../../shared/api/detailNormalizer.js').ProductDetail) => void} */
    let resolve = () => {};
    vi.mocked(catalogRepository.getProductDetail).mockImplementationOnce(() => new Promise((done) => { resolve = done; }))
      .mockResolvedValueOnce(normalizeProductDetail({ ...detailDto, id: 'b', model: 'Producto B' }));
    // When (Cuando): activar el comportamiento o la interacción que se evalúa.
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir B' }));
    await screen.findByRole('heading', { name: 'Producto B' });
    await act(async () => resolve(normalizeProductDetail(detailDto)));
    // Then (Entonces): verificar el contrato observable y los efectos permitidos.
    expect(screen.queryByRole('heading', { name: 'Iconia' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Producto B' })).toBeInTheDocument();
  });

  /** Caso cubierto: updates global cart after navigation without leaking old success into B. */
  it('updates global cart after navigation without leaking old success into B', async () => {
    // Given (Dado): detalle, opciones y contador sintéticos.
    /** @type {(value: { count: number }) => void} */
    let resolve = () => {};
    vi.mocked(catalogRepository.addToCart).mockImplementation(() => new Promise((done) => { resolve = done; }));
    // When (Cuando): activar el comportamiento o la interacción que se evalúa.
    renderPage();
    await screen.findByRole('heading', { name: 'Iconia' });
    fireEvent.click(screen.getByRole('button', { name: 'Añadir al carrito' }));
    // Then (Entonces): verificar el contrato observable y los efectos permitidos.
    await waitFor(() => expect(catalogRepository.addToCart).toHaveBeenCalledOnce());
    vi.mocked(catalogRepository.getProductDetail).mockResolvedValueOnce(normalizeProductDetail({ ...detailDto, id: 'b', model: 'Producto B', options: {
      ...detailDto.options, colors: [{ code: 0, name: 'Negro' }, { code: 1, name: 'Blanco' }],
    } }));
    fireEvent.click(screen.getByRole('button', { name: 'Abrir B' }));
    await screen.findByRole('heading', { name: 'Producto B' });
    expect(screen.getByLabelText('Color')).toHaveValue('');
    await act(async () => resolve({ count: 8 }));
    expect(screen.getByLabelText('8 productos en el carrito')).toBeInTheDocument();
    expect(screen.queryByText('Producto añadido al carrito.')).not.toBeInTheDocument();
  });
});
