import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { api } from '../../lib/api.js';

const day = (time = Date.now()) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(time);
const labels = {
  approved: 'Aprobado',
  pending: 'Pendiente',
  in_process: 'En proceso',
  authorized: 'Autorizado',
  rejected: 'Rechazado',
  cancelled: 'Cancelado',
  refunded: 'Reembolsado',
  charged_back: 'Contracargo',
  in_mediation: 'En mediación',
};
const money = (amount, currency) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency }).format(amount) + ' ' + currency;
const date = (value) =>
  new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    dateStyle: 'medium',
    timeStyle: 'short',
    hourCycle: 'h23',
  }).format(new Date(value));

export function PaymentHistory({ connected }) {
  const [filters, setFilters] = useState(() => ({
    from: day(Date.now() - 29 * 86400000),
    to: day(),
    status: 'all',
  }));
  const [query, setQuery] = useState(filters),
    [page, setPage] = useState(1),
    [revision, setRevision] = useState(0),
    [data, setData] = useState(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    setData(null);
    setError('');
    if (!connected) return;
    const controller = new AbortController();
    setLoading(true);
    api('/admin/payments/history?' + new URLSearchParams({ ...query, page }), {
      signal: controller.signal,
    })
      .then((value) => {
        if (!controller.signal.aborted) setData(value);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [connected, query, page, revision]);
  return (
    <section className="panel payment-history" aria-labelledby="payment-history-title">
      <div className="panel-heading">
        <div>
          <h2 id="payment-history-title">Historial de pagos</h2>
          <p>
            Pagos recibidos en tu cuenta de Mercado Pago, incluidos los realizados fuera de esta
            tienda.
          </p>
        </div>
        <button
          className="button secondary"
          disabled={!connected || loading}
          onClick={() => setRevision((n) => n + 1)}
        >
          <RefreshCw size={17} />
          Actualizar historial
        </button>
      </div>
      {!connected ? (
        <p>
          Conectá y verificá tu cuenta para consultar los movimientos reales. No hay pagos de
          ejemplo en este historial.
        </p>
      ) : (
        <>
          <form
            className="payment-history-filters"
            onSubmit={(e) => {
              e.preventDefault();
              setQuery({ ...filters });
              setPage(1);
            }}
          >
            <label>
              Desde
              <input
                type="date"
                required
                value={filters.from}
                onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
              />
            </label>
            <label>
              Hasta
              <input
                type="date"
                required
                min={filters.from}
                value={filters.to}
                onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
              />
            </label>
            <label>
              Estado del pago
              <select
                value={filters.status}
                onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
              >
                <option value="all">Todos los estados</option>
                {Object.entries(labels).map(([id, label]) => (
                  <option value={id} key={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <button className="button primary" disabled={loading}>
              Ver pagos
            </button>
          </form>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {loading && <p role="status">Consultando pagos…</p>}
          {data && (
            <>
              <p className="muted">
                {data.total} pagos en el período ·{' '}
                {data.live ? 'Cuenta real' : 'Ambiente de pruebas'} · Actualizado{' '}
                {date(data.fetchedAt)}
              </p>
              {!data.payments.length ? (
                <p>No hay pagos para estos filtros.</p>
              ) : (
                <div className="payment-history-list">
                  {data.payments.map((p) => (
                    <details className="payment-history-entry" key={p.id}>
                      <summary>
                        <span>
                          <strong>{p.description || 'Pago #' + p.id}</strong>
                          <small>
                            {date(p.created)} · #{p.id}
                          </small>
                        </span>
                        <span className="status-tag">{labels[p.status] || p.status}</span>
                        <strong>{money(p.amount, p.currency)}</strong>
                      </summary>
                      <dl>
                        <div>
                          <dt>Medio de pago</dt>
                          <dd>
                            {p.method || 'No informado'}
                            {p.installments ? ' · ' + p.installments + ' cuota(s)' : ''}
                          </dd>
                        </div>
                        <div>
                          <dt>Detalle del estado</dt>
                          <dd>{p.statusDetail || 'No informado'}</dd>
                        </div>
                        {p.approved && (
                          <div>
                            <dt>Fecha de aprobación</dt>
                            <dd>{date(p.approved)}</dd>
                          </div>
                        )}
                        <div>
                          <dt>Importe reembolsado</dt>
                          <dd>{money(p.refunded, p.currency)}</dd>
                        </div>
                        <div>
                          <dt>Pedido asociado</dt>
                          <dd>
                            {p.orderId
                              ? '#' + p.orderId.slice(0, 8).toUpperCase()
                              : 'Sin pedido confirmado asociado en esta tienda'}
                          </dd>
                        </div>
                      </dl>
                    </details>
                  ))}
                </div>
              )}
              {data.pages > 1 && (
                <div className="pagination">
                  <button
                    className="button secondary"
                    disabled={page <= 1 || loading}
                    onClick={() => setPage((n) => n - 1)}
                  >
                    Anterior
                  </button>
                  <span>
                    Página {page} de {data.pages}
                  </span>
                  <button
                    className="button secondary"
                    disabled={page >= Math.min(data.pages, 500) || loading}
                    onClick={() => setPage((n) => n + 1)}
                  >
                    Siguiente
                  </button>
                </div>
              )}
              <p className="muted">
                Importes brutos por moneda. Consultar un pago aquí no cambia el estado de los
                pedidos ni registra ventas duplicadas.
              </p>
            </>
          )}
        </>
      )}
    </section>
  );
}
