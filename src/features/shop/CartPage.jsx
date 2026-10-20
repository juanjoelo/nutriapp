import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingBag, ArrowRight, Trash2, LockKeyhole, Truck } from 'lucide-react';
import { useCart } from './CartContext.jsx';
import { api, money } from '../../lib/api.js';
const provinces = [
  'Buenos Aires',
  'Ciudad Autónoma de Buenos Aires',
  'Catamarca',
  'Chaco',
  'Chubut',
  'Córdoba',
  'Corrientes',
  'Entre Ríos',
  'Formosa',
  'Jujuy',
  'La Pampa',
  'La Rioja',
  'Mendoza',
  'Misiones',
  'Neuquén',
  'Río Negro',
  'Salta',
  'San Juan',
  'San Luis',
  'Santa Cruz',
  'Santa Fe',
  'Santiago del Estero',
  'Tierra del Fuego',
  'Tucumán',
];
export function CartPage() {
  const { items, quantity, remove, count } = useCart();
  const [postal, setPostal] = useState(''),
    [quote, setQuote] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const signature = JSON.stringify(items.map((p) => [p.id, p.quantity]));
  useEffect(() => {
    setQuote(null);
    setRequestKey(crypto.randomUUID());
  }, [signature, postal]);
  const subtotal = items.reduce((n, p) => n + p.priceCents * p.quantity, 0);
  const displayItems = quote?.items || items;
  async function getQuote(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setQuote(null);
    try {
      setQuote(
        await api('/shipping/quote', {
          method: 'POST',
          body: {
            postalCode: postal,
            items: items.map((p) => ({ id: p.id, quantity: p.quantity })),
          },
        }),
      );
      setRequestKey(crypto.randomUUID());
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function checkout(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const customer = Object.fromEntries(new FormData(e.currentTarget));
    customer.postalCode = postal;
    try {
      if (!quote || quote.expires < Date.now())
        throw new Error('La cotización venció. Volvé a calcular el envío.');
      const result = await api('/checkout', {
        method: 'POST',
        headers: { 'Idempotency-Key': requestKey },
        body: { quoteId: quote.id, customer },
      });
      window.location.assign(result.url);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  if (!items.length)
    return (
      <section className="shell empty-state">
        <ShoppingBag size={42} strokeWidth={1} />
        <h1>Tu carrito está esperando.</h1>
        <p>Elegí algo que acompañe tu día.</p>
        <Link className="button primary" to="/tienda">
          Explorar la tienda <ArrowRight size={18} />
        </Link>
      </section>
    );
  return (
    <section className="shell section">
      <span className="eyebrow">TU SELECCIÓN</span>
      <h1 className="page-title">
        Un paso más <em>cerca.</em>
      </h1>
      <div className="checkout-grid">
        <form id="customer-details" className="customer-form panel" onSubmit={checkout}>
          <h2>¿A dónde lo enviamos?</h2>
          <p>Completá tus datos para recibir la compra en tu domicilio.</p>
          <div className="form-grid">
            <label className="full">
              Nombre y apellido
              <input name="name" autoComplete="name" minLength="3" maxLength="100" required />
            </label>
            <label>
              Email
              <input name="email" type="email" autoComplete="email" required maxLength="200" />
            </label>
            <label>
              Teléfono
              <input
                name="phone"
                type="tel"
                autoComplete="tel"
                required
                pattern="[+0-9 ()-]{8,25}"
              />
            </label>
            <label>
              Calle
              <input
                name="street"
                autoComplete="address-line1"
                required
                minLength="2"
                maxLength="120"
              />
            </label>
            <label>
              Altura
              <input name="number" required maxLength="10" />
            </label>
            <label>
              Piso / departamento (opcional)
              <input name="apartment" autoComplete="address-line2" maxLength="60" />
            </label>
            <label>
              Localidad
              <input
                name="city"
                autoComplete="address-level2"
                required
                minLength="2"
                maxLength="100"
              />
            </label>
            <label className="full">
              Provincia
              <select name="province" autoComplete="address-level1" required defaultValue="">
                <option value="" disabled>
                  Seleccioná una provincia
                </option>
                {provinces.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
          </div>
          <p className="muted">Usamos estos datos para gestionar tu compra y el envío.</p>
          {!quote && (
            <p className="muted">
              Calculá el envío con tu código postal en el resumen para continuar al pago.
            </p>
          )}
        </form>
        <aside className="order-summary panel">
          <h2>Resumen de tu compra</h2>
          <div className="cart-items" aria-label="Productos seleccionados">
            {displayItems.map((p) => (
              <article className="cart-item" key={p.id}>
                <img src={p.image} alt={p.name} />
                <div className="cart-item-info">
                  <h3>{p.name}</h3>
                  <div className="cart-item-controls">
                    <label className="quantity-field">
                      <span className="sr-only">Cantidad de {p.name}</span>
                      <input
                        type="number"
                        min="1"
                        max={Math.min(10, 20 - count + p.quantity)}
                        value={p.quantity}
                        onChange={(e) => quantity(p.id, Number(e.target.value))}
                        disabled={busy}
                      />
                    </label>
                    <span>× {money(p.priceCents)}</span>
                  </div>
                </div>
                <div className="cart-item-end">
                  <button
                    className="icon-button"
                    aria-label={'Quitar ' + p.name}
                    onClick={() => remove(p.id)}
                    disabled={busy}
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              </article>
            ))}
          </div>
          <div className="summary-row">
            <span>Productos</span>
            <strong>{money(quote?.subtotalCents ?? subtotal)}</strong>
          </div>
          <form onSubmit={getQuote} className="shipping-form">
            <label htmlFor="postal">
              <Truck size={17} /> Calculá tu envío
            </label>
            <p>Correo Argentino · A domicilio</p>
            <div>
              <input
                id="postal"
                value={postal}
                onChange={(e) => setPostal(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="Tu código postal"
                inputMode="numeric"
                pattern="[0-9]{4}"
                autoComplete="postal-code"
                disabled={busy}
                required
                aria-label="Código postal"
              />
              <button className="button secondary" disabled={busy}>
                Calcular
              </button>
            </div>
          </form>
          <div className="summary-row">
            <span>Envío</span>
            <strong>{quote ? money(quote.shippingCents) : 'A calcular'}</strong>
          </div>
          {quote && (
            <p className="muted">{quote.service} · Cotización válida por hasta 10 minutos.</p>
          )}
          <div className="summary-row total">
            <span>Total</span>
            <strong>{quote ? money(quote.totalCents) : money(subtotal)}</strong>
          </div>
          {!quote && <p className="muted">El costo del envío se suma al total antes de pagar.</p>}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            form="customer-details"
            className="button primary full-width"
            disabled={busy || !quote}
          >
            {busy ? 'Preparando tu compra…' : 'Continuar a Mercado Pago'} <LockKeyhole size={16} />
          </button>
          <Link className="text-link" to="/tienda">
            Seguir mirando <ArrowRight size={16} />
          </Link>
        </aside>
      </div>
    </section>
  );
}
