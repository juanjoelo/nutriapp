import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { CalendarDays, List, Share2, Settings, Plus } from 'lucide-react';
import { api } from '../../lib/api.js';
import { dateValue, timeLabel, fullDate } from '../bookings/BookingPage.jsx';

const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const states = {
  confirmed: 'Confirmada',
  cancelled: 'Cancelada',
  completed: 'Atendida',
  no_show: 'No asistió',
  pending_payment: 'Pendiente de pago',
  expired: 'Vencida · sin pago',
  payment_review: 'Pago recibido · requiere otro horario',
};
const toTime = (value) => Date.parse(value + ':00-03:00');

function ServiceEditor({ service, onSaved }) {
  const [draft, setDraft] = useState(service),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [saved, setSaved] = useState(false);
  const field = (key, value) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setSaved(false);
  };
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { id, ...body } = draft;
      const updated = await api('/admin/bookings/services/' + id, { method: 'PUT', body });
      onSaved(updated);
      setSaved(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="panel booking-service-editor" onSubmit={save}>
      <label>
        Nombre del servicio
        <input
          value={draft.name}
          onChange={(e) => field('name', e.target.value)}
          required
          minLength={2}
          maxLength={100}
        />
      </label>
      <label>
        Descripción
        <textarea
          value={draft.description}
          onChange={(e) => field('description', e.target.value)}
          maxLength={1200}
        />
      </label>
      <div className="booking-form-grid">
        <label>
          Minutos por consulta
          <input
            type="number"
            min="15"
            max="180"
            step="5"
            required
            value={draft.duration}
            onChange={(e) => field('duration', Number(e.target.value))}
          />
        </label>
        <label>
          Consultas incluidas
          <input
            type="number"
            min="1"
            max="24"
            required
            value={draft.sessions ?? ''}
            onChange={(e) => field('sessions', e.target.value ? Number(e.target.value) : null)}
          />
        </label>
        <label>
          Precio del servicio o pack (ARS)
          <input
            type="number"
            min="0"
            max="1000000"
            step="0.01"
            value={draft.priceCents == null ? '' : draft.priceCents / 100}
            placeholder="A coordinar"
            onChange={(e) =>
              field(
                'priceCents',
                e.target.value === '' ? null : Math.round(Number(e.target.value) * 100),
              )
            }
          />
        </label>
      </div>
      <p className="muted">
        El precio corresponde al total de consultas incluidas. Los cambios se aplican a nuevas
        reservas.
      </p>
      <label className="check-label">
        <input
          type="checkbox"
          checked={Boolean(draft.online)}
          onChange={(e) => field('online', e.target.checked)}
        />
        Consulta o pack online · admite cobros internacionales
      </label>
      <div className="booking-form-grid">
        {[
          ['usdPriceCents', 'USD · cobro por PayPal'],
          ['uyuPriceCents', 'UYU · referencia para Prex'],
        ].map(([key, label]) => (
          <label key={key}>
            {label}
            <input
              type="number"
              min="0.01"
              max="1000000"
              step="0.01"
              placeholder="Sin habilitar"
              value={draft[key] == null ? '' : draft[key] / 100}
              onChange={(e) =>
                field(key, e.target.value === '' ? null : Math.round(Number(e.target.value) * 100))
              }
            />
          </label>
        ))}
      </div>
      <p className="muted">
        Son importes editables; no se actualizan con la cotización diaria. Los cobros
        internacionales requieren un servicio online. Prex Argentina recibe el precio ARS: el valor
        UYU es orientativo, y Prex determina el cambio y las comisiones al transferir.
      </p>
      <label className="check-label">
        <input
          type="checkbox"
          checked={draft.active}
          onChange={(e) => field('active', e.target.checked)}
        />{' '}
        Disponible para reservar
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {saved && <p role="status">Servicio guardado.</p>}
      <button className="button primary" disabled={busy}>
        {busy ? 'Guardando…' : 'Guardar servicio'}
      </button>
    </form>
  );
}

