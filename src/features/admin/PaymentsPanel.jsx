import { useEffect, useState } from 'react';
import { CheckCircle2, CreditCard, ExternalLink, RefreshCw } from 'lucide-react';
import { api } from '../../lib/api.js';
import { PaymentHistory } from './PaymentHistory.jsx';
import { InternationalPayments } from './InternationalPayments.jsx';

export function PaymentsPanel() {
  const [data, setData] = useState(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api('/admin/payments')
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  async function action(kind) {
    setBusy(true);
    setError('');
    try {
      const result = await api('/admin/payments/' + kind, {
        method: kind === 'connection' ? 'DELETE' : 'POST',
      });
      if (kind === 'connect') window.location.assign(result.url);
      else setData(await api('/admin/payments'));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const returned = new URLSearchParams(window.location.search).get('mp');
  return (
    <section className="admin-content payments-page">
      <div className="admin-page-heading">
        <div>
          <span className="eyebrow">TUS COBROS, EN UN LUGAR</span>
          <h1>Pagos.</h1>
          <p>Conectá tu cuenta para recibir las ventas de tu tienda.</p>
        </div>
        <CreditCard size={32} />
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {returned && returned !== 'connected' && (
        <p className="setup-notice">
          {returned === 'cancelled'
            ? 'La autorización se canceló. Podés volver a intentarlo.'
            : 'No se completó la conexión. Volvé a intentarlo desde este panel.'}
        </p>
      )}
      {!data ? (
        <p role="status">Consultando conexión…</p>
      ) : (
        <div className="panel payment-connection">
          <img
            className="payment-logo"
            src="/brands/mercadopago.svg"
            alt="Mercado Pago"
            width="180"
            height="110"
          />
          <div>
            <h2>{data.connected ? 'MercadoPago conectado' : 'Conectá tu Mercado Pago'}</h2>
            {data.connected ? (
              <>
                <p className="payment-connected">
                  <CheckCircle2 size={22} /> {data.nickname} · Cuenta {data.collector}
                </p>
                <p>
                  Ambiente: {data.live ? 'Producción' : 'Pruebas'}. Última verificación:{' '}
                  {new Date(data.verifiedAt).toLocaleString('es-AR')}.
                </p>
                <p>
                  Los cobros se acreditarán en la cuenta autorizada según las condiciones de Mercado
                  Pago.
                </p>
              </>
            ) : (
              <p>
                Entrá a Mercado Pago y autorizá la conexión. Tu contraseña se ingresa únicamente en
                Mercado Pago.
              </p>
            )}
            {!data.canConnect && (
              <p className="setup-notice">
                La conexión necesita una configuración inicial del sitio. El botón quedará
                disponible cuando se habilite la aplicación de Mercado Pago.
              </p>
            )}
            {data.connected && !data.checkoutReady && (
              <p className="setup-notice">
                La cuenta está vinculada. Falta completar la configuración de los avisos de pago
                antes de habilitar compras.
              </p>
            )}
            {data.legacyConfigured && (
              <p className="muted">
                Hay credenciales cargadas en el servidor. Esta sección mostrará la cuenta conectada
                cuando completes su autorización.
              </p>
            )}
            <div className="merch-actions">
              <button
                className="button primary"
                disabled={busy || !data.canConnect}
                onClick={() => action('connect')}
              >
                <ExternalLink size={18} />
                {data.connected ? 'Renovar autorización' : 'Conectar Mercado Pago'}
              </button>
              {data.collector && (
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => action('verify')}
                >
                  <RefreshCw size={18} />
                  Verificar conexión
                </button>
              )}
            </div>
            {data.collector && (
              <details>
                <summary>Desconectar de esta tienda</summary>
                <p>
                  Se detendrán los nuevos cobros con esta conexión. Los pedidos guardados se
                  conservan. Podés revocar también el permiso desde tu cuenta de Mercado Pago.
                </p>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => action('connection')}
                >
                  Confirmar desconexión
                </button>
              </details>
            )}
          </div>
        </div>
      )}
      {data && <PaymentHistory connected={data.connected} />}
      <InternationalPayments />
    </section>
  );
}
