import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { C } from '../theme';
import { setToken } from '../api';

const NAV: { to: string; label: string; icon: string }[] = [
  { to: '/', label: 'Vue d\'ensemble', icon: '📊' },
  { to: '/merchants', label: 'Commerçants', icon: '🏪' },
  { to: '/notifications', label: 'Notifications', icon: '📩' },
  { to: '/audit-logs', label: 'Audit Logs', icon: '📋' },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const handleLogout = () => {
    setToken(null);
    navigate('/login');
  };

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
                background: isActive ? C.primary + '22' : 'transparent',
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
        {children}
      </main>
    </div>
  );
}