function ScheduleEditor({ settings, onSaved }) {
  const [draft, setDraft] = useState(settings),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState('');
  const field = (key, value) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setMessage('');
  };
  function intervals(day, value) {
    field(
      'weekly',
      draft.weekly.map((d) => (d.day === day ? { ...d, intervals: value } : d)),
    );
  }
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await api('/admin/bookings/config', { method: 'PUT', body: draft });
      onSaved(result);
      setMessage('Horarios y preferencias guardados.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="panel schedule-editor" onSubmit={save}>
      <h2>Tu disponibilidad</h2>
      <p>
        Definí tus horarios habituales. Podés bloquear excepciones desde la agenda. Todos los
        horarios son de Argentina (UTC−3).
      </p>
      <label className="check-label">
        <input
          type="checkbox"
          checked={draft.enabled}
          onChange={(e) => field('enabled', e.target.checked)}
        />{' '}
        Habilitar las reservas en la página
      </label>
      <label>
        Lugar o modalidad de atención
        <input
          value={draft.location}
          maxLength={250}
          placeholder="Dirección del consultorio o modalidad online"
          onChange={(e) => field('location', e.target.value)}
        />
      </label>
      <div className="weekly-schedule">
        {[1, 2, 3, 4, 5, 6, 0].map((day) => {
          const values = draft.weekly.find((d) => d.day === day).intervals;
          return (
            <div className="weekly-day" key={day}>
              <strong>{dayNames[day]}</strong>
              <div>
                {!values.length && <span className="muted">Sin atención</span>}
                {values.map((range, index) => (
                  <div className="weekly-interval" key={index}>
                    <label>
                      Desde
                      <input
                        type="time"
                        required
                        aria-label={dayNames[day] + ' desde ' + (index + 1)}
                        value={range.start}
                        onChange={(e) =>
                          intervals(
                            day,
                            values.map((r, i) =>
                              i === index ? { ...r, start: e.target.value } : r,
                            ),
                          )
                        }
                      />
                    </label>
                    <label>
                      Hasta
                      <input
                        type="time"
                        required
                        aria-label={dayNames[day] + ' hasta ' + (index + 1)}
                        value={range.end}
                        onChange={(e) =>
                          intervals(
                            day,
                            values.map((r, i) => (i === index ? { ...r, end: e.target.value } : r)),
                          )
                        }
                      />
                    </label>
                    <button
                      type="button"
                      className="text-link"
                      onClick={() =>
                        intervals(
                          day,
                          values.filter((_, i) => i !== index),
                        )
                      }
                    >
                      Quitar
                    </button>
                  </div>
                ))}
                {values.length < 3 && (
                  <button
                    type="button"
                    className="text-link"
                    onClick={() => intervals(day, [...values, { start: '09:00', end: '12:00' }])}
                  >
                    + Agregar franja
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="booking-form-grid">
        <label>
          Anticipación mínima (horas)
          <input
            type="number"
            min="1"
            max="168"
            required
            value={draft.noticeHours}
            onChange={(e) => field('noticeHours', Number(e.target.value))}
          />
        </label>
        <label>
          Mostrar próximos días
          <input
            type="number"
            min="7"
            max="180"
            required
            value={draft.horizonDays}
            onChange={(e) => field('horizonDays', Number(e.target.value))}
          />
        </label>
        <label>
          Plazo para cambiar o cancelar (horas)
          <input
            type="number"
            min="1"
            max="168"
            required
            value={draft.cancellationHours}
            onChange={(e) => field('cancellationHours', Number(e.target.value))}
          />
        </label>
      </div>
      <p className="muted">
        Las reservas existentes se conservan al cambiar los horarios o pausar la agenda. Una
        cancelación devuelve la consulta al pack; una inasistencia la consume.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <button className="button primary" disabled={busy}>
        {busy ? 'Guardando…' : 'Guardar disponibilidad'}
      </button>
    </form>
  );
}

function BookingShare({ url }) {
  const [qr, setQr] = useState(''),
    [message, setMessage] = useState('');
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(url, { width: 480, margin: 4, errorCorrectionLevel: 'M' })
      .then((value) => {
        if (alive) setQr(value);
      })
      .catch(() => {
        if (alive) setMessage('No pudimos generar el QR. Podés compartir el enlace.');
      });
    return () => {
      alive = false;
    };
  }, [url]);
  return (
    <div className="panel booking-share">
      <h2>Compartí tu agenda</h2>
      <p>Este enlace y su QR abren la reserva, sin pedir una cuenta.</p>
      <div className="booking-qr-card">
        <span className="eyebrow">VANINA ALANIZ · NUTRICIÓN INTEGRAL</span>
        <h2>¡Reservá tu consulta!</h2>
        {qr && (
          <img src={qr} width="320" height="320" alt="Código QR para abrir la agenda de Vanina" />
        )}
        <p>Escaneá el código con tu celular</p>
        <p className="booking-share-url">{url}</p>
      </div>
      <div className="merch-actions">
        <button
          className="button primary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setMessage('Enlace copiado.');
            } catch {
              setMessage('Copiá el enlace que aparece arriba.');
            }
          }}
        >
          Copiar enlace
        </button>
        {qr && (
          <a className="button secondary" href={qr} download="turnos-vanina-alaniz.png">
            Descargar QR
          </a>
        )}
        <button className="button secondary" onClick={() => window.print()}>
          Imprimir
        </button>
      </div>
      {/localhost|127\.0\.0\.1/.test(new URL(url).hostname) && (
        <p className="setup-notice">
          Este QR apunta al entorno local. Cuando se publique el sitio con su dominio, usá el QR
          generado allí para compartirlo con pacientes.
        </p>
      )}
      {message && <p role="status">{message}</p>}
    </div>
  );
}

