import { useState } from 'react';

/**
 * Acepta sólo HTTP(S) y conserva nombre accesible si la imagen falla.
 * @param {object} props Fuente y nombre accesible del producto.
 * @param {string} props.src URL externa cuya ausencia o fallo activa el placeholder.
 * @param {string} props.alt Nombre conservado también en la imagen no disponible.
 * @returns {import('react').JSX.Element}
 */
export function ProductImage({ src, alt }) {
  const [failed, setFailed] = useState(false);
  let allowed = false;
  try {
    allowed = ['http:', 'https:'].includes(new URL(src, globalThis.location.origin).protocol) && src.trim() !== '';
  } catch { /* An invalid URL is shown as unavailable rather than used as an image source. */ }
  if (failed || !allowed) return <div className="image-placeholder" role="img" aria-label={alt}>Imagen no disponible</div>;
  return <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} />;
}
