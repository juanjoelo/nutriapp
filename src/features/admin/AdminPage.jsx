import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  LayoutDashboard,
  Package,
  ShoppingBag,
  LogOut,
  ArrowUpRight,
  CreditCard,
  CalendarDays,
} from 'lucide-react';
import { Brand } from '../../components/SiteLayout.jsx';
import { api } from '../../lib/api.js';
import { LoginPanel } from './LoginPanel.jsx';
import { Dashboard } from './Dashboard.jsx';
import { ProductsPanel } from './ProductsPanel.jsx';
import { OrdersPanel } from './OrdersPanel.jsx';
import { MerchandisingPanel } from './MerchandisingPanel.jsx';
import { PaymentsPanel } from './PaymentsPanel.jsx';
import { BookingsPanel } from './BookingsPanel.jsx';
const tabs = [
  { id: 'resumen', label: 'Mi resumen', icon: LayoutDashboard },
  { id: 'pedidos', label: 'Pedidos y envíos', icon: Package },
  { id: 'productos', label: 'Mis productos', icon: ShoppingBag },
  { id: 'ofertas', label: 'Ofertas y ocasiones', icon: ShoppingBag },
  { id: 'pagos', label: 'Pagos', icon: CreditCard },
  { id: 'turnos', label: 'Turnos', icon: CalendarDays },
];
export default function AdminPage() {
  const [user, setUser] = useState(null),
    [loading, setLoading] = useState(true),
    [tab, setTab] = useState(
      () => new URLSearchParams(window.location.search).get('section') || 'resumen',
    ),
    [error, setError] = useState('');
  useEffect(() => {
    api('/auth/session')
      .then(setUser)
      .catch((e) => {
        if (e.status !== 401) setError(e.message);
      })
      .finally(() => setLoading(false));
  }, []);
  async function logout() {
    try {
      await api('/auth/logout', { method: 'POST' });
      setUser(null);
    } catch (e) {
      setError(e.message);
    }
  }
  if (loading) return <div className="page-message">Abriendo tu espacio…</div>;
  if (!user)
    return (
      <>
        <LoginPanel onLogin={setUser} />
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </>
    );
  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <Brand />
        <span className="eyebrow">CENTRO DE COMANDO</span>
        <nav aria-label="Administración">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={tab === id ? 'selected' : ''}
              aria-current={tab === id ? 'page' : undefined}
              onClick={() => setTab(id)}
            >
              <Icon size={19} />
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Link to="/tienda">
            Ver mi tienda <ArrowUpRight size={16} />
          </Link>
          {user.inspection ? (
            <Link to="/">Volver al sitio de prueba</Link>
          ) : (
            <button onClick={logout}>
              <LogOut size={17} /> Cerrar sesión
            </button>
          )}
        </div>
      </aside>
      <div className="admin-main">
        <header className="admin-topbar">
          <span>Tu espacio de gestión</span>
          <span className="owner-badge">
            <span>VA</span>Vanina · Administradora
          </span>
        </header>
        {user.inspection && (
          <div className="setup-notice" role="status">
            <strong>Modo inspección · Datos de prueba</strong>
            <p>
              Podés probar el catálogo, los pedidos y los gráficos. Los emails se simulan, no se
              realizan cobros y los cambios se conservan en este entorno local de inspección.
            </p>
          </div>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {tab === 'resumen' ? (
          <Dashboard onOrders={() => setTab('pedidos')} onProducts={() => setTab('productos')} />
        ) : tab === 'pedidos' ? (
          <OrdersPanel />
        ) : tab === 'ofertas' ? (
          <MerchandisingPanel />
        ) : tab === 'pagos' ? (
          <PaymentsPanel />
        ) : tab === 'turnos' ? (
          <BookingsPanel />
        ) : (
          <ProductsPanel />
        )}
      </div>
    </div>
  );
}
