import { useState } from 'react';
import { Link } from 'react-router-dom';
import { LockKeyhole, ArrowRight } from 'lucide-react';
import { Brand } from '../../components/SiteLayout.jsx';
import { api } from '../../lib/api.js';
export function LoginPanel({ onLogin }) {
  const [forgot, setForgot] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    const body = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const result = await api('/auth/' + (forgot ? 'forgot' : 'login'), { method: 'POST', body });
      if (forgot) setMessage(result.message);
      else onLogin(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-page">
      <div className="login-brand">
        <Brand />
      </div>
      <div className="login-card">
        <span className="lock-mark">
          <LockKeyhole size={26} />
        </span>
        <span className="eyebrow">UN ESPACIO SOLO TUYO</span>
        <h1>{forgot ? 'Recuperá tu acceso.' : 'Hola, Vanina.'}</h1>
        <p>
          {forgot
            ? 'Te enviaremos un enlace a tu email autorizado.'
            : 'Tu tienda, tus pedidos y todo lo que está creciendo.'}
        </p>
        <form onSubmit={submit}>
          <label>
            Tu email
            <input autoComplete="username" name="email" type="email" required maxLength="200" />
          </label>
          {!forgot && (
            <label>
              Contraseña
              <input
                autoComplete="current-password"
                name="password"
                type="password"
                required
                minLength="12"
                maxLength="128"
              />
            </label>
          )}
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
          <button className="button primary full-width" disabled={busy}>
            {busy ? 'Un momento…' : forgot ? 'Enviar enlace' : 'Entrar a mi centro de comando'}{' '}
            <ArrowRight size={17} />
          </button>
        </form>
        <button
          className="text-button"
          onClick={() => {
            setForgot(!forgot);
            setError('');
            setMessage('');
          }}
        >
          {forgot ? 'Ya tengo contraseña' : 'Crear o recuperar mi contraseña'}
        </button>
        <Link className="muted" to="/">
          ← Volver al sitio
        </Link>
      </div>
      <p className="login-foot">Acceso exclusivo de la dueña de la tienda.</p>
    </div>
  );
}
