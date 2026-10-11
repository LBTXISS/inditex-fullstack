import { useEffect } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { CatalogPage } from '../features/catalog/CatalogPage.jsx';
import { ProductDetailPage } from '../features/catalog/ProductDetailPage.jsx';
import { Header } from './Header.jsx';

/** Ruta desconocida con salida accesible al catálogo; no carga un producto inexistente.
 * @returns {import('react').JSX.Element} */
function NotFound() {
  return (
    <main className="page" id="main-content" tabIndex={-1}>
      <h1>Página no encontrada</h1>
      <p><Link to="/products">Volver al catálogo</Link></p>
    </main>
  );
}

/** Navegación SPA que restaura foco y título por ruta para lectores de pantalla.
 * @returns {import('react').JSX.Element} */
export function App() {
  const { pathname } = useLocation();
  useEffect(() => {
    document.getElementById('main-content')?.focus();
    document.title = pathname === '/products' ? 'Catálogo | ITX Devices' : pathname.startsWith('/product/') ? 'Producto | ITX Devices' : 'Página no encontrada | ITX Devices';
  }, [pathname]);
  return (
    <>
      <Header />
      <Routes>
        <Route path="/" element={<Navigate to="/products" replace />} />
        <Route path="/products" element={<CatalogPage />} />
        <Route path="/product/:productId" element={<ProductDetailPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}
