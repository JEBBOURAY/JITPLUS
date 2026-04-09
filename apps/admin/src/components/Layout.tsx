import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { C } from '../theme';
import { setToken, getEnv, setEnv, onEnvChange } from '../api';
import type { AdminEnv } from '../api';

// ── SVG Icons (20x20 stroke icons) ──────────────────────────────────────────
const Icon = ({ d, size = 20 }: { d: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const Icons = {
  overview: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0v-6a1 1 0 011-1h2a1 1 0 011 1v6m-6 0h6',
  merchants: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
  clients: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zm10 10v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
  notifications: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9',
  send: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
  referrals: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z',
  audit: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01',
  logout: 'M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1',
  menu: 'M4 6h16M4 12h16M4 18h16',
  chevronLeft: 'M15 19l-7-7 7-7',
};

const NAV: { to: string; label: string; icon: keyof typeof Icons }[] = [
  { to: '/', label: 'Vue d\'ensemble', icon: 'overview' },
  { to: '/merchants', label: 'Commercants', icon: 'merchants' },
  { to: '/clients', label: 'Clients', icon: 'clients' },
  { to: '/notifications', label: 'Notifications', icon: 'notifications' },
  { to: '/send-notification', label: 'Envoyer', icon: 'send' },
  { to: '/referrals', label: 'Parrainages', icon: 'referrals' },
  { to: '/audit-logs', label: 'Journal', icon: 'audit' },
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
          width: sidebarOpen ? 252 : 68,
          background: C.surface,
          borderRight: `1px solid ${C.border}`,
          display: 'flex',
          flexDirection: 'column',
          transition: 'width .2s ease',
          flexShrink: 0,
          position: 'relative',
        }}
      >
        {/* Logo */}
        <div
          style={{
            padding: sidebarOpen ? '24px 20px' : '24px 16px',
            borderBottom: `1px solid ${C.border}`,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            minHeight: 72,
          }}
        >
          <div style={{
            width: 34,
            height: 34,
            borderRadius: 'var(--radius-md)',
            background: `linear-gradient(135deg, ${C.primary}, ${C.cyan})`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
          </div>
          {sidebarOpen && (
            <span style={{ fontWeight: 700, fontSize: 16, color: C.text, letterSpacing: '-0.02em' }}>
              JitPlus
            </span>
          )}
        </div>

        {/* Collapse toggle */}
        <button
          onClick={() => setSidebarOpen((p) => !p)}
          style={{
            position: 'absolute',
            top: 80,
            right: -12,
            width: 24,
            height: 24,
            borderRadius: '50%',
            background: C.surface,
            border: `1px solid ${C.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            zIndex: 10,
            boxShadow: 'var(--shadow-sm)',
            color: C.textMuted,
            padding: 0,
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: sidebarOpen ? 'none' : 'rotate(180deg)', transition: 'transform .2s' }}>
            <path d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        {/* Environment switcher */}
        <div style={{ padding: sidebarOpen ? '16px 12px 0' : '16px 8px 0' }}>
          {sidebarOpen ? (
            <div style={{
              display: 'flex',
              gap: 4,
              background: C.bg,
              borderRadius: 'var(--radius-sm)',
              padding: 3,
            }}>
              <button
                onClick={() => handleEnvSwitch('dev')}
                style={{
                  flex: 1,
                  padding: '6px 0',
                  borderRadius: 'calc(var(--radius-sm) - 2px)',
                  border: 'none',
                  fontSize: 11,
                  fontWeight: 600,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                  background: !isProd ? C.surface : 'transparent',
                  color: !isProd ? C.green : C.textMuted,
                  boxShadow: !isProd ? 'var(--shadow-sm)' : 'none',
                  transition: 'all .15s ease',
                }}
              >
                DEV
              </button>
              <button
                onClick={() => handleEnvSwitch('prod')}
                style={{
                  flex: 1,
                  padding: '6px 0',
                  borderRadius: 'calc(var(--radius-sm) - 2px)',
                  border: 'none',
                  fontSize: 11,
                  fontWeight: 600,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                  background: isProd ? C.surface : 'transparent',
                  color: isProd ? C.red : C.textMuted,
                  boxShadow: isProd ? 'var(--shadow-sm)' : 'none',
                  transition: 'all .15s ease',
                }}
              >
                PROD
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <span
                title={isProd ? 'Production' : 'Developpement'}
                style={{
                  display: 'inline-block',
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: isProd ? C.red : C.green,
                }}
              />
            </div>
          )}
        </div>

        {/* Nav links */}
        <nav style={{ flex: 1, padding: '16px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {NAV.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: sidebarOpen ? '9px 12px' : '9px 0',
                borderRadius: 'var(--radius-sm)',
                textDecoration: 'none',
                color: isActive ? C.primary : C.textMuted,
                background: isActive ? C.primaryAlpha : 'transparent',
                fontWeight: isActive ? 600 : 500,
                fontSize: 13,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                transition: 'all .12s ease',
                justifyContent: sidebarOpen ? 'flex-start' : 'center',
                letterSpacing: '-0.01em',
              })}
            >
              <span style={{ flexShrink: 0, display: 'flex' }}>
                <Icon d={Icons[icon]} />
              </span>
              {sidebarOpen && label}
            </NavLink>
          ))}
        </nav>

        {/* Logout */}
        <div style={{ padding: '12px 8px', borderTop: `1px solid ${C.border}` }}>
          <button
            onClick={handleLogout}
            style={{
              width: '100%',
              padding: sidebarOpen ? '9px 12px' : '9px 0',
              background: 'transparent',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              color: C.textMuted,
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 500,
              fontFamily: 'inherit',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              justifyContent: sidebarOpen ? 'flex-start' : 'center',
              transition: 'color .12s ease',
            }}
          >
            <span style={{ display: 'flex' }}><Icon d={Icons.logout} /></span>
            {sidebarOpen && 'Deconnexion'}
          </button>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, overflow: 'auto', padding: 32 }}>
        {/* Environment banner for production */}
        {isProd && (
          <div
            style={{
              background: C.redAlpha,
              border: `1px solid ${C.red}`,
              borderRadius: 'var(--radius-sm)',
              padding: '10px 16px',
              marginBottom: 24,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              fontSize: 13,
              color: C.red,
              fontWeight: 600,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            PRODUCTION — Les actions affectent les vrais utilisateurs
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
