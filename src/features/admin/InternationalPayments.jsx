import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { PayPalSetupGuide, PrexSetupGuide } from './PaymentSetupGuides.jsx';

const money = (p) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: p.currency }).format(
    p.amount / 100,
  ) +
  ' ' +
  p.currency;
const states = { pending: 'Pendiente', paid: 'Pagado', refunded: 'Reembolso / revisar' };

export function ConsultationPaymentHistory() {
  const [data, setData] = useState(null),
    [page, setPage] = useState(1),
    [revision, setRevision] = useState(0),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    setData(null);
    api('/admin/payments/consultations?page=' + page)
      .then((v) => {
        if (alive) setData(v);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [page, revision]);
  async function verify(id, body) {
    setError('');
    setBusy(true);
    try {
      await api('/admin/payments/consultations/' + id + '/' + (body ? 'confirm-prex' : 'verify'), {
        method: 'POST',
        body: body || {},
      });
      setRevision((n) => n + 1);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel payment-history">
      <div className="panel-heading">
        <div>
          <h2>Cobros de consultas y packs</h2>
          <p>Mercado Pago, PayPal y transferencias Prex vinculados a tus reservas.</p>
        </div>
        <button className="button secondary" onClick={() => setRevision((n) => n + 1)}>
          Actualizar cobros
        </button>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!data ? (
        <p role="status">Consultando cobros…</p>
      ) : (
        <>
          <p>{data.total} cobros registrados</p>
          {!data.payments.length ? (
            <p>Todavía no se iniciaron cobros online de consultas.</p>
          ) : (
            <div className="payment-history-list">
              {data.payments.map((p) => (
                <details className="payment-history-entry" key={p.id}>
                  <summary>
                    <span>
                      <strong>{p.customer}</strong>
                      <small>
                        {p.service} ·{' '}
                        {
                          {
                            prex: 'Prex',
                            paypal: 'PayPal',
                            mercadopago: 'Mercado Pago',
                            inspection: 'Simulación local · sin dinero real',
                          }[p.provider]
                        }
                        {!p.live && ['paypal', 'mercadopago'].includes(p.provider)
                          ? ' · Prueba'
                          : ''}
                      </small>
                    </span>
                    <span className="status-tag">{states[p.status] || p.status}</span>
                    <strong>{money(p)}</strong>
                  </summary>
                  <div className="payment-entry-body">
                    <p>Referencia de reserva: {p.id}</p>
                    <p>Registrado: {new Date(p.created).toLocaleString('es-AR')}</p>
                    {p.reference && <p>Comprobante verificado: {p.reference}</p>}
                    {['paypal', 'mercadopago'].includes(p.provider) ? (
                      <>
                        <p>
                          Consultá el estado en el proveedor. En PayPal, la verificación también
                          completa el cobro autorizado. Revisá allí las disputas y devoluciones.
                        </p>
                        <button
                          className="button secondary"
                          disabled={busy}
                          onClick={() => verify(p.id)}
                        >
                          Verificar en {p.provider === 'paypal' ? 'PayPal' : 'Mercado Pago'}
                        </button>
                      </>
                    ) : p.provider === 'prex' && p.status === 'pending' ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const f = new FormData(e.currentTarget);
                          void verify(p.id, { reference: f.get('reference'), received: true });
                        }}
                      >
                        <p>
                          Verificá en la app Prex la recepción de {money(p)} en la cuenta de{' '}
                          {p.instructions.holder} ({p.instructions.account}).
                        </p>
                        <label>
                          Número de operación recibida
                          <input name="reference" required minLength={3} maxLength={120} />
                        </label>
                        <label className="check-label">
                          <input type="checkbox" required />
                          Confirmé que el importe completo y la moneda coinciden en mi cuenta Prex.
                        </label>
                        <button className="button primary" disabled={busy}>
                          Confirmar recepción de Prex
                        </button>
                      </form>
                    ) : (
                      <p>
                        {p.provider === 'inspection'
                          ? 'Pago simulado para probar la reserva. No se cobró dinero.'
                          : 'Transferencia confirmada por Vanina.'}
                      </p>
                    )}
                  </div>
                </details>
              ))}
            </div>
          )}
          {data.pages > 1 && (
            <div className="pagination">
              <button
                className="button secondary"
                disabled={page <= 1}
                onClick={() => setPage((n) => n - 1)}
              >
                Anterior
              </button>
              <span>
                {page} / {data.pages}
              </span>
              <button
                className="button secondary"
                disabled={page >= data.pages}
                onClick={() => setPage((n) => n + 1)}
              >
                Siguiente
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

export function InternationalPayments() {
  const [data, setData] = useState(null),
    [prex, setPrex] = useState(null),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api('/admin/payments/international')
      .then((v) => {
        setData(v);
        setPrex(v.prex);
      })
      .catch((e) => setError(e.message));
  }, []);
  async function action(path, method, body) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api('/admin/payments/' + path, { method, body });
      const fresh = await api('/admin/payments/international');
      setData(fresh);
      setPrex(fresh.prex);
      setMessage(
        path === 'prex' ? 'Preferencias de Prex guardadas.' : 'Conexión PayPal actualizada.',
      );
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="panel international-payments">
        <span className="eyebrow">ACOMPAÑAMIENTO SIN FRONTERAS</span>
        <h2>Pagos internacionales</h2>
        <p>
          Para consultas y packs online. Configurá sus precios desde Turnos → Servicios. La tienda
          mantiene sus envíos dentro de Argentina.
        </p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {message && <p role="status">{message}</p>}
        {!data ? (
          <p>Cargando conexiones…</p>
        ) : (
          <>
            <div className="international-payment-grid">
              <article className="payment-provider">
                <h3>PayPal</h3>
                <p className="status-tag">
                  {data.paypal.connected ? 'PayPal conectado' : 'Sin conectar'}
                </p>
                {data.paypal.merchant && (
                  <p>
                    Cuenta receptora: {data.paypal.merchant} ·{' '}
                    {data.paypal.live ? 'Producción' : 'Pruebas'}
                  </p>
                )}
                <p>
                  Cobros en USD, sujetos a disponibilidad de PayPal en el país del paciente. Se
                  valida el importe y la cuenta receptora antes de registrar el pago.
                </p>
                {!data.paypal.canConnect && (
                  <p className="setup-notice">
                    Falta la configuración inicial de HTTPS y cifrado del servidor.
                  </p>
                )}
                <PayPalSetupGuide />
                <details>
                  <summary>
                    {data.paypal.connected
                      ? 'Actualizar conexión PayPal'
                      : 'Conectar cuenta PayPal'}
                  </summary>
                  <p>
                    Ingresá las credenciales de una aplicación de tu cuenta PayPal desde{' '}
                    <a
                      href="https://developer.paypal.com/dashboard/applications/live"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Apps & Credentials
                    </a>
                    . Para cobros reales con esta integración necesitás una cuenta Business /
                    Empresas. No ingreses tu contraseña de PayPal aquí.
                  </p>
                  <form
                    autoComplete="off"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const form = e.currentTarget,
                        f = new FormData(form);
                      if (
                        await action('paypal/connect', 'POST', {
                          clientId: f.get('clientId').trim(),
                          secret: f.get('secret').trim(),
                          merchant: f.get('merchant').trim(),
                          live: f.get('live') === 'live',
                        })
                      )
                        form.reset();
                    }}
                  >
                    <label>
                      ID de comercio PayPal
                      <input
                        name="merchant"
                        required
                        minLength={10}
                        maxLength={20}
                        pattern="[A-Z0-9]+"
                      />
                    </label>
                    <label>
                      Client ID
                      <input
                        name="clientId"
                        required
                        minLength={10}
                        maxLength={256}
                        autoComplete="off"
                      />
                    </label>
                    <label>
                      Client Secret
                      <input
                        type="password"
                        name="secret"
                        required
                        minLength={10}
                        maxLength={256}
                        autoComplete="new-password"
                      />
                    </label>
                    <label>
                      Ambiente
                      <select name="live" defaultValue="sandbox">
                        <option value="sandbox">Sandbox · pruebas</option>
                        <option value="live">Producción · cobros reales</option>
                      </select>
                    </label>
                    <button className="button primary" disabled={busy || !data.paypal.canConnect}>
                      Conectar y verificar PayPal
                    </button>
                  </form>
                </details>
                {data.paypal.merchant && (
                  <div className="merch-actions">
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={() => action('paypal/verify', 'POST', {})}
                    >
                      Verificar conexión PayPal
                    </button>
                    <details>
                      <summary>Desconectar PayPal</summary>
                      <p>Se permite si todavía no hay cobros vinculados a la cuenta.</p>
                      <button
                        className="button secondary"
                        disabled={busy}
                        onClick={() => action('paypal', 'DELETE')}
                      >
                        Confirmar desconexión
                      </button>
                    </details>
                  </div>
                )}
              </article>
              <article className="payment-provider">
                <h3>Prex Argentina</h3>
                <p className="status-tag">
                  {data.prex.enabled ? 'Transferencias habilitadas' : 'Sin habilitar'}
                </p>
                <p>
                  Para pacientes con Prex Uruguay. El dinero se envía a la cuenta Prex Argentina de
                  Vanina; la recepción se confirma manualmente.
                </p>
                <PrexSetupGuide />
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void action('prex', 'PUT', prex);
                  }}
                >
                  <label>
                    Nombre completo del titular
                    <input
                      value={prex.holder}
                      maxLength={120}
                      required={prex.enabled}
                      onChange={(e) => setPrex((v) => ({ ...v, holder: e.target.value }))}
                    />
                  </label>
                  <label>
                    Número de cuenta Prex Argentina
                    <input
                      value={prex.account}
                      inputMode="numeric"
                      pattern="[0-9 -]*"
                      maxLength={40}
                      required={prex.enabled}
                      onChange={(e) => setPrex((v) => ({ ...v, account: e.target.value }))}
                    />
                  </label>
                  <label>
                    Indicaciones adicionales
                    <textarea
                      value={prex.instructions}
                      maxLength={600}
                      onChange={(e) => setPrex((v) => ({ ...v, instructions: e.target.value }))}
                    />
                  </label>
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={prex.enabled}
                      onChange={(e) => setPrex((v) => ({ ...v, enabled: e.target.checked }))}
                    />
                    Ofrecer transferencia Prex para Uruguay
                  </label>
                  <button className="button primary" disabled={busy}>
                    Guardar Prex
                  </button>
                </form>
              </article>
            </div>
            <p className="muted">
              País por IP:{' '}
              {data.geoConfigured
                ? 'preparado para el proxy seguro del sitio'
                : 'pendiente de configurar al publicar'}
              . El medio y la moneda se determinan automáticamente. Solo se ofrecen métodos
              habilitados con un precio definido. Sin detección, la reserva pide contactar a Vanina.
            </p>
          </>
        )}
      </section>
      <ConsultationPaymentHistory />
    </>
  );
}
