/**
 * Reserva espacio sin controles falsos; anuncia una única carga y oculta placeholders a lectores de pantalla.
 * @param {object} props Variante visual sin modificar la semántica de carga.
 * @param {boolean} [props.detail=false] Dos placeholders para PDP; cuatro para catálogo.
 * @returns {import('react').JSX.Element}
 */
export function LoadingSkeleton({ detail = false }) {
  const placeholders = Array.from({ length: detail ? 2 : 4 }, (_, index) => index);
  return <div>
    <p className="sr-only" role="status">
      {detail ? 'Cargando producto…' : 'Cargando productos…'}
    </p>
    <div aria-hidden="true" className={detail ? 'product-detail' : 'product-grid'}>
      {placeholders.map((index) => <div className="skeleton-card" key={index}>
        <div className="skeleton skeleton-image" />
        <div className="skeleton skeleton-line" />
        <div className="skeleton skeleton-line skeleton-short" />
      </div>)}
    </div>
  </div>;
}
