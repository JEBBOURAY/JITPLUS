import React, { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { C, S } from '../theme';
import { canSwitchEnv, getClients, getEnv, getMerchants, logout, onEnvChange, setEnv } from '../api';
import type { AdminEnv } from '../api';
import type { ClientRow, MerchantRow } from '../types';
import { AlertsContext, navBadges, useAlerts } from '../utils/alerts';
import { PLAN_KIND, planKindOf } from '../utils/crm';

// ── Icons (24px grid, 1.7 stroke) ────────────────────────────────────────────
const Icons = {
  home: 'M3 10.5L12 3l9 7.5V20a1 1 0 01-1 1h-5v-6h-6v6H4a1 1 0 01-1-1v-9.5z',
  followUp: 'M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11',
  revenue: 'M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6',
  analytics: 'M3 3v18h18M7 15l4-4 3 3 5-6',
  merchants: 'M3 9l1.5-5h15L21 9M3 9v11h18V9M3 9h18M9 20v-6h6v6',
  clients: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zm14 10v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
  notifications: 'M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0',
  send: 'M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z',
  news: 'M4 22h16a2 2 0 002-2V4a2 2 0 00-2-2H8a2 2 0 00-2 2v16a2 2 0 01-2 2zm0 0a2 2 0 01-2-2v-9c0-1.1.9-2 2-2h2M18 14h-8M15 18h-5M10 6h8v4h-8z',
  referrals: 'M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM19 8v6M22 11h-6',
  deals: 'M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82zM7 7h.01',
  audit: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zM14 2v6h6M16 13H8M16 17H8M10 9H8',
  logout: 'M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9',
  search: 'M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z',
  menu: 'M3 12h18M3 6h18M3 18h18',
  sun: 'M12 17a5 5 0 100-10 5 5 0 000 10zM12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42',
  moon: 'M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z',
};

function Icon({ name, size = 17 }: { name: keyof typeof Icons; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={Icons[name]} />
    </svg>
  );
}

const NAV: { title: string; items: { to: string; label: string; icon: keyof typeof Icons }[] }[] = [
  {
    title: 'Pilotage',
    items: [
      { to: '/', label: 'Tableau de bord', icon: 'home' },
      { to: '/follow-ups', label: 'Suivi commercial', icon: 'followUp' },
      { to: '/revenue', label: 'Revenus', icon: 'revenue' },
      { to: '/analytics', label: 'Analyses', icon: 'analytics' },
    ],
  },
  {
    title: 'Comptes',
    items: [
      { to: '/merchants', label: 'Commerçants', icon: 'merchants' },
      { to: '/clients', label: 'Clients', icon: 'clients' },
    ],
  },
  {
    title: 'Communication',
    items: [
      { to: '/notifications', label: 'Notifications', icon: 'notifications' },
      { to: '/send-notification', label: 'Envoyer', icon: 'send' },
      { to: '/merchant-news', label: 'Nouveautés Pro', icon: 'news' },
    ],
  },
  {
    title: 'Opérations',
    items: [
      { to: '/referrals', label: 'Parrainages', icon: 'referrals' },
      { to: '/deals', label: 'Bons plans', icon: 'deals' },
      { to: '/audit-logs', label: 'Journal', icon: 'audit' },
    ],
  },
];

// ── Theme (system / light / dark), remembered per browser ────────────────────
type ThemePref = 'system' | 'light' | 'dark';

function readTheme(): ThemePref {
  try {
    const v = localStorage.getItem('admin_theme');
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

function applyTheme(t: ThemePref) {
  const root = document.documentElement;
  if (t === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', t);
  try { localStorage.setItem('admin_theme', t); } catch { /* private mode */ }
}

// ── Global search (merchants + clients) ──────────────────────────────────────

function GlobalSearch() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [merchants, setMerchants] = useState<MerchantRow[]>([]);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(0);

  // "/" focuses the search from anywhere
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setMerchants([]); setClients([]); return; }
    let alive = true;
    setLoading(true);
    const t = setTimeout(async () => {
      const [m, c] = await Promise.allSettled([getMerchants({ search: term, limit: 6 }), getClients({ search: term, limit: 5 })]);
      if (!alive) return;
      setMerchants(m.status === 'fulfilled' ? m.value.merchants : []);
      setClients(c.status === 'fulfilled' ? c.value.clients : []);
      setCursor(0);
      setLoading(false);
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [q]);

  const results = useMemo(() => [
    ...merchants.map((m) => ({ key: `m${m.id}`, to: `/merchants/${m.id}`, title: m.nom, sub: [m.phoneNumber, m.ville].filter(Boolean).join(' · ') || m.email, tag: PLAN_KIND[planKindOf(m)].label, group: 'Commerçants' })),
    ...clients.map((c) => ({ key: `c${c.id}`, to: `/clients/${c.id}`, title: [c.prenom, c.nom].filter(Boolean).join(' ') || 'Client sans nom', sub: c.telephone ?? c.email ?? '', tag: `${c.merchantCount} carte(s)`, group: 'Clients' })),
  ], [merchants, clients]);

  const go = (to: string) => { setOpen(false); setQ(''); inputRef.current?.blur(); navigate(to); };

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: 420 }}>
      <span style={{ position: 'absolute', left: 9, top: 8, color: C.textMuted, display: 'flex' }}><Icon name="search" size={15} /></span>
      <input
        ref={inputRef}
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(results.length - 1, c + 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)); }
          else if (e.key === 'Enter' && results[cursor]) go(results[cursor].to);
          else if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur(); }
        }}
        placeholder="Rechercher un commerçant ou un client (nom, téléphone, email)"
        style={{ ...S.input, paddingLeft: 30, paddingRight: 30, background: C.bg }}
      />
      <kbd style={{ position: 'absolute', right: 8, top: 7, fontSize: 11, color: C.textMuted, border: `1px solid ${C.border}`, borderRadius: 3, padding: '0 5px', fontFamily: 'var(--font-mono)' }}>/</kbd>
      {open && q.trim().length >= 2 && (
        <div style={{ position: 'absolute', top: 38, left: 0, right: 0, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)', zIndex: 500, maxHeight: 420, overflowY: 'auto', padding: 4 }}>
          {loading && results.length === 0 && <div style={{ padding: 10, color: C.textMuted, fontSize: 12.5 }}>Recherche…</div>}
          {!loading && results.length === 0 && <div style={{ padding: 10, color: C.textMuted, fontSize: 12.5 }}>Aucun résultat pour « {q.trim()} »</div>}
          {results.map((r, i) => (
            <React.Fragment key={r.key}>
              {(i === 0 || results[i - 1].group !== r.group) && <div style={{ padding: '6px 8px 2px', fontSize: 11.5, color: C.textMuted }}>{r.group}</div>}
              <button
                onMouseDown={(e) => { e.preventDefault(); go(r.to); }}
                onMouseEnter={() => setCursor(i)}
                style={{ width: '100%', textAlign: 'left', display: 'flex', justifyContent: 'space-between', gap: 8, padding: '6px 8px', border: 'none', borderRadius: 4, background: i === cursor ? C.surfaceHover : 'transparent', cursor: 'pointer', fontFamily: 'inherit', color: C.text }}
              >
                <span style={{ minWidth: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{r.title}</span>
                  <span style={{ fontSize: 12, color: C.textMuted, marginLeft: 8 }}>{r.sub}</span>
                </span>
                <span style={{ fontSize: 11.5, color: C.textMuted, whiteSpace: 'nowrap' }}>{r.tag}</span>
              </button>
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Layout ───────────────────────────────────────────────────────────────────

export default function Layout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const narrow = typeof window !== 'undefined' && window.innerWidth < 860;
  const [sidebarOpen, setSidebarOpen] = useState(!narrow);
  const [env, setEnvState] = useState<AdminEnv>(getEnv);
  const [theme, setTheme] = useState<ThemePref>(readTheme);

  useEffect(() => onEnvChange(setEnvState), []);
  useEffect(() => { applyTheme(theme); }, [theme]);
  // On small screens the menu closes after navigating
  useEffect(() => { if (window.innerWidth < 860) setSidebarOpen(false); }, [pathname]);

  const alerts = useAlerts();
  const badges = useMemo(() => (alerts ? navBadges(alerts) : {}), [alerts]);

  const handleEnvSwitch = (newEnv: AdminEnv) => {
    if (newEnv === env || !canSwitchEnv()) return;
    setEnv(newEnv);
    navigate('/login');
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const isProd = env === 'prod';
  const W = sidebarOpen ? 224 : 56;
  const nextTheme: Record<ThemePref, ThemePref> = { system: 'dark', dark: 'light', light: 'system' };
  const themeLabel: Record<ThemePref, string> = { system: 'Thème : système', dark: 'Thème : sombre', light: 'Thème : clair' };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: C.bg }}>
      <aside
        style={{
          width: W,
          background: C.surface,
          borderRight: `1px solid ${C.border}`,
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
          position: 'sticky',
          top: 0,
          height: '100vh',
          transition: 'width .15s ease',
          zIndex: 20,
        }}
      >
        <div style={{ height: 52, display: 'flex', alignItems: 'center', gap: 8, padding: sidebarOpen ? '0 14px' : '0', justifyContent: sidebarOpen ? 'flex-start' : 'center', borderBottom: `1px solid ${C.border}` }}>
          <button onClick={() => setSidebarOpen((v) => !v)} title={sidebarOpen ? 'Réduire le menu' : 'Ouvrir le menu'} className="icon-btn" style={{ ...S.btnGhost(), padding: 5, borderRadius: 'var(--radius-sm)' }}>
            <Icon name="menu" />
          </button>
          {sidebarOpen && (
            <span style={{ fontWeight: 600, fontSize: 14 }}>
              JitPlus <span style={{ color: C.textMuted, fontWeight: 400 }}>admin</span>
            </span>
          )}
        </div>

        <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 8px' }}>
          {NAV.map((group) => (
            <div key={group.title} style={{ marginBottom: 10 }}>
              {sidebarOpen
                ? <div style={{ fontSize: 11.5, color: C.textMuted, padding: '6px 8px 4px' }}>{group.title}</div>
                : <div style={{ height: 1, background: C.borderLight, margin: '6px 8px' }} />}
              {group.items.map(({ to, label, icon }) => {
                const badge = badges[to];
                return (
                  <NavLink
                    key={to}
                    to={to}
                    end={to === '/'}
                    title={badge?.title ?? (sidebarOpen ? undefined : label)}
                    className="nav-link"
                    style={({ isActive }) => ({
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      height: 32,
                      padding: sidebarOpen ? '0 8px' : 0,
                      justifyContent: sidebarOpen ? 'flex-start' : 'center',
                      borderRadius: 'var(--radius-sm)',
                      textDecoration: 'none',
                      color: isActive ? C.text : C.textMuted,
                      background: isActive ? C.surfaceAlt : 'transparent',
                      fontWeight: isActive ? 500 : 400,
                      fontSize: 13,
                      whiteSpace: 'nowrap',
                      position: 'relative',
                    })}
                  >
                    <span style={{ display: 'flex', flexShrink: 0 }}><Icon name={icon} /></span>
                    {sidebarOpen && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>}
                    {badge && (sidebarOpen ? (
                      <span className="num" style={{ marginLeft: 'auto', fontSize: 11.5, minWidth: 18, textAlign: 'center', padding: '0 5px', borderRadius: 3, lineHeight: '17px', color: '#fff', background: badge.level === 'critical' ? C.red : C.amber }}>
                        {badge.count > 99 ? '99+' : badge.count}
                      </span>
                    ) : (
                      <span style={{ position: 'absolute', top: 5, right: 9, width: 7, height: 7, borderRadius: '50%', background: badge.level === 'critical' ? C.red : C.amber }} />
                    ))}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>

        <div style={{ borderTop: `1px solid ${C.border}`, padding: 8, display: 'flex', flexDirection: sidebarOpen ? 'row' : 'column', gap: 4, alignItems: 'center' }}>
          {canSwitchEnv() && sidebarOpen && (
            <div style={{ display: 'inline-flex', border: `1px solid ${C.border}`, borderRadius: 'var(--radius-sm)', overflow: 'hidden', marginRight: 'auto' }}>
              {(['dev', 'prod'] as const).map((e) => (
                <button
                  key={e}
                  onClick={() => handleEnvSwitch(e)}
                  style={{ padding: '3px 8px', fontSize: 11.5, fontFamily: 'var(--font-mono)', border: 'none', cursor: 'pointer', background: env === e ? (e === 'prod' ? C.red : C.ink) : C.surface, color: env === e ? (e === 'prod' ? '#fff' : C.onInk) : C.textMuted }}
                >
                  {e.toUpperCase()}
                </button>
              ))}
            </div>
          )}
          {!sidebarOpen || !canSwitchEnv() ? <span style={{ marginRight: sidebarOpen ? 'auto' : 0 }} /> : null}
          <button onClick={() => setTheme(nextTheme[theme])} title={themeLabel[theme]} className="icon-btn" style={{ ...S.btnGhost(), padding: 6 }}>
            <Icon name={theme === 'dark' ? 'moon' : 'sun'} size={16} />
          </button>
          <button onClick={handleLogout} title="Déconnexion" className="icon-btn" style={{ ...S.btnGhost(), padding: 6 }}>
            <Icon name="logout" size={16} />
          </button>
        </div>
      </aside>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <header style={{ height: 52, display: 'flex', alignItems: 'center', gap: 12, padding: '0 24px', borderBottom: `1px solid ${C.border}`, background: C.surface, position: 'sticky', top: 0, zIndex: 15 }}>
          <GlobalSearch />
          <span style={{ marginLeft: 'auto' }} />
          {isProd && canSwitchEnv() && (
            <span style={{ ...S.badge(C.red), fontFamily: 'var(--font-mono)' }} title="Les actions affectent les vrais utilisateurs">PRODUCTION</span>
          )}
        </header>
        <main style={{ flex: 1, padding: '20px 24px', maxWidth: 1480, width: '100%', margin: '0 auto' }}>
          <AlertsContext.Provider value={alerts}>{children}</AlertsContext.Provider>
        </main>
      </div>
    </div>
  );
}
