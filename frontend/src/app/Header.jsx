import { Link, useLocation } from 'react-router-dom';
import { useCart } from '../features/cart/useCart.js';

/** Salto al contenido, ubicación actual y anuncio no intrusivo del contador confirmado.
 * @returns {import('react').JSX.Element} */
export function Header() {
  const { count } = useCart();
  const location = useLocation();
  const inCatalog = location.pathname === '/products';
  const currentPage = location.pathname.startsWith('/product/') ? 'Detalle' : 'Página no encontrada';

  return (
    <>
      <a className="skip-link" href="#main-content">Saltar al contenido</a>
      <header className="site-header">
        <Link className="logo" to="/products" aria-label="Ir al catálogo">ITX Devices</Link>
        <nav aria-label="Migas de pan">
          <ol className="breadcrumbs">
            <li><Link to="/products" aria-current={inCatalog ? 'page' : undefined}>Productos</Link></li>
            {!inCatalog && <li aria-current="page">{currentPage}</li>}
          </ol>
        </nav>
        <div className="cart-count" role="status" aria-live="polite" aria-atomic="true" aria-label={`${count} productos en el carrito`}>
          Carrito <strong>{count}</strong>
        </div>
      </header>
    </>
  );
}
