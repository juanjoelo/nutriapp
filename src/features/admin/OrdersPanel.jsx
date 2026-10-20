import { useEffect, useState } from 'react';
import { PackageCheck, RefreshCw, Truck, Mail, ChevronDown } from 'lucide-react';
import { api, money, date, paymentLabel } from '../../lib/api.js';
export function OrdersPanel() {
  const [filter, setFilter] = useState('pending'),
    [page, setPage] = useState(1),
    [data, setData] = useState(null),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true);
    setError('');
    try {
      setData(await api('/admin/orders?filter=' + filter + '&page=' + page));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    load();
  }, [filter, page]);
  async function ship(e, id) {
    e.preventDefault();
    const tracking = new FormData(e.currentTarget).get('tracking');
    if (
      !window.confirm(
        '¿Confirmás que entregaste este paquete a Correo Argentino? Se enviará un email al comprador con el seguimiento.',
      )
    )
      return;
    setBusy(true);
    setError('');
    try {
      await api('/admin/orders/' + id + '/ship', { method: 'POST', body: { tracking } });
      setMessage(
        'Pedido marcado como enviado. El aviso al comprador quedó registrado para su envío por email.',
      );
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function retry() {
    setBusy(true);
    try {
      const result = await api('/admin/notifications/retry', { method: 'POST' });
      setMessage(result.message);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="admin-content">
      <div className="admin-page-heading">
        <div>
          <span className="eyebrow">DEL PEDIDO A SU DESTINO</span>
          <h1>Pedidos y envíos.</h1>
          <p>Prepará cada compra, registrá el despacho y tené todo a mano.</p>
        </div>
        <button className="button secondary" onClick={load} disabled={busy}>
          <RefreshCw size={17} /> Actualizar
        </button>
      </div>
      <div className="orders-toolbar">
        <div className="category-tabs">
          {[
            ['pending', 'Pendientes de envío'],
            ['shipped', 'Enviados'],
            ['all', 'Todos los pedidos'],
          ].map(([id, label]) => (
            <button
              key={id}
              className={filter === id ? 'selected' : ''}
              aria-pressed={filter === id}
              onClick={() => {
                setFilter(id);
                setPage(1);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <button className="text-button" disabled={busy} onClick={retry}>
          <Mail size={16} /> Reintentar avisos pendientes
        </button>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="success">
          {message}
        </p>
      )}
      {!data ? (
        <p>Cargando pedidos…</p>
      ) : (
        <>
          <p className="orders-count" aria-live="polite">
            <strong>{data.total}</strong>{' '}
            {filter === 'pending'
              ? data.total === 1
                ? 'pedido pendiente de envío'
                : 'pedidos pendientes de envío'
              : filter === 'shipped'
                ? data.total === 1
                  ? 'pedido enviado'
                  : 'pedidos enviados'
                : data.total === 1
                  ? 'pedido en total'
                  : 'pedidos en total'}
            {data.pages > 1 && (
              <span className="muted"> · Mostrando {data.orders.length} en esta página</span>
            )}
          </p>
          {!data.orders.length ? (
            <div className="panel empty-state">
              <PackageCheck size={44} strokeWidth={1} />
              <h2>{filter === 'pending' ? 'Todo al día.' : 'Todavía no hay pedidos acá.'}</h2>
              <p>
                {filter === 'pending'
                  ? 'Los pedidos con pago confirmado aparecerán aquí cuando estén listos para preparar.'
                  : 'Podés cambiar el filtro para ver los demás pedidos.'}
              </p>
            </div>
          ) : (
            data.orders.map((o) => (
              <details
                className="panel order-card"
                key={filter + ':' + page + ':' + o.id + ':' + (o.shippedAt || '')}
              >
                <summary className="order-card-heading">
                  <div className="order-customer">
                    <span className="eyebrow">PEDIDO #{o.id.slice(0, 8).toUpperCase()}</span>
                    <h2>{o.customer.name}</h2>
                    <span className="muted">{date(o.created)}</span>
                  </div>
                  <div className="order-tags">
                    <span className={'status-tag ' + o.status}>{paymentLabel[o.status]}</span>
                    <span className="status-tag">
                      {o.shippedAt
                        ? 'Enviado'
                        : o.status === 'paid'
                          ? 'Por despachar'
                          : 'Sin despacho'}
                    </span>
                  </div>
                  <div className="order-summary-end">
                    <strong>{money(o.totalCents)}</strong>
                    <span className="order-expand-label">
                      <span className="order-show-label">Ver detalles</span>
                      <span className="order-hide-label">Ocultar detalles</span>
                      <ChevronDown size={18} aria-hidden="true" />
                    </span>
                  </div>
                </summary>
                <div className="order-card-body">
                  <div className="order-detail-grid">
                    <div>
                      <h3>La compra</h3>
                      {o.items.map((p) => (
                        <div className="summary-row" key={p.id}>
                          <span>
                            {p.quantity} × {p.name}
                          </span>
                          <strong>{money(p.priceCents * p.quantity)}</strong>
                        </div>
                      ))}
                      <div className="summary-row">
                        <span>Envío · {o.shipping.service}</span>
                        <strong>{money(o.shippingCents)}</strong>
                      </div>
                      <div className="summary-row total">
                        <span>Total del pedido</span>
                        <strong>{money(o.totalCents)}</strong>
                      </div>
                    </div>
                    <div className="shipping-address">
                      <h3>
                        <Truck size={17} /> Entrega a domicilio
                      </h3>
                      <p>
                        {o.customer.street} {o.customer.number} {o.customer.apartment}
                        <br />
                        {o.customer.city}, {o.customer.province}
                        <br />
                        CP {o.customer.postalCode}
                      </p>
                      <p>
                        {o.customer.email}
                        <br />
                        {o.customer.phone}
                      </p>
                      <p className="muted">
                        Paquete estimado: {o.shipping.dimensions.weight} g ·{' '}
                        {o.shipping.dimensions.length} × {o.shipping.dimensions.width} ×{' '}
                        {o.shipping.dimensions.height} cm
                      </p>
                    </div>
                  </div>
                  {o.status === 'paid' && !o.shippedAt && (
                    <div className="dispatch-panel">
                      <p>
                        Prepará y pagá el envío en{' '}
                        <a
                          href="https://www.correoargentino.com.ar/MiCorreo/public/"
                          target="_blank"
                          rel="noreferrer"
                        >
                          MiCorreo ↗
                        </a>
                        . Cuando entregues el paquete, registrá el seguimiento. Se enviará un email
                        a la dirección que el comprador ingresó al hacer su compra.
                      </p>
                      <form onSubmit={(e) => ship(e, o.id)}>
                        <label>
                          Número de seguimiento
                          <input
                            name="tracking"
                            placeholder="Código de Correo Argentino"
                            minLength="5"
                            maxLength="80"
                            pattern="[a-zA-Z0-9 -]+"
                            required
                          />
                        </label>
                        <button className="button primary" disabled={busy}>
                          <PackageCheck size={17} /> Marcar como enviado
                        </button>
                      </form>
                    </div>
                  )}
                  {o.shippedAt && (
                    <p className="success">
                      Despachado el {date(o.shippedAt)} · Seguimiento: <strong>{o.tracking}</strong>
                    </p>
                  )}
                  <div className="order-foot">
                    <span>
                      {o.emailSentAt
                        ? 'Aviso de venta enviado por email'
                        : o.status === 'paid'
                          ? 'Aviso de venta pendiente de envío por email'
                          : 'Sin aviso de venta confirmada'}
                    </span>
                    {o.paymentId && <span>Pago MP: {o.paymentId}</span>}
                    {o.shippedAt && (
                      <span>
                        {o.shipmentEmailSentAt
                          ? 'Aviso de despacho enviado al comprador'
                          : o.shipmentEmailQueued
                            ? 'Aviso de despacho pendiente de envío por email'
                            : 'Sin aviso de despacho registrado'}
                      </span>
                    )}
                  </div>
                </div>
              </details>
            ))
          )}
          {data.pages > 1 && (
            <div className="pagination">
              <button
                className="button secondary"
                disabled={page === 1 || busy}
                onClick={() => setPage(page - 1)}
              >
                Anterior
              </button>
              <span>
                Página {page} de {data.pages}
              </span>
              <button
                className="button secondary"
                disabled={page >= data.pages || busy}
                onClick={() => setPage(page + 1)}
              >
                Siguiente
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
