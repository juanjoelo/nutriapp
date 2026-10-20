import { useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { Search, X, ArrowRight, Sprout, Truck, ShieldCheck, Leaf } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useCart } from './CartContext.jsx';
import { ProductCard } from './ProductCard.jsx';
import { Bestsellers } from './Bestsellers.jsx';
import { CampaignBanner } from '../../components/CampaignBanner.jsx';

export function ShopPage() {
  const { campaign } = useOutletContext();
  const [products, setProducts] = useState([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState('');
  const [search, setSearch] = useState(''),
    [category, setCategory] = useState('Todos'),
    [notice, setNotice] = useState('');
  const { add, items, count } = useCart();
  async function load() {
    setLoading(true);
    setError('');
    try {
      setProducts(await api('/products'));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
    window.addEventListener('storefront:refresh', load);
    return () => window.removeEventListener('storefront:refresh', load);
  }, []);
  const categories = ['Todos', ...new Set(products.map((p) => p.category))];
  const shown = products.filter(
    (p) =>
      (category === 'Todos' || p.category === category) &&
      (p.name + ' ' + p.description).toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <div className="shop-page">
      <div className="shop-heading shell">
        <span className="eyebrow">ELEGIDOS PARA TU DÍA A DÍA</span>
        <h1>
          Bienestar que
          <br />
          <em>te acompaña.</em>
        </h1>
        <p>Encontrá pequeños aliados para tus hábitos cotidianos.</p>
      </div>
      <CampaignBanner campaign={campaign} />
      <div className="shell shop-toolbar">
        <div className="category-tabs" aria-label="Categorías">
          {categories.map((c) => (
            <button
              key={c}
              aria-pressed={c === category}
              className={c === category ? 'selected' : ''}
              onClick={() => setCategory(c)}
            >
              {c}
            </button>
          ))}
        </div>
        <label className="search-field">
          <Search size={17} />
          <input
            aria-label="Buscar productos"
            placeholder="Encontrá algo para vos…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      <div className="shop-notice-region" role="status">
        {notice && (
          <div className="shop-notice">
            <span>
              {notice} <Link to="/carrito">Ver carrito →</Link>
            </span>
            <button className="icon-button" aria-label="Cerrar aviso" onClick={() => setNotice('')}>
              <X size={17} />
            </button>
          </div>
        )}
      </div>
      <section className="shell product-grid" aria-label="Productos">
        {loading ? (
          <p className="empty-state">Cargando la tienda…</p>
        ) : error ? (
          <div className="empty-state">
            <p role="alert">{error}</p>
            <button className="button secondary" onClick={load}>
              Volver a intentar
            </button>
          </div>
        ) : shown.length ? (
          shown.map((p) => {
            const full = count >= 20 || (items.find((i) => i.id === p.id)?.quantity || 0) >= 10;
            return (
              <ProductCard
                key={p.id}
                product={p}
                full={full}
                onAdd={(event) => {
                  if (add(p, event.currentTarget)) setNotice(p.name + ' se agregó a tu carrito.');
                }}
              />
            );
          })
        ) : (
          <div className="empty-state">
            <Sprout size={42} strokeWidth={1} />
            <h2>
              {products.length
                ? 'No encontramos esos productos.'
                : 'Estamos cultivando algo lindo.'}
            </h2>
            <p>
              {products.length
                ? 'Probá con otra búsqueda o categoría.'
                : 'Pronto vas a encontrar acá los productos elegidos por Vanina.'}
            </p>
            <Link className="text-link" to="/#contacto">
              Conversemos <ArrowRight size={16} />
            </Link>
          </div>
        )}
      </section>
      <Bestsellers />
      <div className="shop-promises shell">
        <span>
          <Truck /> Envíos por Correo Argentino
        </span>
        <span>
          <ShieldCheck /> Pago con Mercado Pago
        </span>
        <span>
          <Leaf /> Elegí a tu ritmo
        </span>
      </div>
    </div>
  );
}
