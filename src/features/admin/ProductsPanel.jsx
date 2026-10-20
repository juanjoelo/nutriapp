import { useState, useEffect } from 'react';
import { Plus, Pencil, EyeOff, ImagePlus, X } from 'lucide-react';
import { api, money } from '../../lib/api.js';
const blank = {
  name: '',
  description: '',
  category: '',
  price: '',
  image: '',
  images: [],
  weight: '',
  height: '',
  width: '',
  length: '',
  active: true,
};
export function ProductsPanel() {
  const [products, setProducts] = useState([]),
    [editing, setEditing] = useState(null),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  async function load() {
    setLoading(true);
    try {
      setProducts((await api('/admin/products')).filter((p) => !p.isCombo));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);
  function edit(p) {
    setEditing(p ? { ...p, price: p.priceCents / 100 } : { ...blank });
    setError('');
    setMessage('');
    window.scrollTo(0, 0);
  }
  async function photo(e) {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    if (files.length + editing.images.length > 6) {
      setError('Podés cargar hasta 6 fotos por producto.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      for (const file of files) {
        const form = new FormData();
        form.append('image', file);
        const result = await api('/admin/uploads', { method: 'POST', body: form });
        setEditing((p) => ({
          ...p,
          image: p.image || result.image,
          images: [...p.images, result.image],
        }));
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (!editing.image) throw new Error('Cargá al menos una foto del producto.');
      const body = {
        name: editing.name,
        description: editing.description,
        category: editing.category,
        image: editing.image,
        images: editing.images,
        priceCents: Math.round(Number(editing.price) * 100),
        active: editing.active,
        ...Object.fromEntries(
          ['weight', 'height', 'width', 'length'].map((k) => [k, Number(editing[k])]),
        ),
      };
      await api('/admin/products' + (editing.id ? '/' + editing.id : ''), {
        method: editing.id ? 'PUT' : 'POST',
        body,
      });
      setEditing(null);
      setMessage('Producto guardado. Los cambios ya están en la tienda.');
      await load();
    } catch (e) {
      setError(
        e.fields?.length
          ? e.message + ' ' + e.fields.map((f) => f.field + ': ' + f.message).join(' · ')
          : e.message,
      );
    } finally {
      setBusy(false);
    }
  }
  async function hide(p) {
    if (
      !window.confirm(
        '¿Quitar “' +
          p.name +
          '” de la tienda? Se conservará en tu panel para poder volver a publicarlo.',
      )
    )
      return;
    setBusy(true);
    setError('');
    try {
      await api('/admin/products/' + p.id, { method: 'DELETE' });
      setMessage('Producto quitado de la tienda.');
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const field = (name, value) => setEditing((p) => ({ ...p, [name]: value }));
  return (
    <div className="admin-content">
      <div className="admin-page-heading">
        <div>
          <span className="eyebrow">TU CATÁLOGO</span>
          <h1>Elegidos por vos.</h1>
          <p>Cargá, editá o quitá productos cuando quieras.</p>
        </div>
        <button className="button primary" onClick={() => edit(null)} disabled={busy}>
          <Plus size={17} /> Nuevo producto
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="success" role="status">
          {message}
        </p>
      )}
      {editing && (
        <form className="panel product-editor" onSubmit={save}>
          <div className="panel-heading">
            <h2>{editing.id ? 'Editar producto' : 'Un nuevo producto'}</h2>
            <button
              type="button"
              className="icon-button"
              aria-label="Cerrar edición"
              onClick={() => setEditing(null)}
              disabled={busy}
            >
              <X />
            </button>
          </div>
          <div className="editor-grid">
            <div>
              <label className="photo-upload">
                {editing.image ? (
                  <img src={editing.image} alt="Foto del producto" />
                ) : (
                  <ImagePlus size={42} strokeWidth={1} />
                )}
                <span>{busy ? 'Procesando…' : 'Agregar fotos del producto'}</span>
                <input
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp"
                  onChange={photo}
                  disabled={busy || editing.images.length >= 6}
                />
              </label>
              <p className="muted">
                Hasta 6 fotos · JPG, PNG o WebP · 5 MB cada una. La primera es la portada.
              </p>
              <div className="editor-thumbnails">
                {editing.images.map((image, index) => (
                  <div key={image}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        const images = [image, ...editing.images.filter((i) => i !== image)];
                        setEditing((p) => ({ ...p, image, images }));
                      }}
                      aria-label={'Usar foto ' + (index + 1) + ' como portada'}
                    >
                      <img src={image} alt={'Foto ' + (index + 1)} />
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      className="text-button"
                      onClick={() => {
                        const images = editing.images.filter((i) => i !== image);
                        setEditing((p) => ({ ...p, images, image: images[0] || '' }));
                      }}
                      aria-label={'Quitar foto ' + (index + 1)}
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div className="form-grid">
              <label className="full">
                Nombre
                <input
                  value={editing.name}
                  onChange={(e) => field('name', e.target.value)}
                  minLength="2"
                  maxLength="120"
                  required
                />
              </label>
              <label className="full">
                Descripción
                <textarea
                  value={editing.description}
                  onChange={(e) => field('description', e.target.value)}
                  minLength="5"
                  maxLength="4000"
                  rows="4"
                  required
                />
              </label>
              <label>
                Precio en pesos
                <input
                  type="number"
                  value={editing.price}
                  onChange={(e) => field('price', e.target.value)}
                  min="1"
                  max="1000000"
                  step="0.01"
                  required
                />
              </label>
              <label>
                Categoría
                <input
                  value={editing.category}
                  onChange={(e) => field('category', e.target.value)}
                  minLength="2"
                  maxLength="60"
                  placeholder="Ej.: Almacén natural"
                  required
                />
              </label>
              <fieldset className="full parcel-fields">
                <legend>Para calcular el envío</legend>
                <p className="muted">
                  Medí una unidad con su envase y protección, en centímetros. En un frasco
                  cilíndrico, ancho y largo son su diámetro. Pesá también el envase y la protección,
                  no solo el contenido. Estos datos sirven para calcular el envío; el sistema agrega
                  el embalaje exterior del pedido.
                </p>
                <div className="form-grid">
                  {[
                    ['weight', 'Peso (gramos)', 25000],
                    ['height', 'Alto (cm)', 150],
                    ['width', 'Ancho (cm)', 150],
                    ['length', 'Largo (cm)', 150],
                  ].map(([key, label, max]) => (
                    <label key={key}>
                      {label}
                      <input
                        type="number"
                        value={editing[key]}
                        onChange={(e) => field(key, e.target.value)}
                        min="1"
                        max={max}
                        step="1"
                        required
                      />
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="checkbox-label full">
                <input
                  type="checkbox"
                  checked={editing.active}
                  onChange={(e) => field('active', e.target.checked)}
                />{' '}
                Visible en la tienda
              </label>
            </div>
          </div>
          <div className="editor-actions">
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() => setEditing(null)}
            >
              Cancelar
            </button>
            <button className="button primary" disabled={busy}>
              {busy ? 'Guardando…' : 'Guardar producto'}
            </button>
          </div>
        </form>
      )}
      {loading ? (
        <p>Cargando catálogo…</p>
      ) : (
        <div className="admin-product-grid">
          {products.map((p) => (
            <article className="panel admin-product" key={p.id}>
              <img src={p.image} alt={p.name} />
              <div>
                <span className={'status-tag ' + (p.active ? 'paid' : '')}>
                  {p.active ? 'Publicado' : 'Oculto'}
                </span>
                <h2>{p.name}</h2>
                <p>
                  {money(p.priceCents)} · {p.category}
                </p>
                <div className="row-actions">
                  <button className="text-button" onClick={() => edit(p)} disabled={busy}>
                    <Pencil size={15} /> Editar
                  </button>
                  {p.active && (
                    <button className="text-button" onClick={() => hide(p)} disabled={busy}>
                      <EyeOff size={15} /> Quitar de la tienda
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))}
          {!products.length && !editing && (
            <div className="panel empty-state">
              <ImagePlus size={40} />
              <h2>Tu catálogo está por comenzar.</h2>
              <p>Solo necesitás una foto, una descripción, el precio y los datos del paquete.</p>
              <button className="button primary" onClick={() => edit(null)}>
                Cargar mi primer producto
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
