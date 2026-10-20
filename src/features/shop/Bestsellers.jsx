import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { api } from '../../lib/api.js';
import { ProductPrice } from './ProductPrice.jsx';
export function Bestsellers() {
  const [state, setState] = useState({ loading: true, products: [], error: '' });
  const rail = useRef(null);
  async function load() {
    setState((s) => ({ ...s, loading: true, error: '' }));
    try {
      const data = await api('/storefront');
      setState({ loading: false, products: data.bestsellers, error: '' });
    } catch (e) {
      setState({ loading: false, products: [], error: e.message });
    }
  }
  useEffect(() => {
    load();
    window.addEventListener('storefront:refresh', load);
    return () => window.removeEventListener('storefront:refresh', load);
  }, []);
  function move(direction) {
    rail.current?.scrollBy({
      left: direction * rail.current.clientWidth * 0.8,
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    });
  }
  return (
    <section className="shell bestsellers" aria-label="Más comprados del mes">
      <div className="bestseller-heading">
        <div>
          <span className="eyebrow">LOS FAVORITOS DE NUESTRA COMUNIDAD</span>
          <h2>Lo más elegido del mes.</h2>
          <p>Los más comprados en los últimos 30 días.</p>
        </div>
        {state.products.length > 0 && (
          <div className="slider-controls">
            <button
              className="icon-button"
              aria-label="Favoritos anteriores"
              onClick={() => move(-1)}
            >
              <ArrowLeft />
            </button>
            <button
              className="icon-button"
              aria-label="Favoritos siguientes"
              onClick={() => move(1)}
            >
              <ArrowRight />
            </button>
          </div>
        )}
      </div>
      {state.loading ? (
        <p role="status">Cargando favoritos…</p>
      ) : state.error ? (
        <div role="alert">
          <p>{state.error}</p>
          <button className="text-button" onClick={load}>
            Reintentar favoritos
          </button>
        </div>
      ) : !state.products.length ? (
        <p className="muted">Los favoritos aparecerán acá cuando haya compras confirmadas.</p>
      ) : (
        <div className="bestseller-rail" ref={rail} tabIndex={0} aria-label="Carrusel de favoritos">
          {state.products.map((p, i) => (
            <Link className="bestseller-card" key={p.id} to={'/tienda/' + p.id}>
              <div className="bestseller-image">
                <img src={p.image} alt={p.name} />
                <span>#{i + 1}</span>
              </div>
              <small>{p.category}</small>
              <h3>{p.name}</h3>
              <p>
                {p.description.slice(0, 100)}
                {p.description.length > 100 ? '…' : ''}
              </p>
              <ProductPrice product={p} />
              <span className="text-link">Descubrir producto →</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
