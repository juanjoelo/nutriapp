import { useState } from 'react';
import { money, date } from '../../lib/api.js';
// Related greens and yellows keep the graph within the brand palette.
const colors = [
  '#006b49',
  '#efb544',
  '#72ad8e',
  '#b88927',
  '#174b39',
  '#f5d88f',
  '#459574',
  '#a8cfb5',
];
export function SalesExplorer({ rows }) {
  const [view, setView] = useState('pie'),
    [metric, setMetric] = useState('units'),
    [selected, setSelected] = useState(null);
  const sorted = [...rows].sort((a, b) => b[metric] - a[metric]);
  const total = rows.reduce((n, p) => n + p[metric], 0),
    max = Math.max(1, ...rows.map((p) => p[metric]));
  const slices = sorted.filter((p) => p[metric] > 0);
  const display = slices.slice(0, 7);
  if (slices.length > 7)
    display.push({
      id: 'others',
      name: 'Otros productos',
      [metric]: slices.slice(7).reduce((n, p) => n + p[metric], 0),
    });
  const chosen = rows.find((p) => p.id === selected),
    format = (n) => (metric === 'units' ? n + ' unidades' : money(n));
  let offset = 0;
  const gradient = display
    .map((p, i) => {
      const start = offset;
      offset += (p[metric] / total) * 100;
      return colors[i] + ' ' + start + '% ' + offset + '%';
    })
    .join(',');
  return (
    <div className="sales-explorer">
      <div className="explorer-tools">
        <div className="merch-tabs">
          <button
            className="button secondary"
            aria-pressed={view === 'pie'}
            onClick={() => setView('pie')}
          >
            Torta
          </button>
          <button
            className="button secondary"
            aria-pressed={view === 'bars'}
            onClick={() => setView('bars')}
          >
            Barras
          </button>
        </div>
        <label>
          Medir por
          <select value={metric} onChange={(e) => setMetric(e.target.value)}>
            <option value="units">Unidades</option>
            <option value="revenueCents">Ingresos por productos</option>
          </select>
        </label>
      </div>
      {!total ? (
        <p className="empty-state compact">Todavía no hay ventas confirmadas en este período.</p>
      ) : view === 'pie' ? (
        <div className="pie-layout">
          <div
            className="pie-chart"
            role="img"
            aria-label={
              'Participación: ' +
              display
                .map((p) => p.name + ' ' + ((p[metric] / total) * 100).toFixed(1) + '%')
                .join(', ')
            }
            style={{ background: 'conic-gradient(' + gradient + ')' }}
          >
            <div>
              <strong>{metric === 'units' ? total : money(total)}</strong>
              <span>{metric === 'units' ? 'unidades vendidas' : 'ventas de productos'}</span>
            </div>
          </div>
          <div className="pie-legend">
            {display.map((p, i) => (
              <button key={p.id} onClick={() => setSelected(p.id)} aria-pressed={selected === p.id}>
                <i style={{ background: colors[i] }} />
                <span>
                  {p.name}
                  <small>{format(p[metric])}</small>
                </span>
                <strong>{((p[metric] / total) * 100).toFixed(1)}%</strong>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div
          className="sales-chart"
          role="group"
          aria-label={metric === 'units' ? 'Unidades por producto' : 'Ingresos por producto'}
        >
          {rows.slice(0, 10).map((p) => (
            <button className="chart-row" key={p.id} onClick={() => setSelected(p.id)}>
              <span>{p.name}</span>
              <span className="bar-track">
                <span
                  className="bar-fill"
                  style={{ display: 'block', width: (p[metric] / max) * 100 + '%' }}
                />
              </span>
              <strong>{metric === 'units' ? p.units : money(p.revenueCents)}</strong>
            </button>
          ))}
        </div>
      )}
      <p className="muted">
        Elegí un producto para inspeccionar sus ventas. La torta agrupa en “Otros” a partir del
        octavo; las barras muestran hasta diez.
      </p>
      {selected === 'others' && (
        <div className="panel">
          <h3>Otros productos</h3>
          {slices.slice(7).map((p) => (
            <button className="text-button" key={p.id} onClick={() => setSelected(p.id)}>
              {p.name} · {format(p[metric])}
            </button>
          ))}
        </div>
      )}
      {chosen && (
        <section className="sales-detail panel" aria-label={'Detalle de ' + chosen.name}>
          <div className="panel-heading">
            <div>
              <span className="eyebrow">DETALLE DEL PRODUCTO</span>
              <h3>{chosen.name}</h3>
            </div>
            <button className="text-button" onClick={() => setSelected(null)}>
              Cerrar detalle
            </button>
          </div>
          <p>
            <strong>{chosen.units}</strong> unidades · <strong>{money(chosen.revenueCents)}</strong>{' '}
            · {chosen.sales?.length || 0} pedidos ·{' '}
            {total ? ((chosen[metric] / total) * 100).toFixed(1) : 0}% del total seleccionado
          </p>
          {chosen.sales?.length ? (
            <div className="table-scroll">
              <table className="responsive-table" role="table">
                <thead role="rowgroup">
                  <tr role="row">
                    <th scope="col" role="columnheader">
                      Fecha
                    </th>
                    <th scope="col" role="columnheader">
                      Pedido
                    </th>
                    <th scope="col" role="columnheader">
                      Unidades
                    </th>
                    <th scope="col" role="columnheader">
                      Importe
                    </th>
                  </tr>
                </thead>
                <tbody role="rowgroup">
                  {[...chosen.sales]
                    .sort((a, b) => b.created - a.created)
                    .map((s) => (
                      <tr role="row" key={s.orderId}>
                        <td role="cell" data-label="Fecha">
                          {date(s.created)}
                        </td>
                        <td role="cell" data-label="Pedido">
                          <code title={s.orderId}>{s.orderId.slice(0, 8)}</code>
                        </td>
                        <td role="cell" data-label="Unidades">
                          {s.units}
                        </td>
                        <td role="cell" data-label="Importe">
                          {money(s.revenueCents)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>No registró ventas en este período.</p>
          )}
        </section>
      )}
      <div className="table-scroll">
        <table className="responsive-table" role="table">
          <thead role="rowgroup">
            <tr role="row">
              <th scope="col" role="columnheader">
                Producto
              </th>
              <th scope="col" role="columnheader">
                Unidades
              </th>
              <th scope="col" role="columnheader">
                Ingresos
              </th>
              <th scope="col" role="columnheader">
                Detalle
              </th>
            </tr>
          </thead>
          <tbody role="rowgroup">
            {rows.map((p) => (
              <tr role="row" key={p.id}>
                <td role="cell" data-label="Producto">
                  {p.name}
                  {!p.active && <small> · Oculto</small>}
                </td>
                <td role="cell" data-label="Unidades">
                  {p.units}
                </td>
                <td role="cell" data-label="Ingresos">
                  {money(p.revenueCents)}
                </td>
                <td role="cell" data-label="Detalle">
                  <button
                    className="text-button"
                    onClick={() => setSelected(p.id)}
                    aria-label={'Inspeccionar ' + p.name}
                  >
                    Inspeccionar →
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="chart-note">
        Los combos se cuentan como una unidad vendida por combo, sin duplicar sus componentes.
        Ingresos después de descuentos, sin envíos ni deducción de comisiones.
      </p>
    </div>
  );
}
