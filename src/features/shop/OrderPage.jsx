import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { CheckCircle, Clock, RefreshCw } from 'lucide-react';
import { api, paymentLabel } from '../../lib/api.js';
export function OrderPage() {
  const { id } = useParams();
  const [order, setOrder] = useState(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true);
    setError('');
    try {
      setOrder(await api('/orders/' + id + '/status'));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    load();
  }, [id]);
  return (
    <section className="shell empty-state order-result">
      {order?.status === 'paid' ? <CheckCircle size={42} /> : <Clock size={42} />}
      <span className="eyebrow">TU COMPRA</span>
      <h1>{order ? paymentLabel[order.status] : 'Consultando tu pedido…'}</h1>
      {order?.status === 'paid' ? (
        <p>Recibimos tu pago. Vanina preparará tu pedido para enviarlo por Correo Argentino.</p>
      ) : (
        <p>
          El estado se confirma directamente con Mercado Pago. Si acabás de pagar, puede tardar unos
          momentos en actualizarse.
        </p>
      )}
      {order?.tracking && (
        <p>
          Número de seguimiento: <strong>{order.tracking}</strong>
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button className="button secondary" disabled={busy} onClick={load}>
        <RefreshCw size={16} /> Actualizar estado
      </button>
      <Link className="text-link" to="/tienda">
        Volver a la tienda
      </Link>
    </section>
  );
}
