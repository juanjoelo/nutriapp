import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api.js';

export const paymentMoney = (p) =>
  p?.amount && p.currency
    ? new Intl.NumberFormat('es-AR', { style: 'currency', currency: p.currency }).format(
        p.amount / 100,
      ) +
      ' ' +
      p.currency
    : 'Precio no disponible';
const providers = {
  mercadopago: 'Mercado Pago',
  paypal: 'PayPal',
  prex: 'Prex',
  inspection: 'pago de prueba',
};

export function ConsultationPayment({ token, onPaid }) {
  const [data, setData] = useState(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    api('/bookings/payments/options', { method: 'POST', body: { token } })
      .then((v) => {
        if (alive) setData(v);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [token]);
  async function action(verify = false) {
    setBusy(true);
    setError('');
    try {
      const result = await api('/bookings/payments/' + (verify ? 'verify' : 'start'), {
        method: 'POST',
        body: { token },
      });
      setData((v) => ({ ...v, payment: result, paid: result.status === 'paid' }));
      if (result.status === 'paid') await onPaid?.();
      else if (!verify && result.url) window.location.assign(result.url);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const payment = data?.payment,
    method = data?.methods[0];
  return (
    <section className="panel consultation-payment">
      <h2>{data?.paid ? 'Pago registrado' : 'Completá tu pago'}</h2>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!data && !error && <p role="status">Consultando tu pago…</p>}
      {data?.paid ? (
        <p>¡Gracias! Podés revisar tus consultas a continuación.</p>
      ) : payment?.status === 'refunded' ? (
        <p>Este pago tiene un reembolso. Contactá a Vanina para revisarlo.</p>
      ) : payment?.provider === 'prex' ? (
        <>
          <p>
            <strong>{paymentMoney(data.quote)} estimados</strong>. El importe final en pesos
            uruguayos depende del cambio y las comisiones que muestra Prex.
          </p>
          <p>
            En Prex Uruguay elegí transferencia internacional a Prex Argentina. Ajustá el envío para
            que Vanina reciba <strong>{paymentMoney(payment)}</strong>.
          </p>
          <dl>
            <dt>Titular</dt>
            <dd>{payment.instructions.holder}</dd>
            <dt>Cuenta Prex Argentina</dt>
            <dd>{payment.instructions.account}</dd>
          </dl>
          <p>{payment.instructions.instructions}</p>
          <p>
            Vanina confirma el turno después de comprobar la recepción. Si vence la retención de 30
            minutos, puede ser necesario elegir otro horario.
          </p>
          <p className="muted">Conservá el comprobante. Referencia: {payment.id}</p>
        </>
      ) : (
        data && (
          <>
            <p>El turno se confirma cuando se verifica el pago del servicio o pack completo.</p>
            {(payment || method) && (
              <p>
                <strong>{paymentMoney(payment || method)}</strong> ·{' '}
                {providers[payment?.provider || method?.id]}
              </p>
            )}
            {payment?.url || method ? (
              <button className="button primary" disabled={busy} onClick={() => action()}>
                {busy ? 'Preparando…' : 'Continuar a ' + providers[payment?.provider || method?.id]}
              </button>
            ) : (
              <p>
                {data.quote?.reason ||
                  'Venció el plazo para pagar. Volvé a la agenda para elegir un horario.'}
              </p>
            )}
            {payment && ['mercadopago', 'paypal'].includes(payment.provider) && (
              <>
                <button className="button secondary" disabled={busy} onClick={() => action(true)}>
                  Ya pagué · verificar estado
                </button>
                <p className="muted">Si ya pagaste, verificá el estado antes de volver a pagar.</p>
              </>
            )}
          </>
        )
      )}
    </section>
  );
}

export function ConsultationPaymentReturn({ inspection = false }) {
  const navigate = useNavigate(),
    [data, setData] = useState(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const booking = new URLSearchParams(window.location.search).get('booking');
  useEffect(() => {
    let alive = true;
    api('/bookings/payment-return', { method: 'POST', body: { booking } })
      .then((v) => {
        if (!alive) return;
        if (!inspection || v.payment?.status === 'paid')
          navigate('/turnos/mi-reserva#' + v.token, { replace: true });
        else setData(v);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [booking, inspection, navigate]);
  async function simulate() {
    setBusy(true);
    setError('');
    try {
      const v = await api('/bookings/payment-return/simulate', {
        method: 'POST',
        body: { booking },
      });
      navigate('/turnos/mi-reserva#' + v.token, { replace: true });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="shell section booking-page">
      <div className="panel">
        <h1>{inspection ? 'Pago de prueba' : 'Verificando tu pago…'}</h1>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {inspection && data?.payment?.provider === 'inspection' ? (
          <>
            <p className="setup-notice">
              Inspección local · sin dinero real. Mercado Pago todavía no está conectado.
            </p>
            <p>
              {paymentMoney(data.payment)} · El turno sigue pendiente hasta completar esta prueba.
            </p>
            <button className="button primary" onClick={simulate} disabled={busy}>
              {busy ? 'Procesando…' : 'Simular pago aprobado'}
            </button>
            <Link className="button secondary" to={'/turnos/mi-reserva#' + data.token}>
              Volver sin pagar
            </Link>
          </>
        ) : (
          !error && (
            <p role="status">Estamos consultando el estado del pago. No cierres esta página.</p>
          )
        )}
        {error && (
          <Link className="text-link" to="/turnos">
            Volver a la agenda
          </Link>
        )}
      </div>
    </section>
  );
}
