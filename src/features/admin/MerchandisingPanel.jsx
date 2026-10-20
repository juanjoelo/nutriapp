import { useEffect, useState } from 'react';
import { Plus, Tag, Gift, Palette, History } from 'lucide-react';
import { api, money } from '../../lib/api.js';
import { accentText } from '../../lib/colors.js';
import { MerchandisingHistory } from './MerchandisingHistory.jsx';
const presets = {
  natural: {
    name: 'Personalizada',
    title: 'Un momento para elegirte',
    subtitle: 'Pequeños hábitos, grandes cambios.',
    announcement: 'Bienestar para cada día',
    color: '#006b49',
    background: '#fafbf6',
    ink: '#173f32',
  },
  black: {
    name: 'Black Friday',
    title: 'Tu bienestar, con un regalo extra.',
    subtitle: 'Descubrí los especiales de nuestra tienda.',
    announcement: 'Black Friday · Encontrá tus favoritos',
    color: '#174b39',
    background: '#f2eee5',
    ink: '#174b39',
  },
  madre: {
    name: 'Día de la Madre',
    title: 'Un mimo para quien siempre cuida.',
    subtitle: 'Regalos elegidos con amor para compartir bienestar.',
    announcement: 'Celebramos a mamá · Regalos con intención',
    color: '#287955',
    background: '#fff8e8',
    ink: '#173f32',
  },
  fiestas: {
    name: 'Navidad y Año Nuevo',
    title: 'Compartir también nos nutre.',
    subtitle: 'Celebrá los encuentros con regalos que hacen bien.',
    announcement: 'Fiestas · Navidad y Año Nuevo con bienestar',
    color: '#006b49',
    background: '#fff6df',
    ink: '#173f32',
  },
};
const blankCampaign = () => ({
  ...presets.natural,
  enabled: false,
  scheduled: false,
  start: null,
  end: null,
  discount: 0,
  productIds: [],
  appearance: true,
  priority: 0,
  button: 'Explorar la tienda',
  image: '',
});
const blankCombo = () => ({
  name: '',
  description: '',
  image: '',
  discount: 10,
  active: true,
  components: [],
});
const localDate = (value) =>
  value ? new Date(value - 3 * 3600000).toISOString().slice(0, 16) : '';
