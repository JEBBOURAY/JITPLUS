import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getStats } from '../api';
import { GlobalStats, MerchantRow, TrendPoint, AuditLogBrief } from '../types';
import StatCard from '../components/StatCard';
import PlanBadge from '../components/PlanBadge';
import { C, S } from '../theme';
import { fmtDate, fmtDateShort, fmtTime, ACTION_LABELS, ACTION_COLOR } from '../utils/format';
import { getErrorMessage } from '@jitplus/shared';

// ── Bar Chart (pure SVG) ──────────────────────────────────────────────────────
function BarChart({ data }: { data: TrendPoint[] }) {
  const W = 560;
  const H = 150;
  const PAD = { top: 12, right: 12, bottom: 32, left: 36 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const barGap = 4;
  const groupW = chartW / data.length;
  const barW = Math.max(8, (groupW - barGap * 3) / 2);

  const maxM = Math.max(...data.map((d) => d.merchants), 1);
  const maxT = Math.max(...data.map((d) => d.transactions), 1);
  const maxVal = Math.max(maxM, maxT, 1);

  const yScale = (v: number) => chartH - (v / maxVal) * chartH;

  // Y-axis ticks
  const ticks = [0, Math.round(maxVal / 2), maxVal];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      {/* Grid lines */}
      {ticks.map((t) => {
        const y = PAD.top + yScale(t);
        return (
          <g key={t}>
            <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke={C.border} strokeDasharray="3 3" />
            <text x={PAD.left - 4} y={y + 4} textAnchor="end" fontSize={9} fill={C.textMuted}>
              {t}
            </text>
          </g>
        );
      })}

      {data.map((d, i) => {
        const cx = PAD.left + i * groupW + groupW / 2;
        const mH = (d.merchants / maxVal) * chartH;
        const tH = (d.transactions / maxVal) * chartH;
        const mX = cx - barW - barGap / 2;
        const tX = cx + barGap / 2;

        return (
          <g key={d.label}>
            {/* Merchants bar */}
            <rect
              x={mX} y={PAD.top + chartH - mH}
              width={barW} height={mH}
              rx={3} fill={C.primary} opacity={0.85}
            />
            {/* Transactions bar */}
            <rect
              x={tX} y={PAD.top + chartH - tH}
              width={barW} height={tH}
              rx={3} fill={C.cyan} opacity={0.85}
            />
            {/* Label */}
            <text x={cx} y={H - 6} textAnchor="middle" fontSize={9} fill={C.textMuted}>
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────
function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, background: C.border, borderRadius: 4, height: 8, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4, transition: 'width .4s' }} />
      </div>
      <span style={{ fontSize: 12, color: C.textMuted, minWidth: 36, textAlign: 'right' }}>{value}</span>
    </div>
  );
}

// ── Section header ─────────────────────────────────────────────────────────────
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700, color: C.text, letterSpacing: 0.3 }}>
      {children}
    </h3>
  );
}

