import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useCachedResource } from '../../shared/cache/useCachedResource.js';
import { ProductImage } from '../../shared/ui/ProductImage.jsx';
import { LoadingSkeleton } from '../../shared/ui/LoadingSkeleton.jsx';
import { cartStore, useCart } from '../cart/useCart.js';
import { catalogRepository } from './catalogRepository.js';

/** Usa la ruta como frontera de estado para aislar respuestas tardías y selecciones.
 * @returns {import('react').JSX.Element} */
export function ProductDetailPage() {
  const { productId = '' } = useParams();
  // A new route identity resets selections immediately and isolates late responses.
  return <DetailResource key={productId} productId={productId} />;
}

/**
 * Gestiona el detalle de un ID con caché y reintento explícito de lectura.
 * @param {object} props Identidad del recurso aislado por navegación.
 * @param {string} props.productId ID opaco recibido de la ruta.
 * @returns {import('react').JSX.Element}
 */
function DetailResource({ productId }) {
  const load = useCallback(() => catalogRepository.getProductDetail(productId), [productId]);
  const expiresAt = useCallback(() => catalogRepository.detailExpiresAt(productId), [productId]);
  const resource = useCachedResource(load, expiresAt);
  return (
    <main className="page" id="main-content" tabIndex={-1}>
      <Link className="back-link" to="/products">Volver al catálogo</Link>
      {resource.status === 'loading' && <LoadingSkeleton detail />}
      {resource.status === 'error' && <div className="status error" role="alert">
        <p>No hemos podido cargar el producto.</p>
        <button type="button" onClick={resource.retry}>Reintentar</button>
      </div>}
      {resource.status === 'success' && resource.data && <DetailContent key={expiresAt()} product={resource.data} />}
    </main>
  );
}

/**
 * Preselecciona sólo opciones únicas; varias requieren elección explícita y cero es un código válido.
 * @param {object} props Detalle validado e inmutable.
 * @param {import('../../shared/api/detailNormalizer.js').ProductDetail} props.product Opciones actuales; no se reutilizan selecciones de una versión anterior.
 * @returns {import('react').JSX.Element}
 */
function DetailContent({ product }) {
  const { sending } = useCart();
  const [color, setColor] = useState(product.colors.length === 1 ? String(product.colors[0].code) : '');
  const [storage, setStorage] = useState(product.storages.length === 1 ? String(product.storages[0].code) : '');
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const submitting = useRef(false);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const available = product.colors.length > 0 && product.storages.length > 0;
  const valid = color !== '' && storage !== ''
    && product.colors.some((option) => option.code === Number(color))
    && product.storages.some((option) => option.code === Number(storage));

  /**
   * Evita doble envío antes del siguiente render; un POST incierto nunca se reintenta automáticamente.
   * @param {import('react').FormEvent<HTMLFormElement>} event
   */
  async function submit(event) {
    event.preventDefault();
    if (!valid || submitting.current || cartStore.getSnapshot().sending) return;
    submitting.current = true;
    setMessage('');
    setFailed(false);
    try {
      await cartStore.enqueue(() => catalogRepository.addToCart({ id: product.id, colorCode: Number(color), storageCode: Number(storage) }));
      if (mounted.current) setMessage('Producto añadido al carrito.');
    } catch {
      if (mounted.current) {
        setFailed(true);
        setMessage('No hemos podido confirmar el alta. Si se perdió la conexión, el servidor puede haberla recibido y el contador no reflejarla. Repetir podría duplicarla.');
      }
    } finally {
      submitting.current = false;
    }
  }

  return <div className="product-detail">
    <div className="detail-image"><ProductImage key={product.imageUrl} src={product.imageUrl} alt={`${product.brand} ${product.model}`} /></div>
    <section className="detail-info" aria-label="Descripción y opciones">
      <p className="eyebrow">{product.brand || 'Marca no disponible'}</p>
      <h1>{product.model || 'Modelo no disponible'}</h1>
      <p className="detail-price">{product.price === null ? 'Precio no disponible' : product.price}</p>
      <dl className="specifications">{product.specifications.map(({ label, value }) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      <form className="cart-form" onSubmit={submit} aria-label="Añadir producto al carrito">
        <div className="option-field"><label htmlFor="product-color">Color</label><select id="product-color" value={color} disabled={sending || !product.colors.length} onChange={(event) => { setColor(event.target.value); setMessage(''); }}>
          <option value="">Selecciona color</option>
          {product.colors.map((option) => <option key={option.code} value={option.code}>{option.name}</option>)}
        </select></div>
        <div className="option-field"><label htmlFor="product-storage">Almacenamiento</label><select id="product-storage" value={storage} disabled={sending || !product.storages.length} onChange={(event) => { setStorage(event.target.value); setMessage(''); }}>
          <option value="">Selecciona almacenamiento</option>
          {product.storages.map((option) => <option key={option.code} value={option.code}>{option.name}</option>)}
        </select></div>
        {!available && <p role="status">Este producto no tiene opciones disponibles para añadirlo.</p>}
        <button type="submit" disabled={!valid || sending}>{sending ? 'Añadiendo…' : 'Añadir al carrito'}</button>
        {message && <p role={failed ? 'alert' : 'status'}>{message}</p>}
      </form>
    </section>
  </div>;
}
