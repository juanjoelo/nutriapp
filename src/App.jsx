import { lazy, Suspense } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { CartProvider } from './features/shop/CartContext.jsx';
import { SiteLayout } from './components/SiteLayout.jsx';
import { HomePage } from './pages/HomePage.jsx';
import { ShopPage } from './features/shop/ShopPage.jsx';
import { ProductPage } from './features/shop/ProductPage.jsx';
import { CartPage } from './features/shop/CartPage.jsx';
import { OrderPage } from './features/shop/OrderPage.jsx';
import { BookingPage, ManageBookingPage } from './features/bookings/BookingPage.jsx';
import { ConsultationPaymentReturn } from './features/bookings/ConsultationPayment.jsx';
const AdminPage = lazy(() => import('./features/admin/AdminPage.jsx'));
const ResetPage = lazy(() => import('./features/admin/ResetPage.jsx'));
export default function App() {
  const location = useLocation();
  useEffect(() => {
    if (location.hash) {
      const target = document.getElementById(location.hash.slice(1));
      target?.scrollIntoView();
    } else window.scrollTo(0, 0);
  }, [location.pathname, location.hash]);
  return (
    <CartProvider>
      <Suspense fallback={<div className="page-message">Cargando tu espacio…</div>}>
        <Routes>
          <Route element={<SiteLayout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/tienda" element={<ShopPage />} />
            <Route path="/tienda/:id" element={<ProductPage />} />
            <Route path="/carrito" element={<CartPage />} />
            <Route path="/turnos" element={<BookingPage />} />
            <Route path="/turnos/mi-reserva" element={<ManageBookingPage />} />
            <Route path="/turnos/pago" element={<ConsultationPaymentReturn />} />
            <Route path="/turnos/pago-prueba" element={<ConsultationPaymentReturn inspection />} />
            <Route path="/compra/:id" element={<OrderPage />} />
            <Route
              path="*"
              element={
                <div className="page-message">
                  <h1>Este camino no existe.</h1>
                  <a href="/">Volver al inicio</a>
                </div>
              }
            />
          </Route>
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/admin/recuperar" element={<ResetPage />} />
        </Routes>
      </Suspense>
    </CartProvider>
  );
}
