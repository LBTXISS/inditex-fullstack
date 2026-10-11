import { describe, expect, it } from 'vitest';
import { filterProducts, normalizeProductSummary } from './normalizers.js';

describe('product normalizers', () => {
  /** Caso cubierto: keeps opaque IDs and represents missing price without inventing currency. */
  it('keeps opaque IDs and represents missing price without inventing currency', () => {
    // Given (Dado): precios e IDs opacos sintéticos.
    // When (Cuando): invocar la operación que se verifica en la aserción.
    // Then (Entonces): verificar el contrato observable y los efectos permitidos.
    expect(normalizeProductSummary({
      id: '8hKbH2UHPM_944nRHYN1n', brand: ' Acer ', model: 'Liquid', price: '', imgUrl: '/image.jpg',
    })).toEqual({
      id: '8hKbH2UHPM_944nRHYN1n', brand: 'Acer', model: 'Liquid', price: null, imageUrl: '/image.jpg',
    });
  });

  /** Caso cubierto: filters brand and model locally ignoring case and diacritics. */
  it('filters brand and model locally ignoring case and diacritics', () => {
    // Given (Dado): precios e IDs opacos sintéticos.
    const products = [
      { id: '1', brand: 'Ácer', model: 'Líquid Z6', price: 120, imageUrl: '/1.jpg' },
      { id: '2', brand: 'Apple', model: 'Phone', price: null, imageUrl: '/2.jpg' },
    ];
    // When (Cuando): invocar la operación que se verifica en la aserción.
    // Then (Entonces): verificar el contrato observable y los efectos permitidos.
    expect(filterProducts(products, 'acer liquid')).toEqual([products[0]]);
    expect(filterProducts(products, 'PHONE')).toEqual([products[1]]);
  });
});
