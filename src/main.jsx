import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import './styles/base.css';
import './styles/site.css';
import './styles/shop.css';
import './styles/admin.css';
import './styles/merchandising.css';
import './styles/bookings.css';
import './styles/payments.css';
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
