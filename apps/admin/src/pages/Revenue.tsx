import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getErrorMessage } from '@jitplus/shared';
import { getRevenue, setPremiumGrant, voidPayment } from '../api';
import type { PremiumGrant, RevenueReport } from '../types';
import { BarChart, Card, DataTable, Empty, KpiStrip, ShareList } from '../components/charts';
import { ContactButtons, PaymentModal, PlanKindBadge, Segmented } from '../components/crm';
import ConfirmModal from '../components/ConfirmModal';
import { Dash, ExportButton, Muted, PageHeader, useToast } from '../components/ui';
import { C, S } from '../theme';
import { deltaPct, fmtDate, fmtMAD, fmtNumber, fmtRelative, fmtTime } from '../utils/format';
import { PAYMENT_METHOD, WA_TEMPLATES, daysUntil, fmtMonth } from '../utils/crm';
import { exportCsv } from '../utils/csv';
import { DeltaBadge } from '../components/StatCard';

type Sub = RevenueReport['subscribers'][number];
type SubFilter = 'all' | 'PAID' | 'OFFERED' | 'unknown' | 'expiring' | 'unpaid';

const MONTHS = [6, 12, 24];

export default function Revenue() {
  const navigate = useNavigate();
  const [months, setMonths] = useState(12);
  const [data, setData] = useState<RevenueReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<SubFilter>('all');
  const [payFor, setPayFor] = useState<Sub | null>(null);
  const [voiding, setVoiding] = useState<string | null>(null);
  const [toastNode, showToast] = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await getRevenue(months));
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [months]);

  useEffect(() => { load(); }, [load]);

  const subs = useMemo(() => {
    if (!data) return [];
    const now = Date.now();
    return data.subscribers.filter((s) => {
      switch (filter) {
        case 'PAID': return s.grant === 'PAID';
        case 'OFFERED': return s.grant === 'OFFERED';
        case 'unknown': return !s.grant;
        case 'expiring': return !!s.planExpiresAt && new Date(s.planExpiresAt).getTime() - now <= 30 * 86_400_000;
        // Marked as paying but nothing received in the last 12 months
        case 'unpaid': return s.grant === 'PAID' && (!s.lastPaidAt || now - new Date(s.lastPaidAt).getTime() > 365 * 86_400_000);
        default: return true;
      }
    });
  }, [data, filter]);

  const label = async (s: Sub, grant: PremiumGrant) => {
    try {
      await setPremiumGrant(s.id, grant);
      showToast(`${s.nom} : ${grant === 'PAID' ? 'payant' : 'offert'}`);
      load();
    } catch (e) {
      showToast(getErrorMessage(e), 'error');
    }
  };

  const tt = data?.totals;
  const avgMonth = data ? data.totals.window / data.months : 0;
  const unpaidCount = data ? data.subscribers.filter((s) => s.grant === 'PAID' && (!s.lastPaidAt || Date.now() - new Date(s.lastPaidAt).getTime() > 365 * 86_400_000)).length : 0;

  return (
    <div style={{ paddingBottom: 48 }}>
      {toastNode}
      <PageHeader
        title="Revenus"
        subtitle={<>Argent réellement encaissé (paiements enregistrés par l'équipe) et répartition des Premium payants / offerts{data && <> · données de {fmtTime(data.generatedAt)}</>}</>}
        right={<>
          <Segmented options={MONTHS.map((m) => ({ value: String(m), label: `${m} mois` }))} value={String(months)} onChange={(v) => setMonths(Number(v))} />
          <button onClick={load} disabled={loading} style={S.btnOutline()}>{loading ? 'Chargement…' : 'Actualiser'}</button>
        </>}
      />

      {error && <div style={{ ...S.card, borderColor: C.red, color: C.red, marginBottom: 16 }}>{error}</div>}

      {data && tt && (
        <>
          <div style={{ marginBottom: 16 }}>
            <KpiStrip
              items={[
                { label: 'Encaissé ce mois', value: <span style={{ display: 'inline-flex', gap: 8, alignItems: 'baseline', whiteSpace: 'nowrap' }}>{fmtMAD(tt.thisMonth)}{tt.lastMonth > 0 && <DeltaBadge delta={deltaPct(tt.thisMonth, tt.lastMonth)} />}</span>, sub: `mois dernier ${fmtMAD(tt.lastMonth)}` },
                { label: `${data.months} derniers mois`, value: fmtMAD(tt.window), sub: `${fmtMAD(avgMonth)} / mois en moyenne` },
                { label: 'Depuis le début', value: fmtMAD(tt.allTime) },
                { label: 'Premium payants', value: fmtNumber(data.premium.paid), sub: unpaidCount ? <span style={{ color: C.amber }}>{unpaidCount} sans paiement depuis 12 mois</span> : 'tous à jour', onClick: () => setFilter(unpaidCount ? 'unpaid' : 'PAID') },
                { label: 'Premium offerts', value: fmtNumber(data.premium.offered), sub: 'gratuits, sans revenu', onClick: () => setFilter('OFFERED') },
                { label: 'Non renseignés', value: fmtNumber(data.premium.unknown), tone: data.premium.unknown ? C.amber : undefined, sub: 'payé ou offert ? à classer', onClick: () => setFilter('unknown') },
                { label: 'En essai', value: fmtNumber(data.premium.trial), sub: <Link to="/merchants?plan=TRIAL&sort=expiring" style={{ color: C.primary }}>voir les essais</Link> },
              ]}
            />
          </div>

          <div className="stack-sm" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(260px, 1fr)', gap: 16, marginBottom: 16 }}>
            <Card title="Encaissements par mois">
              <BarChart labels={data.monthly.map((m) => fmtMonth(m.month))} values={data.monthly.map((m) => m.amount)} format={(n) => fmtNumber(Math.round(n))} height={200} />
            </Card>
            <Card title="Par moyen de paiement">
              {data.byMethod.length === 0 ? <Empty>Aucun paiement sur la période</Empty> : (
                <ShareList
                  total={tt.window || 1}
                  color={C.chart[0]}
                  items={data.byMethod.map((m) => ({ label: `${PAYMENT_METHOD[m.method] ?? m.method} · ${m.payments} paiement(s)`, value: Math.round(m.amount) }))}
                />
              )}
            </Card>
          </div>

          <Card
            title={`Abonnés Premium (${subs.length})`}
            style={{ marginBottom: 16 }}
            right={
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <Segmented
                  value={filter}
                  onChange={setFilter}
                  options={[
                    { value: 'all', label: 'Tous' },
                    { value: 'PAID', label: 'Payants' },
                    { value: 'OFFERED', label: 'Offerts' },
                    { value: 'unknown', label: `Non renseignés${data.premium.unknown ? ` · ${data.premium.unknown}` : ''}` },
                    { value: 'expiring', label: 'Fin < 30 j' },
                    { value: 'unpaid', label: 'Sans paiement 12 mois' },
                  ]}
                />
                <ExportButton small label="CSV" onExport={async () => exportCsv('abonnes-premium', subs, [
                  { header: 'Commerce', value: (s) => s.nom },
                  { header: 'Email', value: (s) => s.email },
                  { header: 'Téléphone', value: (s) => s.phone },
                  { header: 'Type', value: (s) => (s.grant === 'PAID' ? 'Payant' : s.grant === 'OFFERED' ? 'Offert' : 'Non renseigné') },
                  { header: 'Note', value: (s) => s.grantNote },
                  { header: 'Fin', value: (s) => s.planExpiresAt?.slice(0, 10) ?? 'Sans fin' },
                  { header: 'Dernier paiement', value: (s) => s.lastPaidAt?.slice(0, 10) },
                  { header: 'Dernier montant', value: (s) => s.lastAmount },
                  { header: 'Total payé (MAD)', value: (s) => s.totalPaid },
                ])} />
              </div>
            }
          >
            <DataTable
              rows={subs}
              rowKey={(s) => s.id}
              onRowClick={(s) => navigate(`/merchants/${s.id}`)}
              columns={[
                { header: 'Commerce', render: (s) => <div><span style={{ fontWeight: 500 }}>{s.nom}</span><div style={{ fontSize: 12, color: C.textMuted }}>{[s.ville, s.phone].filter(Boolean).join(' · ')}</div></div> },
                {
                  header: 'Type',
                  render: (s) => s.grant ? (
                    <span title={s.grantNote ?? undefined}><PlanKindBadge kind={s.grant} />{s.grantNote && <div style={{ fontSize: 11.5, color: C.textMuted, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.grantNote}</div>}</span>
                  ) : (
                    <span onClick={(e) => e.stopPropagation()} style={{ display: 'inline-flex', gap: 4 }}>
                      <button onClick={() => label(s, 'PAID')} style={{ ...S.btnOutline(C.green), padding: '2px 8px', fontSize: 12 }}>Payant</button>
                      <button onClick={() => label(s, 'OFFERED')} style={{ ...S.btnOutline(C.primary), padding: '2px 8px', fontSize: 12 }}>Offert</button>
                    </span>
                  ),
                },
                {
                  header: 'Fin',
                  render: (s) => {
                    if (!s.planExpiresAt) return <Muted>Sans fin</Muted>;
                    const left = daysUntil(s.planExpiresAt);
                    return <span style={{ color: left <= 7 ? C.red : left <= 30 ? C.amber : C.text, whiteSpace: 'nowrap' }}>{fmtDate(s.planExpiresAt)} <span className="num" style={{ fontSize: 11.5 }}>J-{left}</span></span>;
                  },
                },
                { header: 'Dernier paiement', render: (s) => s.lastPaidAt ? <span>{fmtRelative(s.lastPaidAt)}{s.lastAmount !== null && <Muted> · {fmtMAD(s.lastAmount)}</Muted>}</span> : (s.grant === 'OFFERED' ? <Dash /> : <span style={{ color: C.amber }}>Aucun</span>) },
                { header: 'Total payé', align: 'right', render: (s) => (s.totalPaid ? fmtMAD(s.totalPaid) : <Dash />) },
                {
                  header: '',
                  align: 'right',
                  render: (s) => (
                    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
                      {s.grant !== 'OFFERED' && <button onClick={() => setPayFor(s)} style={{ ...S.btnOutline(), padding: '3px 8px', fontSize: 12 }}>+ Paiement</button>}
                      <ContactButtons phone={s.phone} email={s.email} waText={s.planExpiresAt ? WA_TEMPLATES.renewal(s.nom, Math.max(1, daysUntil(s.planExpiresAt))) : WA_TEMPLATES.generic(s.nom)} />
                    </span>
                  ),
                },
              ]}
            />
          </Card>

          <Card title="Derniers paiements enregistrés">
            <DataTable
              rows={data.recentPayments}
              rowKey={(p) => p.id}
              columns={[
                { header: 'Date', render: (p) => <span style={{ whiteSpace: 'nowrap', color: p.voidedAt ? C.textMuted : C.text }}>{fmtDate(p.paidAt)}</span> },
                { header: 'Commerce', render: (p) => p.merchant ? <Link to={`/merchants/${p.merchant.id}`} style={{ color: C.text }}>{p.merchant.nom}</Link> : <Dash /> },
                { header: 'Montant', align: 'right', render: (p) => <span style={{ textDecoration: p.voidedAt ? 'line-through' : 'none', color: p.voidedAt ? C.textMuted : C.text }}>{fmtMAD(p.amount)}</span> },
                { header: 'Moyen', render: (p) => <Muted>{PAYMENT_METHOD[p.method]}{p.reference ? ` · ${p.reference}` : ''}</Muted> },
                { header: 'Période', render: (p) => p.periodEnd ? <Muted>jusqu'au {fmtDate(p.periodEnd)}</Muted> : <Dash /> },
                { header: 'Saisi par', render: (p) => <Muted>{p.adminEmail?.split('@')[0] ?? '—'}</Muted> },
                {
                  header: '',
                  align: 'right',
                  render: (p) => p.voidedAt
                    ? <span title={p.voidReason ?? undefined} style={S.badge(C.red)}>Annulé</span>
                    : <button onClick={() => setVoiding(p.id)} style={{ ...S.btnGhost(), fontSize: 12 }}>Annuler</button>,
                },
              ]}
            />
          </Card>
        </>
      )}

      <PaymentModal
        open={!!payFor}
        merchant={payFor}
        defaultEnd={payFor?.planExpiresAt}
        onClose={() => setPayFor(null)}
        onDone={(msg) => { showToast(msg); load(); }}
      />
      <ConfirmModal
        open={!!voiding}
        title="Annuler ce paiement"
        message="Le paiement reste visible dans l'historique, barré, mais ne compte plus dans les revenus. Indiquez pourquoi."
        confirmLabel="Annuler le paiement"
        requireReason
        onCancel={() => setVoiding(null)}
        onConfirm={async (reason) => {
          try {
            await voidPayment(voiding!, reason ?? '');
            showToast('Paiement annulé');
            load();
          } catch (e) {
            showToast(getErrorMessage(e), 'error');
          } finally {
            setVoiding(null);
          }
        }}
      />
    </div>
  );
}
