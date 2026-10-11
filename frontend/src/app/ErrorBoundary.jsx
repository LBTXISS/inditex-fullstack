import { Component } from 'react';

/**
 * Contiene excepciones de render sin borrar caché ni carrito; no captura eventos o promesas.
 * @param {object} props Árbol cuya excepción de render se contiene.
 * @param {import('react').ReactNode} props.children Contenido sano o sustituido por navegación segura.
 * @extends {Component<{ children: import('react').ReactNode }, { failed: boolean }>}
 */
export class ErrorBoundary extends Component {
  state = { failed: false };

  /** @returns {{ failed: boolean }} Activa el fallback únicamente ante una excepción de render. */
  static getDerivedStateFromError() {
    return { failed: true };
  }

  /** @returns {import('react').ReactNode} Árbol sano o salida mediante recarga que conserva persistencia. */
  render() {
    if (!this.state.failed) return this.props.children;
    return <main className="page" id="main-content" tabIndex={-1}>
      <h1>No hemos podido mostrar la página</h1>
      <p role="alert">Se ha producido un error inesperado. Tus datos guardados no se han eliminado.</p>
      <button type="button" onClick={() => globalThis.location.reload()}>Recargar</button>
      {/* A full navigation deliberately resets a failed React tree. */}
      <p><a href="/products">Volver al catálogo</a></p>
    </main>;
  }
}
