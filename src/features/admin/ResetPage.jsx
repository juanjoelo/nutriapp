import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { Brand } from '../../components/SiteLayout.jsx';
export default function ResetPage() {
  const [token] = useState(() => window.location.hash.slice(1));
  const [message, setMessage] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const data = new FormData(e.currentTarget);
    try {
      if (data.get('password') !== data.get('confirm'))
        throw new Error('Las contraseñas no coinciden.');
      const result = await api('/auth/reset', {
        method: 'POST',
        body: { token, password: data.get('password') },
      });
      window.history.replaceState(null, '', '/admin/recuperar');
      setMessage(result.message);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-page">
      <Brand />
      <div className="login-card">
        <h1>Tu nueva contraseña.</h1>
        {message ? (
          <p className="success">{message}</p>
        ) : (
          <form onSubmit={submit}>
            <p>Elegí una contraseña de al menos 12 caracteres.</p>
            <label>
              Contraseña
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                minLength="12"
                maxLength="128"
                required
              />
            </label>
            <label>
              Repetir contraseña
              <input
                name="confirm"
                type="password"
                autoComplete="new-password"
                minLength="12"
                maxLength="128"
                required
              />
            </label>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button className="button primary full-width" disabled={busy}>
              {busy ? 'Guardando…' : 'Guardar contraseña'}
            </button>
          </form>
        )}
        <Link to="/admin">Ir al centro de comando →</Link>
      </div>
    </div>
  );
}
