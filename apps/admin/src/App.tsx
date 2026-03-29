import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { getToken, setToken, getStats } from './api';
import Layout from './components/Layout';
import Login from './pages/Login';
import Overview from './pages/Overview';
import Merchants from './pages/Merchants';
import MerchantDetail from './pages/MerchantDetail';
import Clients from './pages/Clients';
import ClientDetail from './pages/ClientDetail';
import AuditLogs from './pages/AuditLogs';
import Notifications from './pages/Notifications';
import SendNotification from './pages/SendNotification';
import Referrals from './pages/Referrals';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<'loading' | 'ok' | 'unauthorized'>(
    getToken() ? 'loading' : 'unauthorized',
  );

  useEffect(() => {
    if (!getToken()) { setStatus('unauthorized'); return; }
    // Validate token freshness with a lightweight API call
    getStats()
      .then(() => setStatus('ok'))
      .catch(() => { setToken(null); setStatus('unauthorized'); });
  }, []);

  if (status === 'loading') {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: '#888' }}>Chargement…</div>;
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
                  <Route path="/" element={<Overview />} />
                  <Route path="/merchants" element={<Merchants />} />
                  <Route path="/merchants/:id" element={<MerchantDetail />} />
                  <Route path="/clients" element={<Clients />} />
                  <Route path="/clients/:id" element={<ClientDetail />} />
                  <Route path="/notifications" element={<Notifications />} />
                  <Route path="/send-notification" element={<SendNotification />} />
                  <Route path="/audit-logs" element={<AuditLogs />} />
                  <Route path="/referrals" element={<Referrals />} />
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
