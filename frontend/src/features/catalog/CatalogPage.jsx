import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { filterProducts } from '../../shared/api/normalizers.js';
import { useCachedResource } from '../../shared/cache/useCachedResource.js';
import { catalogRepository } from './catalogRepository.js';
import { ProductImage } from '../../shared/ui/ProductImage.jsx';
import { LoadingSkeleton } from '../../shared/ui/LoadingSkeleton.jsx';

/** Filtra marca/modelo sólo en memoria: escribir no genera HTTP ni requiere debounce de red.
 * @returns {import('react').JSX.Element} */
export function CatalogPage() {
  const [query, setQuery] = useState('');
  const resource = useCachedResource(catalogRepository.getProducts, catalogRepository.expiresAt);
  const products = useMemo(
    () => filterProducts(resource.data || [], query),
    [resource.data, query],
  );

  return (
    <main className="page" id="main-content" tabIndex={-1}>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Catálogo</p>
          <h1>Dispositivos</h1>
        </div>
        <label className="search-field">
          <span>Buscar por marca o modelo</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ej. Acer Iconia"
          />
        </label>
      </div>

      {resource.status === 'loading' && <LoadingSkeleton />}
      {resource.status === 'error' && (
        <div className="status error" role="alert">
          <p>No hemos podido cargar el catálogo.</p>
          <button type="button" onClick={resource.retry}>Reintentar</button>
        </div>
      )}
      {resource.status === 'success' && resource.data?.length === 0 && (
        <p className="status">El catálogo está vacío.</p>
      )}
      {resource.status === 'success' && resource.data?.length !== 0 && products.length === 0 && (
        <p className="status">No hay productos que coincidan con “{query}”.</p>
      )}
      {resource.status === 'success' && products.length > 0 && (
        <ul className="product-grid" aria-label="Productos">
          {products.map((product) => (
            <li key={product.id}>
              <Link className="product-card" to={`/product/${encodeURIComponent(product.id)}`}>
                <ProductImage key={product.imageUrl} src={product.imageUrl} alt={`${product.brand} ${product.model}`} />
                <span className="brand">{product.brand || 'Marca no disponible'}</span>
                <strong>{product.model || 'Modelo no disponible'}</strong>
                <span className="price">{product.price === null ? 'Precio no disponible' : product.price}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
