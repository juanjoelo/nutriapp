import { useEffect, useState } from 'react';
import { History, RotateCcw, Search } from 'lucide-react';
import { api } from '../../lib/api.js';
const events = {
  created: 'Creación',
  updated: 'Edición',
  deleted: 'Eliminación de la lista',
  existing: 'Registro inicial',
};
const formatDate = (time) =>
  new Date(time).toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
export function MerchandisingHistory({ onReuse, products }) {
  const [kind, setKind] = useState('all'),
    [search, setSearch] = useState(''),
    [query, setQuery] = useState(''),
    [page, setPage] = useState(1),
    [data, setData] = useState(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [revision, setRevision] = useState(0),
    [removing, setRemoving] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    api('/admin/merchandising/history?' + new URLSearchParams({ kind, search: query, page }), {
      signal: controller.signal,
    })
      .then((result) => {
        if (!controller.signal.aborted) {
          if (page > Math.max(1, result.pages)) setPage(Math.max(1, result.pages));
          else setData(result);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [kind, query, page, revision]);
  async function remove(id) {
    setRemoving(true);
    setError('');
    try {
      await api('/admin/merchandising/history/' + id, { method: 'DELETE' });
      setRevision((v) => v + 1);
    } catch (e) {
      setError(e.message);
    } finally {
      setRemoving(false);
    }
  }
  const productName = (id) =>
    products.find((p) => p.id === id)?.name || 'Producto no disponible (' + id.slice(0, 8) + ')';
  return (
    <section className="campaign-history" aria-label="Historial de campañas y combos">
      <div className="panel history-intro">
        <History size={24} />
        <div>
          <h2>Tus ideas quedan guardadas.</h2>
          <p>
            Cada guardado conserva una versión de la configuración. Reutilizala como una copia y
            revisá sus fechas y productos antes de activarla.
          </p>
          <small>
            Las configuraciones que ya existían aparecen como “Registro inicial”; los cambios
            anteriores a esta función no se pueden reconstruir.
          </small>
        </div>
      </div>
      <div className="history-tools">
        <label>
          Tipo de configuración
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">Campañas y combos</option>
            <option value="campaign">Campañas</option>
            <option value="combo">Combos</option>
          </select>
        </label>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(search);
            setPage(1);
          }}
        >
          <label>
            Buscar en el historial
            <input
              value={search}
              maxLength={100}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nombre de campaña o combo"
            />
          </label>
          <button className="button secondary">
            <Search size={17} />
            Buscar
          </button>
        </form>
        <button
          className="text-button"
          disabled={loading}
          onClick={() => setRevision((v) => v + 1)}
        >
          <RotateCcw size={16} />
          Actualizar historial
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">Cargando historial…</p>
      ) : !data?.entries.length ? (
        <div className="empty-state compact">
          <History />
          <h3>
            {query
              ? 'No encontramos coincidencias.'
              : 'Tu historial empieza con el próximo guardado.'}
          </h3>
          <p>Las campañas y los combos conservarán acá su configuración.</p>
        </div>
      ) : (
        <>
          <p className="muted">{data.total} versiones guardadas · Horario de Argentina</p>
          <div className="history-list">
            {data.entries.map((entry) => {
              const c = entry.data;
              return (
                <article className="panel history-card" key={entry.id}>
                  <div className="history-card-heading">
                    <div>
                      <span className="eyebrow">
                        {entry.kind === 'campaign' ? 'CAMPAÑA' : 'COMBO'} · {events[entry.event]}
                      </span>
                      <h3>{c.name}</h3>
                      <time dateTime={new Date(entry.created).toISOString()}>
                        {formatDate(entry.created)}
                      </time>
                    </div>
                    <span className="offer-badge">{c.discount}% de descuento</span>
                  </div>
                  <details>
                    <summary>Ver configuración guardada</summary>
                    <div className="history-config">
                      {c.image && <img src={c.image} alt={'Imagen de ' + c.name} loading="lazy" />}
                      <dl>
                        <dt>Estado al guardar</dt>
                        <dd>
                          {entry.kind === 'campaign'
                            ? c.enabled
                              ? 'Habilitada'
                              : 'Desactivada'
                            : c.active
                              ? 'Visible'
                              : 'Oculto'}
                        </dd>
                        {entry.kind === 'campaign' ? (
                          <>
                            <dt>Programación</dt>
                            <dd>
                              {c.scheduled
                                ? formatDate(c.start) + ' → ' + formatDate(c.end)
                                : 'Activación manual'}
                            </dd>
                            <dt>Alcance</dt>
                            <dd>
                              {c.productIds.length
                                ? c.productIds.map(productName).join(', ')
                                : 'Todo el catálogo'}
                            </dd>
                            <dt>Apariencia</dt>
                            <dd>{c.appearance ? 'Personalizada' : 'Sin cambios visuales'}</dd>
                            <dt>Anuncio</dt>
                            <dd>{c.announcement || '—'}</dd>
                            <dt>Título</dt>
                            <dd>{c.title || '—'}</dd>
                            <dt>Descripción</dt>
                            <dd>{c.subtitle || '—'}</dd>
                            <dt>Botón</dt>
                            <dd>{c.button}</dd>
                            <dt>Colores</dt>
                            <dd className="history-colors">
                              {[c.color, c.background, c.ink].map((color, i) => (
                                <span key={i}>
                                  <i style={{ background: color }} />
                                  {color}
                                </span>
                              ))}
                            </dd>
                            <dt>Prioridad visual</dt>
                            <dd>{c.priority}</dd>
                          </>
                        ) : (
                          <>
                            <dt>Descripción</dt>
                            <dd>{c.description}</dd>
                            <dt>Productos y cantidades</dt>
                            <dd>
                              <ul>
                                {c.components.map((p) => (
                                  <li key={p.id}>
                                    {p.quantity} × {productName(p.id)}
                                  </li>
                                ))}
                              </ul>
                            </dd>
                          </>
                        )}
                      </dl>
                      {entry.kind === 'combo' && (
                        <p className="muted">
                          Al reutilizar se calculan los precios y las medidas con el catálogo
                          actual.
                        </p>
                      )}
                    </div>
                  </details>
                  <div className="history-actions">
                    <button className="button secondary" onClick={() => onReuse(entry.kind, c)}>
                      Reutilizar configuración
                    </button>
                    <details>
                      <summary>Eliminar esta versión</summary>
                      <p>
                        Se borra esta versión del historial. La campaña o el combo actual y las
                        ventas se conservan.
                      </p>
                      <button
                        className="text-button"
                        disabled={removing}
                        onClick={() => remove(entry.id)}
                      >
                        Confirmar borrado de versión
                      </button>
                    </details>
                  </div>
                </article>
              );
            })}
          </div>
          <div className="pagination">
            <button
              className="text-button"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Anterior
            </button>
            <span>
              Página {data.page} de {data.pages}
            </span>
            <button
              className="text-button"
              disabled={page >= data.pages}
              onClick={() => setPage((p) => p + 1)}
            >
              Siguiente
            </button>
          </div>
        </>
      )}
    </section>
  );
}
