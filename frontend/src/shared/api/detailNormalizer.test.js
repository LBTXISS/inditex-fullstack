import { describe, expect, it } from 'vitest';
import { normalizeProductDetail, isProductDetail } from './detailNormalizer.js';
import { detailDto } from '../../test/productFixtures.js';

describe('Product detail normalization', () => {
  /** Caso cubierto: corrects proven display inversions and preserves canonical data. */
  it('corrects proven display inversions and preserves canonical data', () => {
    // Given (Dado): payload con aliases, ausencias o contradicciones controladas.
    // When (Cuando): activar el comportamiento o la interacción que se evalúa.
    const detail = normalizeProductDetail({ ...detailDto,
      displayResolution: '7.0 inches (~69.8% screen-to-body ratio)',
      displaySize: '720 x 1280 pixels (~210 ppi pixel density)',
    });
    // Then (Entonces): verificar el contrato observable y los efectos permitidos.
    expect(detail.specifications).toEqual(expect.arrayContaining([
      { label: 'Resolución', value: '720 x 1280 pixels (~210 ppi pixel density)' },
      { label: 'Tamaño de pantalla', value: '7.0 inches (~69.8% screen-to-body ratio)' },
    ]));
    expect(normalizeProductDetail(detailDto).specifications).toEqual(expect.arrayContaining([
      { label: 'Resolución', value: '1920 x 1200' },
      { label: 'Tamaño de pantalla', value: '10 inches' },
    ]));
  });

  /** Caso cubierto: does not guess incomplete contradictory display fields. */
  it('does not guess incomplete contradictory display fields', () => {
    // Given (Dado): payload con aliases, ausencias o contradicciones controladas.
    // When (Cuando): activar el comportamiento o la interacción que se evalúa.
    const detail = normalizeProductDetail({ ...detailDto, displayResolution: '7 inches', displaySize: '' });
    // Then (Entonces): verificar el contrato observable y los efectos permitidos.
    expect(detail.specifications).toEqual(expect.arrayContaining([
      { label: 'Resolución', value: 'No disponible' },
      { label: 'Tamaño de pantalla', value: 'No disponible' },
    ]));
    const empty = normalizeProductDetail({ ...detailDto, displayResolution: null, displaySize: {} });
    expect(empty.specifications).toEqual(expect.arrayContaining([
      { label: 'Resolución', value: 'No disponible' },
      { label: 'Tamaño de pantalla', value: 'No disponible' },
    ]));
  });
  /** Caso cubierto: maps aliases, arrays and unavailable data into safe text. */
  it('maps aliases, arrays and unavailable data into safe text', () => {
    // Given (Dado): payload con aliases, ausencias o contradicciones controladas.
    // When (Cuando): activar el comportamiento o la interacción que se evalúa.
    const detail = normalizeProductDetail(detailDto);
    // Then (Entonces): verificar el contrato observable y los efectos permitidos.
    expect(detail.specifications).toEqual(expect.arrayContaining([
      { label: 'Cámara principal', value: '5 MP / Autofocus' },
      { label: 'Cámara secundaria', value: '2 MP' },
      { label: 'Dimensiones', value: '259 x 167 x 9 mm' },
      { label: 'Peso', value: 'No disponible' },
    ]));
    expect(detail.colors[0].code).toBe(0);
    expect(isProductDetail(detail)).toBe(true);
    expect(Object.isFrozen(detail.specifications)).toBe(true);
  });

  /** Caso cubierto: prefers corrected nonempty aliases and never renders an object. */
  it('prefers corrected nonempty aliases and never renders an object', () => {
    // Given (Dado): payload con aliases, ausencias o contradicciones controladas.
    // When (Cuando): activar el comportamiento o la interacción que se evalúa.
    const detail = normalizeProductDetail({ ...detailDto, dimensions: 'Corrected', secondaryCamera: ['Front', '2 MP'], cpu: { private: 'value' }, price: '' });
    // Then (Entonces): verificar el contrato observable y los efectos permitidos.
    expect(detail.price).toBeNull();
    expect(detail.specifications).toEqual(expect.arrayContaining([
      { label: 'Dimensiones', value: 'Corrected' }, { label: 'Cámara secundaria', value: 'Front / 2 MP' }, { label: 'CPU', value: 'No disponible' },
    ]));
  });

  /** Caso cubierto: rejects duplicate option codes and invalid persisted models. */
  it('rejects duplicate option codes and invalid persisted models', () => {
    // Given (Dado): payload con aliases, ausencias o contradicciones controladas.
    // When (Cuando): invocar la operación que se verifica en la aserción.
    // Then (Entonces): verificar el contrato observable y los efectos permitidos.
    expect(() => normalizeProductDetail({ ...detailDto, options: { ...detailDto.options, colors: [{ code: 0, name: 'A' }, { code: 0, name: 'B' }] } })).toThrow();
    expect(isProductDetail({ ...normalizeProductDetail(detailDto), specifications: [{}] })).toBe(false);
  });
});
