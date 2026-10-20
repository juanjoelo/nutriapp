import { useState, useEffect } from 'react';
import { ArrowUpRight, Package, ShoppingBag, TrendingUp, RefreshCw, Plus } from 'lucide-react';
import { api, money } from '../../lib/api.js';
import { SalesExplorer } from './SalesExplorer.jsx';
export function Dashboard({ onOrders, onProducts }) {
  const [days, setDays] = useState('30'),
    [data, setData] = useState(null),
    [ready, setReady] = useState(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [sort, setSort] = useState('most');
  async function load() {
    setBusy(true);
    setError('');
    try {
      const [d, r] = await Promise.all([
        api('/admin/analytics?days=' + days),
        api('/admin/readiness'),
      ]);
      setData(d);
      setReady(r);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    load();
  }, [days]);
  const rows = data
    ? [...data.products].sort((a, b) => (sort === 'most' ? b.units - a.units : a.units - b.units))
    : [];
  return (
    <div className="admin-content">
      <div className="admin-page-heading">
        <div>
          <span className="eyebrow">TODO EN UN MISMO LUGAR</span>
          <h1>Así crece tu tienda.</h1>
          <p>Lo que pasó y lo que necesita tu atención.</p>
        </div>
        <button className="button primary" onClick={onProducts}>
          <Plus size={17} /> Cargar producto
        </button>
      </div>
      {ready && (!ready.payment || !ready.shipping || !ready.email) && (
        <div className="setup-notice">
          <strong>Tu tienda está en preparación</strong>
          <p>
            Falta conectar:{' '}
            {[
              [ready.payment, 'Mercado Pago'],
              [ready.shipping, 'Correo Argentino'],
              [ready.email, 'email'],
            ]
              .filter(([ok]) => !ok)
              .map(([, name]) => name)
              .join(', ')}
            . Podés organizar tus productos mientras tanto. Origen de envíos: {ready.origin}.
          </p>
        </div>
      )}
      {ready && !ready.livePayments && (
        <p className="muted">Mercado Pago está configurado en modo de prueba.</p>
      )}
      <div className="dashboard-tools">
        <label>
          Período
          <select value={days} onChange={(e) => setDays(e.target.value)}>
            <option value="30">Últimos 30 días</option>
            <option value="90">Últimos 90 días</option>
            <option value="0">Desde el inicio</option>
          </select>
        </label>
        <button className="text-button" onClick={load} disabled={busy}>
          <RefreshCw size={16} /> Actualizar
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {data && (
        <>
          <div className="metric-grid">
            <button className="metric-card attention" onClick={onOrders}>
              <div>
                <Package size={22} />
                <ArrowUpRight size={18} />
              </div>
              <strong>{data.pendingShipment}</strong>
              <span>Pendientes de envío</span>
              <small>Todos los pedidos cobrados sin despachar</small>
            </button>
            <div className="metric-card">
              <ShoppingBag size={22} />
              <strong>{data.orders}</strong>
              <span>Ventas confirmadas</span>
              <small>En el período seleccionado</small>
            </div>
            <div className="metric-card">
              <TrendingUp size={22} />
              <strong>{money(data.revenueCents)}</strong>
              <span>Ventas de productos</span>
              <small>Sin envío ni deducción de comisiones</small>
            </div>
          </div>
          <section className="panel analytics-panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">CONOCÉ TUS PRODUCTOS</span>
                <h2>¿Qué se está vendiendo?</h2>
                <p>Unidades vendidas · Solo pagos confirmados</p>
              </div>
              <label className="visually-labeled">
                <span className="sr-only">Ordenar ventas</span>
                <select value={sort} onChange={(e) => setSort(e.target.value)}>
                  <option value="most">Más vendidos primero</option>
                  <option value="least">Menos vendidos primero</option>
                </select>
              </label>
            </div>
            {rows.length ? (
              <SalesExplorer rows={rows} />
            ) : (
              <div className="empty-state compact">
                <ShoppingBag size={32} />
                <h3>Tu historia empieza con un producto.</h3>
                <p>
                  Cuando cargues el catálogo, vas a ver acá cuáles se venden más y cuáles necesitan
                  atención.
                </p>
                <button className="button secondary" onClick={onProducts}>
                  Cargar mi primer producto
                </button>
              </div>
            )}
            <p className="chart-note">
              Se excluyen pagos pendientes, rechazados, en revisión y reembolsados, incluidos los
              reembolsos parciales. El período usa la fecha de creación del pedido.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