function Agenda() {
  const [from, setFrom] = useState(dateValue),
    [to, setTo] = useState(() => dateValue(Date.now() + 30 * 86400000)),
    [data, setData] = useState(null),
    [error, setError] = useState(''),
    [search, setSearch] = useState(''),
    [status, setStatus] = useState('all'),
    [view, setView] = useState('list'),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    setData(null);
    api('/admin/bookings?' + new URLSearchParams({ from, to }), { signal: controller.signal })
      .then(setData)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [from, to, revision]);
  async function mutate(path, method, body) {
    setBusy(true);
    setError('');
    try {
      await api(path, { method, body });
      setRevision((n) => n + 1);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const rows = (data?.appointments || []).filter(
    (a) =>
      (status === 'all' || a.status === status) &&
      [a.customer.name, a.customer.email, a.customer.phone, a.service.name].some((v) =>
        v.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
      ),
  );
  const groups = Object.groupBy(rows, (a) => dateValue(a.starts));
  const days = [];
  if (from && to && from <= to)
    for (
      let stamp = Date.parse(from + 'T12:00:00Z');
      stamp <= Date.parse(to + 'T12:00:00Z') && days.length < 185;
      stamp += 86400000
    )
      days.push(dateValue(stamp));
  const card = (a) => (
    <article className="appointment-card" key={a.id}>
      <div>
        <span className="status-tag">{states[a.status]}</span>
        <h3>
          {timeLabel(a.starts)} · {a.customer.name}
        </h3>
        <p>{a.service.name}</p>
        <p className="muted">
          {a.customer.email}
          <br />
          {a.customer.phone}
        </p>
      </div>
      <details>
        <summary>Ver detalles y acciones</summary>
        <p>
          {fullDate(a.starts)} a {timeLabel(a.ends)}
        </p>
        <p>Consultas del pack: {a.service.sessions}</p>
        <p>
          Pago del servicio o pack:{' '}
          {a.payment_status === 'paid'
            ? 'registrado'
            : a.payment_status === 'refunded'
              ? 'reembolso / revisar'
              : 'pendiente'}
          . No se realiza un cobro desde esta acción.
        </p>
        <button
          className="button secondary"
          disabled={busy}
          onClick={() =>
            mutate('/admin/bookings/packages/' + a.pack_id + '/payment', 'PATCH', {
              status: a.payment_status === 'paid' ? 'pending' : 'paid',
            })
          }
        >
          {a.payment_status === 'paid' ? 'Marcar pago pendiente' : 'Registrar pago recibido'}
        </button>
        {a.status === 'confirmed' && (
          <div className="merch-actions">
            {a.starts <= Date.now() && (
              <>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() =>
                    mutate('/admin/bookings/' + a.id, 'PATCH', { status: 'completed' })
                  }
                >
                  Marcar atendida
                </button>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => mutate('/admin/bookings/' + a.id, 'PATCH', { status: 'no_show' })}
                >
                  No asistió
                </button>
              </>
            )}
            <details>
              <summary>Cancelar turno</summary>
              <p>Se libera el horario y se prepara un aviso por email.</p>
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => mutate('/admin/bookings/' + a.id, 'PATCH', { status: 'cancelled' })}
              >
                Confirmar cancelación
              </button>
            </details>
          </div>
        )}
      </details>
    </article>
  );
  return (
    <>
      <div className="booking-toolbar">
        <label>
          Desde
          <input
            type="date"
            value={from}
            onChange={(e) => {
              if (e.target.value) setFrom(e.target.value);
            }}
          />
        </label>
        <label>
          Hasta
          <input
            type="date"
            value={to}
            onChange={(e) => {
              if (e.target.value) setTo(e.target.value);
            }}
          />
        </label>
        <label>
          Buscar reserva
          <input
            type="search"
            placeholder="Nombre, email, teléfono o servicio"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label>
          Estado
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">Todos</option>
            {Object.entries(states).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="merch-actions">
        <button
          className="button secondary"
          aria-pressed={view === 'list'}
          onClick={() => setView('list')}
        >
          <List size={18} />
          Lista
        </button>
        <button
          className="button secondary"
          aria-pressed={view === 'calendar'}
          onClick={() => setView('calendar')}
        >
          <CalendarDays size={18} />
          Calendario
        </button>
        <a className="button primary" href="/turnos" target="_blank" rel="noreferrer">
          <Plus size={18} />
          Agendar reserva
        </a>
        <button className="text-link" onClick={() => setRevision((n) => n + 1)}>
          Actualizar
        </button>
      </div>
      <details className="panel booking-block-form">
        <summary>Bloquear un horario</summary>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void mutate('/admin/bookings/blocks', 'POST', {
              starts: toTime(f.get('from')),
              ends: toTime(f.get('to')),
              reason: f.get('reason'),
            });
          }}
        >
          <p>El bloqueo evita nuevas reservas. Los turnos existentes deben revisarse antes.</p>
          <div className="booking-form-grid">
            <label>
              Desde (Argentina)
              <input type="datetime-local" name="from" required />
            </label>
            <label>
              Hasta (Argentina)
              <input type="datetime-local" name="to" required />
            </label>
            <label>
              Motivo interno
              <input name="reason" maxLength={200} />
            </label>
          </div>
          <button className="button primary" disabled={busy}>
            Guardar bloqueo
          </button>
        </form>
      </details>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!data && !error && <p role="status">Cargando agenda…</p>}
      {data && (
        <>
          <p>
            {rows.length} reserva{rows.length !== 1 ? 's' : ''} en este período.
          </p>
          {view === 'list' ? (
            <div className="agenda-list">
              {Object.entries(groups).map(([day, appointments]) => (
                <section key={day}>
                  <h2>
                    {new Date(day + 'T12:00:00Z').toLocaleDateString('es-AR', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                    })}
                  </h2>
                  {appointments.map(card)}
                </section>
              ))}
              {!rows.length && (
                <div className="panel">No hay reservas que coincidan con esta búsqueda.</div>
              )}
            </div>
          ) : (
            <div className="booking-calendar">
              {days.map((day) => (
                <section className="calendar-day" key={day}>
                  <h3>
                    {new Date(day + 'T12:00:00Z').toLocaleDateString('es-AR', {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                    })}
                  </h3>
                  {(groups[day] || []).map(card)}
                  {!groups[day]?.length && <span className="muted">Sin reservas</span>}
                  {data.blocks
                    .filter((b) => dateValue(b.starts) <= day && dateValue(b.ends) >= day)
                    .map((b) => (
                      <p className="calendar-block" key={b.id}>
                        Horario bloqueado · {b.reason || 'No disponible'}
                      </p>
                    ))}
                </section>
              ))}
            </div>
          )}
          {!!data.blocks.length && (
            <div className="panel">
              <h2>Horarios bloqueados</h2>
              {data.blocks.map((b) => (
                <div className="booking-block" key={b.id}>
                  <p>
                    {fullDate(b.starts)} — {fullDate(b.ends)}
                    <br />
                    {b.reason}
                  </p>
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() => mutate('/admin/bookings/blocks/' + b.id, 'DELETE')}
                  >
                    Quitar bloqueo
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}

export function BookingsPanel() {
  const [data, setData] = useState(null),
    [tab, setTab] = useState('agenda'),
    [error, setError] = useState('');
  useEffect(() => {
    api('/admin/bookings/config')
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <section className="admin-content bookings-panel">
      <span className="eyebrow">TIEMPO PARA ACOMPAÑAR</span>
      <h1>Tu agenda.</h1>
      <p>Reservas sin cuentas, consultas y packs en un mismo lugar.</p>
      <div className="merch-tabs" role="group" aria-label="Secciones de turnos">
        {[
          ['agenda', 'Reservas', CalendarDays],
          ['servicios', 'Servicios y packs', List],
          ['horarios', 'Disponibilidad', Settings],
          ['compartir', 'Enlace y QR', Share2],
        ].map(([id, label, Icon]) => (
          <button
            key={id}
            className={tab === id ? 'button primary' : 'button secondary'}
            aria-pressed={tab === id}
            onClick={() => setTab(id)}
          >
            <Icon size={19} />
            {label}
          </button>
        ))}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!data && !error && <p role="status">Abriendo tu agenda…</p>}
      {data && (
        <>
          {!data.settings.enabled && (
            <p className="setup-notice">
              La agenda pública está pausada. Configurá tus servicios y horarios; después habilitá
              las reservas desde Disponibilidad.
            </p>
          )}
          {tab === 'agenda' ? (
            <Agenda />
          ) : tab === 'horarios' ? (
            <ScheduleEditor
              settings={data.settings}
              onSaved={(settings) => setData((d) => ({ ...d, settings }))}
            />
          ) : tab === 'compartir' ? (
            <BookingShare url={data.url} />
          ) : (
            <>
              <p>
                Definí la cantidad y el precio de cada pack. Las nuevas reservas se confirman
                después de pagar. Podés modificar los precios; las reservas ya iniciadas conservan
                su importe.
              </p>
              <div className="booking-service-editors">
                {data.services.map((service) => (
                  <ServiceEditor
                    key={service.id}
                    service={service}
                    onSaved={(updated) =>
                      setData((d) => ({
                        ...d,
                        services: d.services.map((s) => (s.id === updated.id ? updated : s)),
                      }))
                    }
                  />
                ))}
              </div>
              <button
                className="button secondary"
                onClick={() =>
                  setData((d) => ({
                    ...d,
                    services: [
                      ...d.services,
                      {
                        id: crypto.randomUUID(),
                        name: 'Nuevo servicio',
                        description: '',
                        duration: 30,
                        sessions: 1,
                        priceCents: null,
                        active: false,
                      },
                    ],
                  }))
                }
              >
                <Plus size={18} />
                Agregar servicio
              </button>
            </>
          )}
        </>
      )}
    </section>
  );
}
