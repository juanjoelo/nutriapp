import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, ShoppingBag, Truck, ShieldCheck } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useCart } from './CartContext.jsx';
import { ProductPrice } from './ProductPrice.jsx';

export function ProductPage() {
  const { id } = useParams();
  const [state, setState] = useState({ id, loading: true, product: null, error: '' });
  const [attempt, setAttempt] = useState(0);
  const [photo, setPhoto] = useState(null);
  const [notice, setNotice] = useState('');
  const { add, items, count } = useCart();
  useEffect(() => {
    const refresh = () => setAttempt((value) => value + 1);
    window.addEventListener('storefront:refresh', refresh);
    return () => window.removeEventListener('storefront:refresh', refresh);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setState({ id, loading: true, product: null, error: '' });
    setPhoto(null);
    setNotice('');
    // Reuse the public active catalog, including in the running inspection session.
    api('/products', { signal: controller.signal })
      .then((products) => {
        setState({
          id,
          loading: false,
          product: products.find((p) => p.id === id) || null,
          error: '',
        });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setState({ id, loading: false, product: null, error: error.message });
      });
    return () => controller.abort();
  }, [id, attempt]);
  const product = state.product;
  useEffect(() => {
    if (product) document.title = product.name + ' · Vanina Alaniz';
    return () => {
      document.title = 'Vanina Alaniz · Nutrición integral';
    };
  }, [product]);

  if (state.id !== id || state.loading)
    return (
      <div className="page-message" role="status">
        Cargando el producto…
      </div>
    );
  if (state.error)
    return (
      <section className="shell empty-state">
        <h1>No pudimos cargar el producto.</h1>
        <p role="alert">{state.error}</p>
        <button className="button secondary" onClick={() => setAttempt((a) => a + 1)}>
          Volver a intentar
        </button>
        <Link className="text-link" to="/tienda">
          Volver a la tienda
        </Link>
      </section>
    );
  if (!product)
    return (
      <section className="shell empty-state">
        <ShoppingBag size={40} strokeWidth={1} />
        <h1>Este producto no está disponible.</h1>
        <p>Podés seguir explorando los productos de nuestra tienda.</p>
        <Link className="button primary" to="/tienda">
          Volver a la tienda
        </Link>
      </section>
    );
  const full = count >= 20 || (items.find((item) => item.id === id)?.quantity || 0) >= 10;
  return (
    <section className="shell product-page">
      <Link className="product-back" to="/tienda">
        <ArrowLeft size={16} /> Volver a la tienda
      </Link>
      <div className="product-detail-grid">
        <div className="product-gallery">
          <div className="product-main-photo">
            <img src={photo || product.image} alt={product.name} />
          </div>
          {product.images?.length > 1 && (
            <div className="product-thumbnails detail-thumbnails" aria-label="Galería del producto">
              {product.images.map((image, index) => (
                <button
                  key={image}
                  aria-label={'Ver foto ' + (index + 1) + ' de ' + product.name}
                  aria-pressed={(photo || product.image) === image}
                  onClick={() => setPhoto(image)}
                >
                  <img src={image} alt="" />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="product-detail-copy">
          <span className="eyebrow">{product.category}</span>
          <h1>{product.name}</h1>
          <p className="product-detail-price">
            <ProductPrice product={product} /> <span>ARS</span>
          </p>
          <div className="product-description">
            <h2>Sobre este producto</h2>
            <p>{product.description}</p>
            {product.components && (
              <>
                <h2>Este combo incluye</h2>
                <ul>
                  {product.components.map((p) => (
                    <li key={p.id}>
                      {p.quantity} × {p.name}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
          <button
            className="button primary product-buy"
            disabled={full}
            aria-label={'Agregar ' + product.name}
            onClick={(event) => {
              if (add(product, event.currentTarget))
                setNotice('Agregaste ' + product.name + ' a tu carrito.');
            }}
          >
            <Plus size={19} /> {full ? 'Límite de unidades alcanzado' : 'Agregar al carrito'}
          </button>
          <div className="product-feedback" role="status">
            {notice && (
              <p className="success">
                {notice} <Link to="/carrito">Ver carrito →</Link>
              </p>
            )}
          </div>
          <div className="product-delivery-info">
            <p>
              <Truck size={18} /> Correo Argentino. Calculá el envío con tu código postal en el
              carrito.
            </p>
            <p>
              <ShieldCheck size={18} /> Pago a través de Mercado Pago.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
