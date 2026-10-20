import { useState, useEffect } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { ShoppingBag, Menu, X, Instagram, ArrowUpRight } from 'lucide-react';
import { useCart } from '../features/shop/CartContext.jsx';
import { api } from '../lib/api.js';
import { CampaignBanner } from './CampaignBanner.jsx';
import { accentText } from '../lib/colors.js';
export function Brand() {
  return (
    <Link to="/" className="brand" aria-label="Vanina Alaniz, inicio">
      <img className="brand-logo" src="/LOGO-VANI.ico" alt="" width="256" height="253" />
      <span>
        vanina alaniz<small>NUTRICIÓN INTEGRAL</small>
      </span>
    </Link>
  );
}
export function SiteLayout() {
  const [open, setOpen] = useState(false);
  const { count } = useCart();
  const [campaign, setCampaign] = useState(null);
  const location = useLocation();
  useEffect(() => {
    let alive = true;
    let timer;
    const refresh = (notify = false) =>
      api('/storefront')
        .then((d) => {
          if (!alive) return;
          setCampaign(d.campaign);
          clearTimeout(timer);
          // One scheduled boundary, not recurring status polling.
          if (d.nextChange)
            timer = setTimeout(
              () => refresh(true),
              Math.min(2147483647, Math.max(100, d.nextChange - Date.now() + 100)),
            );
          if (notify) window.dispatchEvent(new Event('storefront:refresh'));
        })
        .catch(() => {});
    refresh();
    const focus = () => {
      if (document.visibilityState === 'visible') refresh(true);
    };
    document.addEventListener('visibilitychange', focus);
    return () => {
      alive = false;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', focus);
    };
  }, [location.pathname]);
  useEffect(() => {
    if (!campaign) return;
    const root = document.documentElement;
    const values = {
      '--forest': campaign.color,
      '--cream': campaign.background,
      '--ink': campaign.ink,
      '--olive': campaign.color,
      '--muted': campaign.ink,
      '--on-accent': accentText(campaign.color),
    };
    root.dataset.campaign = 'active';
    for (const [key, value] of Object.entries(values)) root.style.setProperty(key, value);
    return () => {
      delete root.dataset.campaign;
      Object.keys(values).forEach((key) => root.style.removeProperty(key));
    };
  }, [campaign]);
  return (
    <>
      <a className="skip-link" href="#contenido">
        Ir al contenido
      </a>
      <div className="announcement">
        {campaign?.announcement || 'Un espacio para nutrirte, conectar y volver a vos'}{' '}
        <span>✦</span>
      </div>
      <header className="site-header">
        <div className="shell header-inner">
          <Brand />
          <nav aria-label="Navegación principal" className={open ? 'site-nav open' : 'site-nav'}>
            <Link onClick={() => setOpen(false)} to="/#enfoque">
              Mi enfoque
            </Link>
            <Link onClick={() => setOpen(false)} to="/#sobre-mi">
              Sobre mí
            </Link>
            <NavLink onClick={() => setOpen(false)} to="/tienda">
              Tienda
            </NavLink>
            <NavLink onClick={() => setOpen(false)} to="/turnos">
              Turnos
            </NavLink>
            <Link onClick={() => setOpen(false)} to="/#contacto">
              Conversemos <ArrowUpRight size={15} />
            </Link>
          </nav>
          <div className="header-actions">
            <Link
              className="bag-link"
              data-cart-target
              to="/carrito"
              aria-label={'Carrito, ' + count + ' productos'}
            >
              <ShoppingBag size={21} />
              <span>{count}</span>
            </Link>
            <button
              className="icon-button menu-button"
              aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
              aria-expanded={open}
              onClick={() => setOpen(!open)}
            >
              {open ? <X /> : <Menu />}
            </button>
          </div>
        </div>
      </header>
      <main id="contenido">
        {location.pathname === '/' && <CampaignBanner campaign={campaign} />}
        <Outlet context={{ campaign }} />
      </main>
      <footer id="contacto" className="site-footer">
        <div className="shell footer-main">
          <div>
            <Brand />
            <p>
              Alimentar el cuerpo.
              <br />
              Cultivar el bienestar.
            </p>
          </div>
          <div>
            <span className="eyebrow">SIGAMOS EN CONTACTO</span>
            <a
              href="https://www.instagram.com/nutri.vanina.alaniz/"
              target="_blank"
              rel="noreferrer"
            >
              <Instagram size={17} /> Instagram <ArrowUpRight size={15} />
            </a>
            <a href="https://wa.me/5492664588310" target="_blank" rel="noreferrer">
              Conversar por WhatsApp <ArrowUpRight size={15} />
            </a>
          </div>
          <div>
            <span className="eyebrow">EXPLORÁ EL ESPACIO</span>
            <Link to="/#sobre-mi">Conocé a Vanina</Link>
            <Link to="/tienda">Nuestra tienda</Link>
            <Link to="/turnos">Reservá tu consulta</Link>
          </div>
        </div>
        <div className="shell footer-bottom">
          <span>© {new Date().getFullYear()} Vanina Alaniz</span>
          <span>Hecho con calma y propósito.</span>
        </div>
      </footer>
    </>
  );
}