const timestamp = (value) => (value ? Date.parse(value + ':00-03:00') : null);
function withoutId(value) {
  const { id, ...body } = value;
  return body;
}
export function MerchandisingPanel() {
  const [data, setData] = useState({ campaigns: [], combos: [] }),
    [products, setProducts] = useState([]),
    [kind, setKind] = useState('campaign'),
    [draft, setDraft] = useState(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState('');
  async function load() {
    const [d, p] = await Promise.all([api('/admin/merchandising'), api('/admin/products')]);
    setData(d);
    setProducts(p);
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);
  const change = (key, value) => setDraft((d) => ({ ...d, [key]: value }));
  const individuals = products.filter(
    (p) => (p.active || draft?.components?.some((c) => c.id === p.id)) && !p.isCombo,
  );
  const base =
    draft?.components?.reduce(
      (sum, c) => sum + (products.find((p) => p.id === c.id)?.priceCents || 0) * c.quantity,
      0,
    ) || 0;
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const id = draft.id || crypto.randomUUID();
      await api('/admin/' + (kind === 'campaign' ? 'campaigns' : 'combos') + '/' + id, {
        method: 'PUT',
        body: withoutId(draft),
      });
      await load();
      setDraft(null);
      setMessage(kind === 'campaign' ? 'Campaña guardada.' : 'Combo guardado.');
    } catch (e) {
      setError(e.message + (e.fields?.length ? ' Revisá porcentajes, fechas y productos.' : ''));
    } finally {
      setBusy(false);
    }
  }
  async function upload(file) {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.append('image', file);
      const result = await api('/admin/uploads', { method: 'POST', body: form });
      change('image', result.image);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function reuse(type, config) {
    setKind(type);
    setDraft({
      ...withoutId(config),
      name: ('Copia de ' + config.name).slice(0, type === 'campaign' ? 100 : 120),
      ...(type === 'campaign' ? { enabled: false } : { active: false }),
    });
    setError('');
    setMessage(
      'Configuración cargada como copia desactivada. Revisá fechas, productos y precio antes de guardarla.',
    );
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  async function removeConfiguration(id) {
    setBusy(true);
    setError('');
    try {
      await api('/admin/' + (kind === 'campaign' ? 'campaigns' : 'combos') + '/' + id, {
        method: 'DELETE',
      });
      await load();
      setMessage(
        (kind === 'campaign' ? 'Campaña eliminada.' : 'Combo eliminado.') +
          ' Su configuración quedó en el historial.',
      );
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
          <span className="eyebrow">TU TIENDA, A TU MANERA</span>
          <h1>Ofertas y ocasiones.</h1>
          <p>Creá combos, descuentos y una apariencia especial para cada momento.</p>
        </div>
      </div>
      <div className="merch-tabs">
        <button
          className={kind === 'campaign' ? 'button primary' : 'button secondary'}
          onClick={() => {
            setKind('campaign');
            setDraft(null);
          }}
        >
          <Palette size={18} /> Campañas y descuentos
        </button>
        <button
          className={kind === 'combo' ? 'button primary' : 'button secondary'}
          onClick={() => {
            setKind('combo');
            setDraft(null);
          }}
        >
          <Gift size={18} /> Combos
        </button>
        <button
          className={kind === 'history' ? 'button primary' : 'button secondary'}
          onClick={() => {
            setKind('history');
            setDraft(null);
            setMessage('');
            setError('');
          }}
        >
          <History size={18} />
          Historial
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
      {kind === 'history' ? (
        <MerchandisingHistory onReuse={reuse} products={products} />
      ) : !draft ? (
        <>
          <button
            className="button primary"
            onClick={() => {
              setDraft(kind === 'campaign' ? blankCampaign() : blankCombo());
              setMessage('');
              setError('');
            }}
          >
            <Plus size={18} />
            {kind === 'campaign' ? 'Crear campaña o descuento' : 'Crear combo'}
          </button>
          <div className="merch-list">
            {(kind === 'campaign' ? data.campaigns : data.combos).map((c) => (
              <article className="panel merch-summary" key={c.id}>
                <div>
                  <span className="eyebrow">
                    {kind === 'campaign'
                      ? c.enabled
                        ? c.scheduled
                          ? 'Programada'
                          : 'Activa'
                        : 'Desactivada'
                      : products.find((p) => p.id === c.id)?.active
                        ? 'Visible'
                        : 'Oculto'}
                  </span>
                  <h2>{c.name}</h2>
                  <p>
                    {c.discount}% de descuento
                    {kind === 'campaign'
                      ? c.productIds.length
                        ? ' · Productos seleccionados'
                        : ' · Todo el catálogo'
                      : ' · ' + c.components.length + ' productos'}
                  </p>
                  {c.scheduled && (
                    <small>
                      {new Date(c.start).toLocaleString('es-AR', {
                        timeZone: 'America/Argentina/Buenos_Aires',
                      })}{' '}
                      →{' '}
                      {new Date(c.end).toLocaleString('es-AR', {
                        timeZone: 'America/Argentina/Buenos_Aires',
                      })}{' '}
                      (Argentina)
                    </small>
                  )}
                </div>
                <button
                  className="button secondary"
                  onClick={() => {
                    setDraft({ ...c });
                    setError('');
                    setMessage('');
                  }}
                >
                  Editar {c.name}
                </button>
                <button className="text-button" onClick={() => reuse(kind, c)}>
                  Reutilizar {c.name}
                </button>
                <details>
                  <summary>Eliminar {kind === 'campaign' ? 'campaña' : 'combo'}</summary>
                  <p>
                    Se quitará de la tienda y de esta lista. Su configuración quedará en el
                    historial para reutilizarla.
                  </p>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => removeConfiguration(c.id)}
                  >
                    Confirmar eliminación
                  </button>
                </details>
              </article>
            ))}
          </div>
          {!(kind === 'campaign' ? data.campaigns : data.combos).length && (
            <div className="empty-state compact">
              <Tag />
              <h2>Prepará tu próxima ocasión.</h2>
              <p>Podés guardar campañas desactivadas y encenderlas cuando quieras.</p>
            </div>
          )}
        </>
      ) : (
        <form className="panel merch-form" onSubmit={save}>
          <div className="panel-heading">
            <h2>
              {draft.id ? 'Editar' : 'Crear'} {kind === 'campaign' ? 'campaña' : 'combo'}
            </h2>
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => setDraft(null)}
            >
              Cancelar
            </button>
          </div>
          {kind === 'campaign' && (
            <label>
              Punto de partida
              <select
                defaultValue=""
                onChange={(e) => {
                  const p = presets[e.target.value];
                  if (p) setDraft((d) => ({ ...d, ...p }));
                }}
              >
                <option value="">Elegí un estilo (opcional)</option>
                {Object.entries(presets).map(([key, p]) => (
                  <option key={key} value={key}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Nombre
            <input
              required
              minLength={2}
              maxLength={120}
              value={draft.name}
              onChange={(e) => change('name', e.target.value)}
            />
          </label>
          {kind === 'combo' && (
            <label>
              Descripción del combo
              <textarea
                required
                minLength={5}
                maxLength={4000}
                value={draft.description}
                onChange={(e) => change('description', e.target.value)}
              />
            </label>
          )}
          <div className="merch-fields">
            <label>
              Descuento (%)
              <input
                type="number"
                min="0"
                max="90"
                step="1"
                required
                value={draft.discount}
                onChange={(e) => change('discount', Number(e.target.value))}
              />
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={kind === 'campaign' ? draft.enabled : draft.active}
                onChange={(e) =>
                  change(kind === 'campaign' ? 'enabled' : 'active', e.target.checked)
                }
              />
              {kind === 'campaign' ? 'Activar campaña' : 'Visible en la tienda'}
            </label>
          </div>
          <p className="muted">
            Los descuentos no se acumulan. Se aplica el mayor porcentaje sobre el precio de lista;
            en un combo, sobre la suma de sus productos.
          </p>
          {kind === 'campaign' ? (
            <>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={draft.scheduled}
                  onChange={(e) => change('scheduled', e.target.checked)}
                />
                Programar por fechas
              </label>
              {draft.scheduled && (
                <>
                  <p>
                    Horario de Argentina. Se activa al inicio y termina al llegar a la fecha final.
                  </p>
                  <div className="merch-fields">
                    <label>
                      Inicio
                      <input
                        type="datetime-local"
                        required
                        value={localDate(draft.start)}
                        onChange={(e) => change('start', timestamp(e.target.value))}
                      />
                    </label>
                    <label>
                      Fin
                      <input
                        type="datetime-local"
                        required
                        value={localDate(draft.end)}
                        onChange={(e) => change('end', timestamp(e.target.value))}
                      />
                    </label>
                  </div>
                </>
              )}
              <fieldset>
                <legend>Productos con descuento</legend>
                <p>Sin selección, se aplica a todo el catálogo, incluidos los combos.</p>
                <div className="product-picker">
                  {products.map((p) => (
                    <label key={p.id}>
                      <input
                        type="checkbox"
                        checked={draft.productIds.includes(p.id)}
                        onChange={(e) =>
                          change(
                            'productIds',
                            e.target.checked
                              ? [...draft.productIds, p.id]
                              : draft.productIds.filter((id) => id !== p.id),
                          )
                        }
                      />
                      {p.name}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={draft.appearance}
                  onChange={(e) => change('appearance', e.target.checked)}
                />
                Cambiar la apariencia del sitio
              </label>
              {draft.appearance && (
                <>
                  <label>
                    Prioridad visual (0–100)
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={draft.priority}
                      onChange={(e) => change('priority', Number(e.target.value))}
                    />
                    <small>
                      Si coinciden campañas, se muestra la de mayor prioridad. En empate se conserva
                      un orden estable.
                    </small>
                  </label>
                  <label>
                    Anuncio superior
                    <input
                      maxLength={180}
                      value={draft.announcement}
                      onChange={(e) => change('announcement', e.target.value)}
                    />
                  </label>
                  <label>
                    Título del banner
                    <input
                      maxLength={120}
                      value={draft.title}
                      onChange={(e) => change('title', e.target.value)}
                    />
                  </label>
                  <label>
                    Texto del banner
                    <textarea
                      maxLength={300}
                      value={draft.subtitle}
                      onChange={(e) => change('subtitle', e.target.value)}
                    />
                  </label>
                  <label>
                    Texto del botón a la tienda
                    <input
                      required
                      maxLength={40}
                      value={draft.button}
                      onChange={(e) => change('button', e.target.value)}
                    />
                  </label>
                  <div className="merch-fields">
                    {[
                      ['color', 'Color principal'],
                      ['background', 'Fondo'],
                      ['ink', 'Texto'],
                    ].map(([key, label]) => (
                      <label key={key}>
                        {label}
                        <input
                          type="color"
                          value={draft[key]}
                          onChange={(e) => change(key, e.target.value)}
                        />
                      </label>
                    ))}
                  </div>
                  <div
                    className="campaign-preview"
                    style={{
                      background: draft.background,
                      color: draft.ink,
                      borderColor: draft.color,
                    }}
                  >
                    <small>Vista previa · {draft.announcement}</small>
                    <h2>{draft.title}</h2>
                    <p>{draft.subtitle}</p>
                    <span style={{ background: draft.color, color: accentText(draft.color) }}>
                      {draft.button}
                    </span>
                    {draft.image && <img src={draft.image} alt="Vista previa del banner" />}
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              <fieldset>
                <legend>Productos del combo (al menos dos diferentes)</legend>
                <div className="product-picker">
                  {individuals.map((p) => {
                    const selected = draft.components.find((c) => c.id === p.id);
                    return (
                      <div className="combo-choice" key={p.id}>
                        <label>
                          <input
                            type="checkbox"
                            checked={!!selected}
                            onChange={(e) =>
                              change(
                                'components',
                                e.target.checked
                                  ? [...draft.components, { id: p.id, quantity: 1 }]
                                  : draft.components.filter((c) => c.id !== p.id),
                              )
                            }
                          />
                          {p.name} · {money(p.priceCents)}
                        </label>
                        {selected && (
                          <label>
                            Unidades de {p.name}
                            <input
                              aria-label={'Unidades de ' + p.name}
                              type="number"
                              min="1"
                              max="10"
                              required
                              value={selected.quantity}
                              onChange={(e) =>
                                change(
                                  'components',
                                  draft.components.map((c) =>
                                    c.id === p.id ? { ...c, quantity: Number(e.target.value) } : c,
                                  ),
                                )
                              }
                            />
                          </label>
                        )}
                      </div>
                    );
                  })}
                </div>
              </fieldset>
              <p className="combo-total">
                Por separado: {money(base)} · Combo:{' '}
                <strong>{money(Math.round((base * (100 - draft.discount)) / 100))}</strong>
              </p>
              <small>
                El precio y las medidas se actualizan con los productos. Si se oculta un componente,
                el combo deja de estar disponible.
              </small>
            </>
          )}
          {(kind === 'combo' || draft.appearance) && (
            <label>
              Imagen{' '}
              {kind === 'combo'
                ? 'del combo (opcional; usa la primera foto del primer producto)'
                : 'del banner (opcional)'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={busy}
                onChange={(e) => upload(e.target.files?.[0])}
              />
              {draft.image && (
                <>
                  <img className="merch-image" src={draft.image} alt="Imagen seleccionada" />
                  <button type="button" className="text-button" onClick={() => change('image', '')}>
                    Quitar imagen
                  </button>
                </>
              )}
            </label>
          )}
          <div className="merch-actions">
            <button className="button primary" disabled={busy}>
              {busy ? 'Guardando…' : 'Guardar ' + (kind === 'campaign' ? 'campaña' : 'combo')}
            </button>
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() => setDraft(null)}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
