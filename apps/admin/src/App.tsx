import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { getToken, setToken, getStats } from './api';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Analytics from './pages/Analytics';
import FollowUps from './pages/FollowUps';
import Revenue from './pages/Revenue';
import Merchants from './pages/Merchants';
import MerchantDetail from './pages/MerchantDetail';
import Clients from './pages/Clients';
import ClientDetail from './pages/ClientDetail';
import AuditLogs from './pages/AuditLogs';
import Notifications from './pages/Notifications';
import SendNotification from './pages/SendNotification';
import MerchantNews from './pages/MerchantNews';
import Referrals from './pages/Referrals';
import Deals from './pages/Deals';

// Cache token validation for 1 minute to avoid re-validating on every route change
let _authValidUntil = 0;

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<'loading' | 'ok' | 'unauthorized'>(() => {
    if (!getToken()) return 'unauthorized';
    // If recently validated, skip the API call
    if (Date.now() < _authValidUntil) return 'ok';
    return 'loading';
  });

  useEffect(() => {
    if (!getToken()) { setStatus('unauthorized'); return; }
    // Skip validation if still within the cached window
    if (Date.now() < _authValidUntil) { setStatus('ok'); return; }
    // Validate token freshness with a lightweight API call
    getStats()
      .then(() => { _authValidUntil = Date.now() + 5 * 60 * 1000; setStatus('ok'); })
      .catch(() => { _authValidUntil = 0; setToken(null); setStatus('unauthorized'); });
  }, []);

  if (status === 'loading') {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: 'var(--theme-text-muted)' }}>Chargement…</div>;
  }
  return status === 'ok' ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/*"
          element={
            <PrivateRoute>
              <Layout>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/follow-ups" element={<FollowUps />} />
                  <Route path="/revenue" element={<Revenue />} />
                  <Route path="/analytics" element={<Analytics />} />
                  <Route path="/merchants" element={<Merchants />} />
                  <Route path="/merchants/:id" element={<MerchantDetail />} />
                  <Route path="/clients" element={<Clients />} />
                  <Route path="/clients/:id" element={<ClientDetail />} />
                  <Route path="/notifications" element={<Notifications />} />
                  <Route path="/send-notification" element={<SendNotification />} />
                  <Route path="/merchant-news" element={<MerchantNews />} />
                  <Route path="/audit-logs" element={<AuditLogs />} />
                  <Route path="/referrals" element={<Referrals />} />
                  <Route path="/deals" element={<Deals />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Layout>
            </PrivateRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
