import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { C } from '../theme';
import { setToken, getEnv, setEnv, onEnvChange } from '../api';
import type { AdminEnv } from '../api';

const NAV: { to: string; label: string; icon: string }[] = [
  { to: '/', label: 'Vue d\'ensemble', icon: '📊' },
  { to: '/merchants', label: 'Commerçants', icon: '🏪' },
  { to: '/clients', label: 'Clients', icon: '👥' },
  { to: '/notifications', label: 'Notifications', icon: '📩' },
  { to: '/send-notification', label: 'Envoyer Notif.', icon: '📤' },
  { to: '/referrals', label: 'Parrainages', icon: '🤝' },
  { to: '/audit-logs', label: 'Audit Logs', icon: '📋' },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [env, setEnvState] = useState<AdminEnv>(getEnv);

  useEffect(() => onEnvChange(setEnvState), []);

  const handleEnvSwitch = (newEnv: AdminEnv) => {
    if (newEnv === env) return;
    setEnv(newEnv);
    navigate('/login');
  };

  const handleLogout = () => {
    setToken(null);
    navigate('/login');
  };

  const isProd = env === 'prod';

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: C.bg }}>
      {/* Sidebar */}
      <aside
        style={{
          width: sidebarOpen ? 240 : 64,
          background: C.surface,
          borderRight: `1px solid ${C.border}`,
          display: 'flex',
          flexDirection: 'column',
          transition: 'width .2s',
          flexShrink: 0,
        }}
      >
        {/* Logo */}
        <div
          style={{
            padding: '20px 16px',
            borderBottom: `1px solid ${C.border}`,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            cursor: 'pointer',
          }}
          onClick={() => setSidebarOpen((p) => !p)}
        >
          <span style={{ fontSize: 22 }}>⚡</span>
          {sidebarOpen && (
            <span
              style={{
                fontWeight: 800,
                fontSize: 16,
                background: `linear-gradient(90deg, ${C.primary}, ${C.cyan})`,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              JitPlus Admin
            </span>
          )}
        </div>

        {/* Environment switcher */}
        {sidebarOpen ? (
          <div style={{ padding: '12px 8px 0', display: 'flex', gap: 4 }}>
            <button
              onClick={() => handleEnvSwitch('dev')}
              style={{
                flex: 1,
                padding: '6px 0',
                borderRadius: 6,
                border: 'none',
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
                background: !isProd ? C.greenAlpha : 'transparent',
                color: !isProd ? C.green : C.textMuted,
                outline: !isProd ? `1px solid var(--theme-green-alpha)` : `1px solid ${C.border}`,
              }}
            >
              🛠 DEV
            </button>
            <button
              onClick={() => handleEnvSwitch('prod')}
              style={{
                flex: 1,
                padding: '6px 0',
                borderRadius: 6,
                border: 'none',
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
                background: isProd ? C.redAlpha : 'transparent',
                color: isProd ? C.red : C.textMuted,
                outline: isProd ? `1px solid var(--theme-red-alpha)` : `1px solid ${C.border}`,
              }}
            >
              🚀 PROD
            </button>
          </div>
        ) : (
          <div style={{ padding: '10px 0', textAlign: 'center' }}>
            <span
              title={isProd ? 'Production' : 'Développement'}
              style={{
                display: 'inline-block',
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: isProd ? C.red : C.green,
              }}
            />
          </div>
        )}

        {/* Nav links */}
        <nav style={{ flex: 1, padding: '12px 8px' }}>
          {NAV.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 12px',
                borderRadius: 8,
                textDecoration: 'none',
                color: isActive ? C.primaryLight : C.textMuted,
                background: isActive ? C.primaryAlpha : 'transparent',
                fontWeight: isActive ? 600 : 400,
                fontSize: 14,
                marginBottom: 4,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
              })}
            >
              <span style={{ fontSize: 18, flexShrink: 0 }}>{icon}</span>
              {sidebarOpen && label}
            </NavLink>
          ))}
        </nav>

        {/* Logout */}
        <button
          onClick={handleLogout}
          style={{
            margin: '12px 8px',
            padding: '10px 12px',
            background: 'transparent',
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            color: C.textMuted,
            cursor: 'pointer',
            fontSize: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span>🚪</span>
          {sidebarOpen && 'Déconnexion'}
        </button>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, overflow: 'auto', padding: 28 }}>
        {/* Environment banner for production */}
        {isProd && (
          <div
            style={{
              background: C.redAlpha,
              border: `1px solid var(--theme-red-alpha)`,
              borderRadius: 8,
              padding: '8px 16px',
              marginBottom: 20,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 13,
              color: C.red,
              fontWeight: 600,
            }}
          >
            <span>⚠️</span> PRODUCTION — Les actions affectent les vrais utilisateurs
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