// ── Mini badge ────────────────────────────────────────────────────────────────
function ActionBadge({ action }: { action: string }) {
  const color = ACTION_COLOR[action] ?? C.textMuted;
  
  // Map color root back to its alpha variable for the background
  let alphaBg = '';
  if (color === C.primary) alphaBg = C.primaryAlpha;
  else if (color === C.green) alphaBg = C.greenAlpha;
  else if (color === C.red) alphaBg = C.redAlpha;
  else if (color === C.cyan) alphaBg = 'rgba(6, 182, 212, 0.15)'; // fallback for cyan
  else if (color === C.amber) alphaBg = 'rgba(245, 158, 11, 0.15)'; // fallback for amber
  else alphaBg = 'rgba(100, 116, 139, 0.15)'; // fallback for textMuted
  
  return (
    <span style={{
      ...S.badge(color, alphaBg),
      border: `1px solid ${color}`,
    }}>
      {ACTION_LABELS[action] ?? action}
    </span>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function Overview() {
  const [stats, setStats] = useState<GlobalStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    getStats()
      .then(setStats)
      .catch((e: unknown) => setError(getErrorMessage(e)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p style={{ color: C.textMuted }}>Chargement…</p>;
  if (error) return <p style={{ color: C.red }}>{error}</p>;
  if (!stats) return null;

  const { merchants, clients, transactions, rewards, notifications, trends, recentMerchants, recentAuditLogs } = stats;
  const premiumPct = merchants.total ? Math.round((merchants.premium / merchants.total) * 100) : 0;
  const txTotal = transactions.earnPoints + transactions.redeemReward + transactions.adjustPoints;
  const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div style={{ paddingBottom: 48 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h2 style={{ margin: 0, fontWeight: 800, fontSize: 22, color: C.text }}>Vue d'ensemble</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: C.textMuted, textTransform: 'capitalize' }}>{today}</p>
        </div>
      </div>

      {/* ── KPI Grid — Merchants ─────────────────────────────────────────── */}
      <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 1.2 }}>
        Commerçants
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(168px, 1fr))', gap: 12, marginBottom: 20 }}>
        <StatCard label="Total" value={merchants.total} sub={`${merchants.active} actifs`} color={C.primary} />
        <StatCard label="Premium" value={merchants.premium} sub={`${premiumPct}% du total`} color={C.cyan} />
        <StatCard label="Free" value={merchants.free} sub="plan de base" color={C.blue} />
        <StatCard label="Bannis" value={merchants.banned} sub="comptes suspendus" color={C.red} />
      </div>

      {/* ── KPI Grid — Clients & Transactions ───────────────────────────── */}
      <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 1.2 }}>
        Activité
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(168px, 1fr))', gap: 12, marginBottom: 28 }}>
        <StatCard label="Clients" value={clients.total} sub={`+${clients.newThisMonth} ce mois`} color={C.green} />
        <StatCard label="Transactions" value={transactions.total} sub={`+${transactions.thisMonth} ce mois`} color={C.amber} />
        <StatCard label="Récompenses" value={rewards.total} sub="créées au total" color={C.primaryLight} />
        <StatCard label="Notifications" value={notifications.total} sub={`${notifications.successRate}% succès`} color={C.cyan} />
      </div>

      {/* ── Trend + Breakdown ────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, marginBottom: 20, alignItems: 'start' }}>

        {/* Trend chart */}
        <div style={S.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <SectionTitle>Tendances (6 derniers mois)</SectionTitle>
            <div style={{ display: 'flex', gap: 16, fontSize: 11 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: C.textMuted }}>
                <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: C.primary }} />
                Commerçants
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: C.textMuted }}>
                <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: C.cyan }} />
                Transactions
              </span>
            </div>
          </div>
          <BarChart data={trends} />
        </div>

        {/* Transaction type breakdown */}
        <div style={S.card}>
          <SectionTitle>Répartition des transactions</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                <span style={{ fontSize: 12, color: C.text }}>Points gagnés</span>
                <span style={{ fontSize: 11, color: C.textMuted }}>
                  {txTotal > 0 ? Math.round((transactions.earnPoints / txTotal) * 100) : 0}%
                </span>
              </div>
              <ProgressBar value={transactions.earnPoints} max={txTotal} color={C.green} />
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                <span style={{ fontSize: 12, color: C.text }}>Récompenses échangées</span>
                <span style={{ fontSize: 11, color: C.textMuted }}>
                  {txTotal > 0 ? Math.round((transactions.redeemReward / txTotal) * 100) : 0}%
                </span>
              </div>
              <ProgressBar value={transactions.redeemReward} max={txTotal} color={C.amber} />
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                <span style={{ fontSize: 12, color: C.text }}>Ajustements manuels</span>
                <span style={{ fontSize: 11, color: C.textMuted }}>
                  {txTotal > 0 ? Math.round((transactions.adjustPoints / txTotal) * 100) : 0}%
                </span>
              </div>
              <ProgressBar value={transactions.adjustPoints} max={txTotal} color={C.blue} />
            </div>

            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 }}>Notifications par canal</p>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span style={{ fontSize: 12, color: C.text }}>📱 Push</span>
                  <span style={{ fontSize: 11, color: C.textMuted }}>{notifications.pushCount}</span>
                </div>
                <ProgressBar value={notifications.pushCount} max={notifications.total || 1} color={C.primary} />
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span style={{ fontSize: 12, color: C.text }}>💬 WhatsApp</span>
                  <span style={{ fontSize: 11, color: C.textMuted }}>{notifications.whatsappCount}</span>
                </div>
                <ProgressBar value={notifications.whatsappCount} max={notifications.total || 1} color="#25D366" />
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span style={{ fontSize: 12, color: C.text }}>📧 Email</span>
                  <span style={{ fontSize: 11, color: C.textMuted }}>{notifications.emailCount}</span>
                </div>
                <ProgressBar value={notifications.emailCount} max={notifications.total || 1} color="#EA4335" />
              </div>
              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <p style={{ margin: 0, fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 }}>Envois total</p>
                  <p style={{ margin: '3px 0 0', fontSize: 20, fontWeight: 800, color: C.cyan }}>
                    {notifications.totalSent.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 }}>Taux succès</p>
                  <p style={{ margin: '3px 0 0', fontSize: 20, fontWeight: 800, color: notifications.successRate >= 80 ? C.green : C.amber }}>
                    {notifications.successRate}%
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Audit logs ──────────────────────────────────────────────── */}
      <div style={{ marginBottom: 20 }}>

        {/* Recent audit logs */}
        <div style={S.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <SectionTitle>Dernières actions admin</SectionTitle>
            <button
              onClick={() => navigate('/audit-logs')}
              style={{ ...S.btn(C.surfaceHover), fontSize: 11, padding: '4px 10px', color: C.textMuted }}
            >
              Historique
            </button>
          </div>
          {recentAuditLogs.length === 0 ? (
            <p style={{ color: C.textMuted, fontSize: 13, textAlign: 'center', padding: '20px 0' }}>Aucune action</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {recentAuditLogs.map((log: AuditLogBrief) => (
                <div
                  key={log.id}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 8,
                    background: C.bg,
                    border: `1px solid ${C.border}`,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: 10,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <ActionBadge action={log.action} />
                    {log.targetLabel && (
                      <p style={{ margin: '4px 0 0', fontSize: 12, color: C.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {log.targetLabel}
                      </p>
                    )}
                    <p style={{ margin: '3px 0 0', fontSize: 11, color: C.border }}>par {log.adminEmail}</p>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <p style={{ margin: 0, fontSize: 11, color: C.textMuted }}>{fmtDateShort(log.createdAt)}</p>
                    <p style={{ margin: '2px 0 0', fontSize: 10, color: C.border }}>{fmtTime(log.createdAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Recent merchants ─────────────────────────────────────────────── */}
      <div style={S.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <SectionTitle>Derniers commerçants inscrits</SectionTitle>
          <button
            onClick={() => navigate('/merchants')}
            style={{ ...S.btn(C.surfaceHover), fontSize: 11, padding: '4px 10px', color: C.textMuted }}
          >
            Voir tout
          </button>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.border}` }}>
              {['Nom', 'Email', 'Plan', 'Statut', 'Inscrit le'].map((h) => (
                <th key={h} style={{ textAlign: 'left', padding: '6px 10px', color: C.textMuted, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {recentMerchants.map((m: MerchantRow) => (
              <tr
                key={m.id}
                onClick={() => navigate(`/merchants/${m.id}`)}
                style={{ borderBottom: `1px solid `, cursor: 'pointer', transition: 'background .15s' }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = C.surfaceHover)}
                onMouseLeave={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = 'transparent')}
              >
                <td style={{ padding: '10px 10px', fontWeight: 600 }}>{m.nom}</td>
                <td style={{ padding: '10px 10px', color: C.textMuted }}>{m.email}</td>
                <td style={{ padding: '10px 10px' }}><PlanBadge plan={m.plan} isActive={m.isActive} /></td>
                <td style={{ padding: '10px 10px' }}>
                  <span style={{
                    display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                    background: m.isActive ? C.greenAlpha : C.redAlpha,
                    color: m.isActive ? C.green : C.red,
                  }}>
                    {m.isActive ? 'Actif' : 'Banni'}
                  </span>
                </td>
                <td style={{ padding: '10px 10px', color: C.textMuted }}>{fmtDate(m.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

