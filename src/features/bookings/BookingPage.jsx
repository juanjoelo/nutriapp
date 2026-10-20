import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, Clock, CheckCircle2 } from 'lucide-react';
import { api } from '../../lib/api.js';
import { ConsultationPayment, paymentMoney } from './ConsultationPayment.jsx';

export const dateValue = (time = Date.now()) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(time);
export const timeLabel = (time) =>
  new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(time);
export const fullDate = (time) =>
  new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    dateStyle: 'long',
    timeStyle: 'short',
    hourCycle: 'h23',
  }).format(time);

export function SlotPicker({
  serviceId,
  token,
  appointmentId,
  date,
  onDate,
  selected,
  onSelect,
  horizonDays = 60,
}) {
  const [slots, setSlots] = useState([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setSlots([]);
    onSelect(null);
    const path = token
      ? '/bookings/manage/slots'
      : '/bookings/slots?' + new URLSearchParams({ serviceId, date });
    api(path, {
      signal: controller.signal,
      ...(token
        ? { method: 'POST', body: { token, date, ...(appointmentId ? { appointmentId } : {}) } }
        : {}),
    })
      .then((r) => {
        if (!controller.signal.aborted) setSlots(r.slots);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [serviceId, token, appointmentId, date]);
  return (
    <div className="slot-picker">
      <label>
        Elegí una fecha
        <input
          type="date"
          value={date}
          min={dateValue()}
          max={dateValue(Date.now() + horizonDays * 86400000)}
          onChange={(e) => {
            if (e.target.value) onDate(e.target.value);
          }}
          required
        />
      </label>
      <p className="muted">Horarios de Argentina · Buenos Aires (UTC−3)</p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">Buscando horarios…</p>
      ) : (
        <div className="slot-list" role="group" aria-label="Horarios disponibles">
          {slots.map((start) => (
            <button
              type="button"
              className={selected === start ? 'button primary' : 'button secondary'}
              aria-pressed={selected === start}
              key={start}
              onClick={() => onSelect(start)}
            >
              {timeLabel(start)}
            </button>
          ))}
          {!slots.length && !error && (
            <p>No hay horarios disponibles para esta fecha. Probá otro día.</p>
          )}
        </div>
      )}
    </div>
  );
}
export function BookingPage() {
  const [data, setData] = useState(null),
    [serviceId, setServiceId] = useState(''),
    [date, setDate] = useState(dateValue),
    [starts, setStarts] = useState(null),
    [result, setResult] = useState(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [key] = useState(() => crypto.randomUUID());
  useEffect(() => {
    api('/bookings/options')
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  const service = data?.services.find((s) => s.id === serviceId);
  async function reserve(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    const values = new FormData(e.currentTarget);
    try {
      const response = await api('/bookings', {
        method: 'POST',
        body: {
          serviceId,
          starts,
          checkout: true,
          requestKey: key,
          consent: values.get('consent') === 'on',
          customer: {
            name: values.get('name'),
            email: values.get('email'),
            phone: values.get('phone'),
          },
        },
      });
      if (response.payment?.url) {
        window.location.assign(response.payment.url);
        return;
      }
      setResult(response);
      if (response.checkoutError) setError(response.checkoutError);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="shell section booking-page">
      <div className="booking-heading">
        <span className="eyebrow">UN ESPACIO PARA VOS</span>
        <h1>Reservá tu consulta.</h1>
        <p>
          Elegí tu acompañamiento y un horario. Sin crear una cuenta. El turno se confirma después
          del pago.
        </p>
        {data?.market.source === 'inspection' && (
          <p className="setup-notice">Vista de prueba para Argentina · sin cobros reales.</p>
        )}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!data && !error && <p role="status">Cargando la agenda…</p>}
      {result ? (
        <div className="panel booking-confirmation">
          {result.paymentStatus === 'paid' ? <CheckCircle2 size={38} /> : <Clock size={38} />}
          <h2>
            {result.paymentStatus !== 'paid'
              ? 'Completá el pago para confirmar.'
              : result.appointments.some((a) => a.status === 'confirmed')
                ? 'Tu turno está reservado.'
                : 'Pago recibido: revisá tu horario.'}
          </h2>
          <p>
            {result.service.name} · {fullDate(result.appointments[0].starts)}
          </p>
          <p>
            Guardá este enlace privado para consultar, reprogramar o cancelar tus turnos sin crear
            una cuenta.
          </p>
          {result.paymentStatus !== 'paid' && (
            <p>
              El horario se retiene por 30 minutos, hasta las{' '}
              {timeLabel(result.appointments[0].expires)}. Si no se acredita el pago, vuelve a estar
              disponible.
            </p>
          )}
          <Link className="button primary" to={'/turnos/mi-reserva#' + result.token}>
            Ver y gestionar mi reserva
          </Link>
          <ConsultationPayment
            token={result.token}
            online={result.service.online}
            onPaid={async () => {
              const updated = await api('/bookings/manage', {
                method: 'POST',
                body: { token: result.token },
              });
              setResult({ ...updated, token: result.token });
            }}
          />
        </div>
      ) : data && (!data.settings.enabled || !data.services.length) ? (
        <div className="panel booking-empty">
          <CalendarDays size={36} />
          <h2>La agenda se está preparando.</h2>
          <p>Por ahora podés conversar con Vanina para coordinar tu consulta.</p>
          <Link className="button primary" to="/#contacto">
            Contactar a Vanina
          </Link>
        </div>
      ) : (
        data && (
          <div className="booking-grid">
            <div>
              <h2>1. Elegí tu acompañamiento</h2>
              <div className="booking-services">
                {data.services.map((s) => (
                  <button
                    type="button"
                    key={s.id}
                    className={'panel booking-service ' + (serviceId === s.id ? 'selected' : '')}
                    aria-pressed={serviceId === s.id}
                    disabled={!s.checkout?.available}
                    onClick={() => {
                      setServiceId(s.id);
                      setStarts(null);
                    }}
                  >
                    <h3>{s.name}</h3>
                    <p>{s.description}</p>
                    <span>
                      <Clock size={17} />
                      {s.duration} minutos por consulta · {s.sessions}{' '}
                      {s.sessions === 1 ? 'consulta' : 'consultas'}
                    </span>
                    <strong>
                      {s.checkout?.amount ? paymentMoney(s.checkout) : 'Precio no disponible'}
                      {s.sessions > 1 ? ' por el pack' : ''}
                    </strong>
                    {s.checkout?.indicative && (
                      <small>
                        Importe orientativo. Prex define el cambio y las comisiones al enviar a
                        Argentina.
                      </small>
                    )}
                    {!s.checkout?.available && <small>{s.checkout?.reason}</small>}
                  </button>
                ))}
              </div>
            </div>
            <div className="panel booking-form">
              {!service ? (
                <p>Seleccioná un servicio para ver sus horarios.</p>
              ) : (
                <>
                  <h2>2. Elegí tu horario</h2>
                  {data.settings.location && <p>{data.settings.location}</p>}
                  <SlotPicker
                    serviceId={serviceId}
                    date={date}
                    onDate={setDate}
                    selected={starts}
                    onSelect={setStarts}
                    horizonDays={data.settings.horizonDays}
                  />
                  {starts && (
                    <form onSubmit={reserve}>
                      <h2>3. Tus datos</h2>
                      <p>{fullDate(starts)}</p>
                      <label>
                        Nombre y apellido
                        <input
                          name="name"
                          autoComplete="name"
                          minLength={2}
                          maxLength={100}
                          required
                        />
                      </label>
                      <label>
                        Email
                        <input
                          name="email"
                          type="email"
                          autoComplete="email"
                          maxLength={200}
                          required
                        />
                      </label>
                      <label>
                        Teléfono
                        <input
                          name="phone"
                          type="tel"
                          autoComplete="tel"
                          minLength={6}
                          maxLength={40}
                          required
                        />
                      </label>
                      <label className="checkbox-label">
                        <input name="consent" type="checkbox" required />
                        Acepto que mis datos se usen para gestionar esta reserva y sus avisos.
                      </label>
                      <p className="muted">
                        Podés cambiar o cancelar con al menos {data.settings.cancellationHours}{' '}
                        horas de anticipación.{' '}
                        {service.sessions > 1
                          ? 'Reservás la primera consulta; las siguientes se coordinan desde tu enlace privado.'
                          : ''}{' '}
                        El turno se confirma después de pagar. Retenemos el horario por 30 minutos
                        mientras completás el pago.
                      </p>
                      <button disabled={busy} className="button primary full-width">
                        {busy
                          ? 'Abriendo el pago…'
                          : data.market?.country === 'UY'
                            ? 'Reservar turno · ver datos Prex'
                            : 'Reservar turno · pagar ahora'}
                      </button>
                    </form>
                  )}
                </>
              )}
            </div>
          </div>
        )
      )}
    </section>
  );
}

export function ManageBookingPage() {
  const [token] = useState(() => window.location.hash.slice(1)),
    [data, setData] = useState(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [editing, setEditing] = useState(null),
    [date, setDate] = useState(dateValue),
    [starts, setStarts] = useState(null);
  useEffect(() => {
    // A fragment stays out of HTTP requests and referrers; keep it for the patient's private bookmark.
    if (token)
      api('/bookings/manage', { method: 'POST', body: { token } })
        .then(setData)
        .catch((e) => setError(e.message));
    else setError('Abrí el enlace privado que recibiste al reservar.');
  }, [token]);
  async function change(action, appointmentId) {
    setBusy(true);
    setError('');
    try {
      setData(
        await api('/bookings/manage/change', {
          method: 'POST',
          body: {
            token,
            action,
            ...(appointmentId ? { appointmentId } : {}),
            ...(action !== 'cancel' ? { starts } : {}),
          },
        }),
      );
      setEditing(null);
      setStarts(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const names = {
    confirmed: 'Confirmado',
    cancelled: 'Cancelado',
    completed: 'Atendido',
    no_show: 'Ausente',
    pending_payment: 'Pendiente de pago · sin confirmar',
    expired: 'Plazo de pago vencido',
    payment_review: 'Pago recibido · elegí otro horario',
  };
  return (
    <section className="shell section booking-page">
      <span className="eyebrow">TU ACOMPAÑAMIENTO</span>
      <h1>Mis consultas.</h1>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {data && (
        <>
          <div className="panel">
            <h2>{data.service.name}</h2>
            <p>
              {data.customer.name} · {data.service.sessions} consultas · {data.remaining}{' '}
              disponibles para agendar
            </p>
            <p>{data.location}</p>
            <p className="muted">
              Conservá tu enlace privado. Pago:{' '}
              {data.paymentStatus === 'paid'
                ? 'registrado'
                : data.paymentStatus === 'refunded'
                  ? 'reembolso / contactá a Vanina'
                  : 'pendiente'}
              .
            </p>
          </div>
          <ConsultationPayment
            token={token}
            online={data.service.online}
            onPaid={async () =>
              setData(await api('/bookings/manage', { method: 'POST', body: { token } }))
            }
          />
          <div className="booking-reservations">
            {data.appointments.map((a) => (
              <article className="panel" key={a.id}>
                <span className="status-tag">{names[a.status]}</span>
                <h3>{fullDate(a.starts)}</h3>
                {a.status === 'pending_payment' && (
                  <p>
                    Completá el pago antes de las {timeLabel(a.expires)} para confirmar. Luego el
                    horario se libera.
                  </p>
                )}
                {a.status === 'expired' && data.paymentStatus !== 'paid' && (
                  <p>
                    El horario ya no está retenido. Volvé a la agenda para iniciar una nueva
                    reserva. Si ya pagaste, verificá el pago antes de volver a pagar.
                  </p>
                )}
                {a.status === 'payment_review' && (
                  <p>
                    El pago está registrado, pero el horario ya no está disponible. Elegí otro
                    usando tu pack, sin pagar nuevamente.
                  </p>
                )}
                {a.status === 'confirmed' && (
                  <div className="merch-actions">
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={() => {
                        setEditing(a.id);
                        setDate(dateValue(a.starts));
                      }}
                    >
                      Cambiar horario
                    </button>
                    <details>
                      <summary>Cancelar turno</summary>
                      <p>Se liberará este horario.</p>
                      <button
                        className="button secondary"
                        disabled={busy}
                        onClick={() => change('cancel', a.id)}
                      >
                        Confirmar cancelación
                      </button>
                    </details>
                  </div>
                )}
              </article>
            ))}
          </div>
          {data.remaining > 0 &&
            (!data.service.paymentRequired || data.paymentStatus === 'paid') && (
              <button
                className="button primary"
                onClick={() => {
                  setEditing('next');
                  setDate(dateValue());
                }}
              >
                Reservar otra consulta de mi pack
              </button>
            )}
          {editing && (
            <div className="panel booking-reschedule">
              <h2>{editing === 'next' ? 'Tu próxima consulta' : 'Elegí otro horario'}</h2>
              <SlotPicker
                token={token}
                appointmentId={editing === 'next' ? undefined : editing}
                date={date}
                onDate={setDate}
                selected={starts}
                onSelect={setStarts}
              />
              <button
                className="button primary"
                disabled={busy || !starts}
                onClick={() =>
                  change(
                    editing === 'next' ? 'next' : 'reschedule',
                    editing === 'next' ? undefined : editing,
                  )
                }
              >
                Guardar horario
              </button>
            </div>
          )}
        </>
      )}
      <Link className="text-link" to="/turnos">
        Volver a la agenda
      </Link>
    </section>
  );
}
