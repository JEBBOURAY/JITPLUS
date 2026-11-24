import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { getErrorMessage } from '@jitplus/shared';
import { getUsage } from '../api';
import type { InsightPeriod, PlanKind, UsageFeature, UsageMerchant, UsageReport } from '../types';
import { Card, DataTable, Empty, KpiStrip, ShareList, type Column } from '../components/charts';
import { MerchantCell, PlanKindBadge, Segmented } from '../components/crm';
import { ExportButton, FilterBar, Pagination, PillGroup, SearchInput, SelectFilter, type Option } from '../components/ui';
import { C, S } from '../theme';
import { CATEGORY_LABELS, activityColor, fmtDate, fmtNumber, fmtRelative, fmtTime, sharePct } from '../utils/format';
import { exportCsv } from '../utils/csv';
import { useDebouncedInput, useUrlFilters } from '../utils/useUrlFilters';

// ── Features ─────────────────────────────────────────────────────────────────

interface FeatureMeta {
  label: string;
  short: string;
  hint: string;
  /** What one event is, for the volume column */
  unit: string;
}

const FEATURES: Record<UsageFeature, FeatureMeta> = {
  stamps: { label: 'Scan de tampons', short: 'Scan', hint: 'Tampons ajoutés en caisse (QR, code ou saisie)', unit: 'scans' },
  rewards: { label: 'Récompenses remises', short: 'Récomp.', hint: 'Récompenses remises aux clients. « En place » : une récompense existe mais aucune remise sur la période', unit: 'remises' },
  welcome: { label: 'Cadeau de bienvenue', short: 'Bienv.', hint: 'Tampons offerts aux nouveaux clients. « En place » : activé, aucun cadeau sur la période', unit: 'cadeaux' },
  team: { label: 'Équipe', short: 'Équipe', hint: 'Scans faits par un membre de l\'équipe. « En place » : au moins un membre actif', unit: 'scans' },
  stampCodes: { label: 'Codes e-commerce', short: 'Codes', hint: 'Codes tampons imprimés ou utilisés (colis, livraison)', unit: 'codes' },
  quickAdd: { label: 'Ajout rapide WhatsApp', short: 'WhatsApp', hint: 'Liens WhatsApp créés pour ajouter un client', unit: 'liens' },
  notifications: { label: 'Notifications', short: 'Notif.', hint: 'Campagnes envoyées aux clients (push, WhatsApp, e-mail)', unit: 'campagnes' },
  scratch: { label: 'Cartes à gratter', short: 'Gratter', hint: 'Campagnes programmées ou envoyées. « En place » : cartes encore valables', unit: 'campagnes' },
  wheel: { label: 'Roue de la fortune', short: 'Roue', hint: 'Tirages faits par les clients. « En place » : roue active, aucun tirage', unit: 'tirages' },
  collections: { label: 'Collections', short: 'Collect.', hint: 'Cases cochées sur les cartes de collection. « En place » : collection active', unit: 'cases' },
  deals: { label: 'Bons plans', short: 'Bons plans', hint: 'Bons plans publiés. « En place » : un bon plan est en ligne', unit: 'publiés' },
  booking: { label: 'Réservations', short: 'RDV', hint: 'Rendez-vous pris dans l\'app ou saisis par le commerçant. « En place » : réservation activée', unit: 'RDV' },
};

const GROUPS: { title: string; keys: UsageFeature[] }[] = [
  { title: 'Fidélité au quotidien', keys: ['stamps', 'rewards', 'welcome', 'team', 'stampCodes', 'quickAdd'] },
  { title: 'Faire revenir les clients', keys: ['notifications', 'scratch', 'wheel', 'collections'] },
  { title: 'Visibilité et services', keys: ['deals', 'booking'] },
];
const ALL_FEATURES = GROUPS.flatMap((g) => g.keys);

type FeatureState = 'used' | 'live' | 'lapsed' | 'never';

const STATE: Record<FeatureState, { label: string; color: string }> = {
  used: { label: 'Utilisée sur la période', color: C.green },
  live: { label: 'En place, pas utilisée', color: C.amber },
  lapsed: { label: 'Utilisée avant, plus maintenant', color: C.red },
  never: { label: 'Jamais utilisée', color: C.textMuted },
};

function stateOf(m: UsageMerchant, f: UsageFeature): FeatureState {
  const u = m.usage[f];
  if (u && u.n > 0) return 'used';
  if (m.live.includes(f)) return 'live';
  if (u && u.ever > 0) return 'lapsed';
  return 'never';
}

const scans = (m: UsageMerchant) => (m.usage.stamps?.n ?? 0) > 0;
const usedCount = (m: UsageMerchant) => ALL_FEATURES.filter((f) => (m.usage[f]?.n ?? 0) > 0).length;

// ── Filters ──────────────────────────────────────────────────────────────────

const PERIODS: { value: `${InsightPeriod}`; label: string }[] = [
  { value: '7', label: '7 j' },
  { value: '30', label: '30 j' },
  { value: '90', label: '90 j' },
];

type PlanFilter = 'all' | 'premium' | 'trial' | 'free';
const PLAN_OPTIONS: Option<PlanFilter>[] = [
  { value: 'all', label: 'Tous' },
  { value: 'premium', label: 'Premium', hint: 'Payé, offert ou activé par un admin' },
  { value: 'trial', label: 'Essai' },
  { value: 'free', label: 'Free' },
];
const PREMIUM_KINDS: PlanKind[] = ['PAID', 'OFFERED', 'ADMIN'];
function matchesPlan(k: PlanKind, p: PlanFilter): boolean {
  if (p === 'all') return true;
  if (p === 'premium') return PREMIUM_KINDS.includes(k);
  if (p === 'trial') return k === 'TRIAL';
  return k === 'FREE';
}

type ActivityFilter = 'all' | 'scanning' | 'appNoScan' | 'silent';
const ACTIVITY_OPTIONS: Option<ActivityFilter>[] = [
  { value: 'all', label: 'Tous les comptes' },
  { value: 'scanning', label: 'Scannent', hint: 'Au moins un scan sur la période' },
  { value: 'appNoScan', label: 'Ouvrent l\'app sans scanner', hint: 'App Pro ouverte sur la période, aucun scan' },
  { value: 'silent', label: 'Inactifs', hint: 'Ni scan ni ouverture de l\'app Pro sur la période' },
];

type SortKey = 'most' | 'least' | 'app' | 'scan' | 'clients';
const SORT_OPTIONS: Option<SortKey>[] = [
  { value: 'most', label: 'Le plus de fonctionnalités' },
  { value: 'least', label: 'Le moins de fonctionnalités' },
  { value: 'app', label: 'App Pro ouverte récemment' },
  { value: 'scan', label: 'Scan le plus récent' },
  { value: 'clients', label: 'Le plus de clients' },
];

const PAGE_SIZE = 50;

const DEFAULTS = {
  days: '30',
  plan: 'all',
  activity: 'all',
  cat: '',
  city: '',
  feature: '',
  state: '',
  sort: 'most',
  search: '',
};

// ── Small pieces ─────────────────────────────────────────────────────────────

function Dot({ state, title }: { state: FeatureState; title: string }) {
  const color = STATE[state].color;
  const style: CSSProperties =
    state === 'used' ? { background: color, border: `2px solid ${color}` }
      : state === 'never' ? { width: 8, height: 2, borderRadius: 1, background: C.border }
        : { border: `2px solid ${color}`, background: 'transparent' };
  return (
    <span title={title} style={{ display: 'inline-flex', width: 18, height: 18, alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ width: 10, height: 10, borderRadius: '50%', boxSizing: 'border-box', ...style }} />
    </span>
  );
}

function SeenCell({ date, empty }: { date: string | null | undefined; empty: string }) {
  return (
    <span title={date ? fmtDate(date) : empty} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: date ? C.text : C.textMuted, whiteSpace: 'nowrap' }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: activityColor(date), flexShrink: 0 }} />
      {date ? fmtRelative(date) : empty}
    </span>
  );
}

function Delta({ now, before }: { now: number; before: number }) {
  const d = now - before;
  if (d === 0) return <span style={{ color: C.textMuted }}>=</span>;
  return <span className="num" style={{ color: d > 0 ? C.green : C.red }}>{d > 0 ? '+' : '−'}{fmtNumber(Math.abs(d))}</span>;
}

function dotTitle(m: UsageMerchant, f: UsageFeature): string {
  const meta = FEATURES[f];
  const u = m.usage[f];
  const s = stateOf(m, f);
  const last = u?.last ? ` · dernière fois ${fmtRelative(u.last).toLowerCase()}` : '';
  if (s === 'used') return `${meta.label} : ${fmtNumber(u!.n)} ${meta.unit} sur la période${last}`;
  if (s === 'live') return `${meta.label} : en place, rien sur la période${last}`;
  if (s === 'lapsed') return `${meta.label} : ${fmtNumber(u!.ever)} ${meta.unit} au total${last}`;
  return `${meta.label} : jamais utilisée`;
}

/** Clickable count in the adoption table: filters the merchant list below. */
function CountButton({ n, total, color, onClick, strong }: { n: number; total: number; color?: string; onClick: () => void; strong?: boolean }) {
  if (n === 0) return <span style={{ color: C.textMuted }}>0</span>;
  return (
    <button
      type="button"
      onClick={onClick}
      title="Voir ces commerçants"
      style={{ ...S.btnGhost(), padding: 0, fontSize: 13, color: color ?? C.text, fontWeight: strong ? 500 : 400, whiteSpace: 'nowrap' }}
    >
      <span className="num">{fmtNumber(n)}</span>
      <span style={{ color: C.textMuted, fontWeight: 400, fontSize: 12 }}> · {sharePct(n, total)} %</span>
    </button>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

interface Adoption {
  key: UsageFeature;
  used: number;
  usedPrev: number;
  live: number;
  lapsed: number;
  never: number;
  volume: number;
}

export default function UsagePage() {
  const navigate = useNavigate();
  const { filters, page, update, reset, active } = useUrlFilters(DEFAULTS);
  const days = (Number(filters.days) === 7 || Number(filters.days) === 90 ? Number(filters.days) : 30) as InsightPeriod;
  const plan = filters.plan as PlanFilter;
  const activity = filters.activity as ActivityFilter;
  const feature = (ALL_FEATURES as string[]).includes(filters.feature) ? (filters.feature as UsageFeature) : null;
  const featureState = (Object.keys(STATE) as string[]).includes(filters.state) ? (filters.state as FeatureState) : null;
  const sort = filters.sort as SortKey;

  const [data, setData] = useState<UsageReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchText, setSearchText] = useDebouncedInput(filters.search, (v) => update({ search: v }));
  const listRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (d: InsightPeriod) => {
    setLoading(true);
    setError('');
    try {
      setData(await getUsage(d));
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(days); }, [days, load]);

  const since = data ? new Date(data.period.since).getTime() : 0;
  const d7 = data ? new Date(data.period.until).getTime() - 7 * 86_400_000 : 0;
  const appInPeriod = useCallback((m: UsageMerchant) => !!m.lastAppAt && new Date(m.lastAppAt).getTime() >= since, [since]);

  // Rows matching activity / category / city: the base of every block, before the plan filter.
  const base = useMemo(() => {
    if (!data) return [];
    return data.merchants.filter((m) => {
      if (filters.cat && m.categorie !== filters.cat) return false;
      if (filters.city && (m.ville ?? '').trim().toLowerCase() !== filters.city) return false;
      if (activity === 'scanning') return scans(m);
      if (activity === 'appNoScan') return appInPeriod(m) && !scans(m);
      if (activity === 'silent') return !appInPeriod(m) && !scans(m);
      return true;
    });
  }, [data, filters.cat, filters.city, activity, appInPeriod]);

  const segment = useMemo(() => base.filter((m) => matchesPlan(m.planKind, plan)), [base, plan]);

  const facets = useMemo(() => {
    const cats = new Map<string, number>();
    const cities = new Map<string, { label: string; n: number }>();
    for (const m of data?.merchants ?? []) {
      cats.set(m.categorie, (cats.get(m.categorie) ?? 0) + 1);
      const v = (m.ville ?? '').trim();
      if (v) {
        const k = v.toLowerCase();
        const c = cities.get(k) ?? { label: v, n: 0 };
        c.n += 1;
        cities.set(k, c);
      }
    }
    return {
      cats: [{ value: '', label: 'Toutes catégories' }, ...[...cats.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ value: k, label: `${CATEGORY_LABELS[k] ?? k} (${n})` }))],
      cities: [{ value: '', label: 'Toutes villes' }, ...[...cities.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 40).map(([k, c]) => ({ value: k, label: `${c.label} (${c.n})` }))],
    };
  }, [data]);

  const adoption = useMemo<Adoption[]>(() => ALL_FEATURES.map((key) => {
    const a: Adoption = { key, used: 0, usedPrev: 0, live: 0, lapsed: 0, never: 0, volume: 0 };
    for (const m of segment) {
      const s = stateOf(m, key);
      a[s] += 1;
      const u = m.usage[key];
      if (u) {
        if (u.prev > 0) a.usedPrev += 1;
        a.volume += u.n;
      }
    }
    return a;
  }), [segment]);

  const kpis = useMemo(() => {
    const scanning = segment.filter(scans);
    const counts = scanning.map(usedCount).sort((a, b) => a - b);
    const avg = counts.length ? counts.reduce((s, n) => s + n, 0) / counts.length : 0;
    const median = counts.length ? counts[Math.floor(counts.length / 2)] : 0;
    return {
      total: segment.length,
      app: segment.filter(appInPeriod).length,
      app7: segment.filter((m) => !!m.lastAppAt && new Date(m.lastAppAt).getTime() >= d7).length,
      scanning: scanning.length,
      appNoScan: segment.filter((m) => appInPeriod(m) && !scans(m)).length,
      neverScanned: segment.filter((m) => !m.usage.stamps).length,
      avg,
      median,
    };
  }, [segment, appInPeriod, d7]);

  const byPlan = useMemo(() => {
    const groups: { key: PlanFilter; label: string; rows: UsageMerchant[] }[] = [
      { key: 'free', label: 'Free', rows: base.filter((m) => m.planKind === 'FREE') },
      { key: 'trial', label: 'Essai', rows: base.filter((m) => m.planKind === 'TRIAL') },
      { key: 'premium', label: 'Premium', rows: base.filter((m) => PREMIUM_KINDS.includes(m.planKind)) },
    ];
    return groups.map((g) => ({
      ...g,
      rates: Object.fromEntries(ALL_FEATURES.map((f) => [f, sharePct(g.rows.filter((m) => (m.usage[f]?.n ?? 0) > 0).length, g.rows.length)])) as Record<UsageFeature, number>,
    }));
  }, [base]);

  const list = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    const rows = segment.filter((m) => {
      if (feature && featureState && stateOf(m, feature) !== featureState) return false;
      if (feature && !featureState && stateOf(m, feature) !== 'used') return false;
      if (q && !`${m.nom} ${m.email} ${m.phone ?? ''} ${m.ville ?? ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
    const time = (s: string | null | undefined) => (s ? new Date(s).getTime() : 0);
    const cmp: Record<SortKey, (a: UsageMerchant, b: UsageMerchant) => number> = {
      most: (a, b) => usedCount(b) - usedCount(a) || b.clients - a.clients,
      least: (a, b) => usedCount(a) - usedCount(b) || b.clients - a.clients,
      app: (a, b) => time(b.lastAppAt) - time(a.lastAppAt),
      scan: (a, b) => time(b.usage.stamps?.last) - time(a.usage.stamps?.last),
      clients: (a, b) => b.clients - a.clients,
    };
    return [...rows].sort(cmp[sort] ?? cmp.most);
  }, [segment, feature, featureState, filters.search, sort]);

  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const pageRows = list.slice((Math.min(page, totalPages) - 1) * PAGE_SIZE, Math.min(page, totalPages) * PAGE_SIZE);

  const showMerchants = (f: UsageFeature, s: FeatureState) => {
    update({ feature: f, state: s });
    requestAnimationFrame(() => listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const columns: Column<UsageMerchant>[] = [
    { header: 'Commerce', render: (m) => <MerchantCell m={m} /> },
    { header: 'Plan', render: (m) => <PlanKindBadge kind={m.planKind} expiresAt={m.planExpiresAt} /> },
    { header: 'Clients', align: 'right', render: (m) => fmtNumber(m.clients) },
    { header: 'App Pro', render: (m) => <SeenCell date={m.lastAppAt} empty="Jamais vue" /> },
    { header: 'Dernier scan', render: (m) => <SeenCell date={m.usage.stamps?.last} empty="Aucun" /> },
    ...ALL_FEATURES.map((f): Column<UsageMerchant> => ({
      header: FEATURES[f].short,
      align: 'center',
      render: (m) => <Dot state={stateOf(m, f)} title={dotTitle(m, f)} />,
    })),
    { header: 'Total', align: 'right', render: (m) => <span className="num" style={{ color: usedCount(m) ? C.text : C.textMuted }}>{usedCount(m)}/{ALL_FEATURES.length}</span> },
  ];

  const exportList = async () => exportCsv(`usage-${days}j`, list, [
    { header: 'Commerce', value: (m) => m.nom },
    { header: 'Téléphone', value: (m) => m.phone },
    { header: 'Email', value: (m) => m.email },
    { header: 'Ville', value: (m) => m.ville },
    { header: 'Catégorie', value: (m) => CATEGORY_LABELS[m.categorie] ?? m.categorie },
    { header: 'Plan', value: (m) => m.planKind },
    { header: 'Clients', value: (m) => m.clients },
    { header: 'App Pro (dernière ouverture)', value: (m) => m.lastAppAt?.slice(0, 10) ?? '' },
    { header: 'Dernier scan', value: (m) => m.usage.stamps?.last?.slice(0, 10) ?? '' },
    ...ALL_FEATURES.map((f) => ({ header: FEATURES[f].label, value: (m: UsageMerchant) => `${STATE[stateOf(m, f)].label}${m.usage[f]?.n ? ` (${m.usage[f]!.n})` : ''}` })),
    { header: 'Fonctionnalités utilisées', value: (m) => usedCount(m) },
  ]);

  return (
    <div style={{ paddingBottom: 48 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontWeight: 600, fontSize: 19 }}>Usage des fonctionnalités</h1>
          <p style={{ margin: '2px 0 0', fontSize: 12.5, color: C.textMuted }}>
            Ce que les commerçants utilisent vraiment dans l'app Pro, sur les {days} derniers jours
            {data && <> · données de {fmtTime(data.generatedAt)}</>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Segmented options={PERIODS} value={`${days}` as `${InsightPeriod}`} onChange={(v) => update({ days: v })} />
          <button onClick={() => load(days)} disabled={loading} style={S.btnOutline()}>{loading ? 'Chargement…' : 'Actualiser'}</button>
        </div>
      </div>

      <FilterBar>
        <PillGroup label="Plan" options={PLAN_OPTIONS} value={plan} onChange={(v) => update({ plan: v })} />
        <SelectFilter value={activity} onChange={(v) => update({ activity: v })} options={ACTIVITY_OPTIONS} />
        <SelectFilter value={filters.cat} onChange={(v) => update({ cat: v })} options={facets.cats} />
        <SelectFilter value={filters.city} onChange={(v) => update({ city: v })} options={facets.cities} />
        {active && <button onClick={reset} style={{ ...S.btnGhost(), fontSize: 12.5 }}>Réinitialiser</button>}
      </FilterBar>

      {error && <div style={{ ...S.card, borderColor: C.red, color: C.red, marginBottom: 16, whiteSpace: 'pre-line' }}>{error}</div>}
      {!data && !error && <Empty>Chargement…</Empty>}

      {data && (
        <>
          {data.truncated && (
            <p style={{ fontSize: 12.5, color: C.amber, margin: '0 0 12px' }}>
              Seuls les {fmtNumber(data.merchants.length)} comptes les plus récents sont analysés.
            </p>
          )}

          <div style={{ marginBottom: 16 }}>
            <KpiStrip
              items={[
                { label: 'Comptes analysés', value: fmtNumber(kpis.total), sub: 'actifs, non supprimés' },
                {
                  label: `App Pro ouverte · ${days} j`,
                  value: fmtNumber(kpis.app),
                  sub: <>{sharePct(kpis.app, kpis.total)} % · {fmtNumber(kpis.app7)} sur 7 j</>,
                  hint: 'Le propriétaire ou un membre de l\'équipe a utilisé l\'app Pro',
                },
                {
                  label: `Scannent · ${days} j`,
                  value: fmtNumber(kpis.scanning),
                  sub: <>{sharePct(kpis.scanning, kpis.total)} % des comptes</>,
                  onClick: () => update({ activity: 'scanning' }),
                },
                {
                  label: 'Ouvrent l\'app sans scanner',
                  value: fmtNumber(kpis.appNoScan),
                  tone: kpis.appNoScan ? C.amber : undefined,
                  sub: 'à accompagner',
                  hint: 'Ils ouvrent l\'app Pro mais n\'ajoutent aucun tampon : souvent bloqués sur le premier scan',
                  onClick: () => update({ activity: 'appNoScan' }),
                },
                {
                  label: 'Jamais scanné',
                  value: fmtNumber(kpis.neverScanned),
                  tone: kpis.neverScanned ? C.red : undefined,
                  sub: <>{sharePct(kpis.neverScanned, kpis.total)} % des comptes</>,
                  onClick: () => showMerchants('stamps', 'never'),
                },
                {
                  label: 'Fonctionnalités par commerçant actif',
                  value: kpis.avg.toLocaleString('fr-FR', { maximumFractionDigits: 1 }),
                  sub: <>médiane {kpis.median} sur {ALL_FEATURES.length}</>,
                  hint: 'Parmi les commerçants qui scannent sur la période, scan compris',
                },
              ]}
            />
          </div>

          <Card
            title={<>Adoption <span style={{ color: C.textMuted, fontWeight: 400 }}>· {fmtNumber(segment.length)} comptes</span></>}
            right={<span style={{ fontSize: 12, color: C.textMuted }}>Cliquez un nombre pour voir les commerçants</span>}
            style={{ marginBottom: 16, padding: 0 }}
          >
            <div style={{ overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    {['Fonctionnalité', 'Utilisée', 'vs période préc.', 'En place, pas utilisée', 'Abandonnée', 'Jamais', 'Volume'].map((h, i) => (
                      <th key={h} style={{ textAlign: i === 0 ? 'left' : i === 1 ? 'left' : 'right', padding: '8px 12px', color: C.textMuted, fontWeight: 500, fontSize: 12, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {GROUPS.map((g) => (
                    <FeatureGroupRows key={g.title} title={g.title} rows={adoption.filter((a) => g.keys.includes(a.key))} total={segment.length} onPick={showMerchants} />
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="stack-sm" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(280px, 1fr)', gap: 16, marginBottom: 16 }}>
            <Card title="Utilisation par plan" right={<span style={{ fontSize: 12, color: C.textMuted }}>% des comptes du plan, sur la période</span>}>
              <div style={{ overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                      <th style={{ textAlign: 'left', padding: '6px 8px', color: C.textMuted, fontWeight: 500, fontSize: 12 }}>Fonctionnalité</th>
                      {byPlan.map((p) => (
                        <th key={p.key} style={{ textAlign: 'right', padding: '6px 8px', color: C.textMuted, fontWeight: 500, fontSize: 12, whiteSpace: 'nowrap' }}>
                          {p.label} <span className="num" style={{ fontWeight: 400 }}>({fmtNumber(p.rows.length)})</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ALL_FEATURES.map((f) => {
                      const top = Math.max(...byPlan.map((p) => p.rates[f]));
                      return (
                        <tr key={f} style={{ borderBottom: `1px solid ${C.borderLight}` }}>
                          <td style={{ padding: '6px 8px' }} title={FEATURES[f].hint}>{FEATURES[f].label}</td>
                          {byPlan.map((p) => (
                            <td key={p.key} className="num" style={{ padding: '6px 8px', textAlign: 'right', color: p.rows.length === 0 ? C.textMuted : p.rates[f] === top && top > 0 ? C.text : C.textMuted, fontWeight: p.rates[f] === top && top > 0 ? 500 : 400 }}>
                              {p.rows.length ? `${p.rates[f]} %` : '—'}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card title="Réglages du programme" right={<span style={{ fontSize: 12, color: C.textMuted }}>état actuel</span>}>
              <ShareList
                total={segment.length}
                color={C.primary}
                items={[
                  { label: 'Récompense configurée', value: segment.filter((m) => m.live.includes('rewards')).length },
                  { label: 'Cadeau de bienvenue activé', value: segment.filter((m) => m.live.includes('welcome')).length },
                  { label: 'Tampons selon le montant', value: segment.filter((m) => m.settings.perAmount).length, hint: 'Sinon : un tampon par visite' },
                  { label: 'Expiration des tampons', value: segment.filter((m) => m.settings.stampExpiry).length },
                  { label: 'Plusieurs boutiques', value: segment.filter((m) => m.settings.multiStore).length },
                  { label: 'Réservation activée', value: segment.filter((m) => m.live.includes('booking')).length },
                  { label: 'Onboarding Pro terminé', value: segment.filter((m) => m.onboarded).length },
                ]}
              />
            </Card>
          </div>

          <div ref={listRef} style={{ scrollMarginTop: 16 }}>
            <Card
              title={<>Commerçant par commerçant <span className="num" style={{ color: C.textMuted, fontWeight: 400 }}>{fmtNumber(list.length)}</span></>}
              right={list.length > 0 && <ExportButton small label="CSV" onExport={exportList} />}
              style={{ padding: 0 }}
            >
              <div style={{ padding: '0 16px', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <SearchInput value={searchText} onChange={setSearchText} placeholder="Nom, téléphone, e-mail, ville" width={240} />
                <SelectFilter
                  value={feature ?? ''}
                  onChange={(v) => update({ feature: v, state: v ? featureState ?? 'never' : '' })}
                  options={[{ value: '', label: 'Toutes les fonctionnalités' }, ...ALL_FEATURES.map((f) => ({ value: f, label: FEATURES[f].label }))]}
                />
                {feature && (
                  <SelectFilter
                    value={featureState ?? 'used'}
                    onChange={(v) => update({ state: v })}
                    options={(Object.keys(STATE) as FeatureState[]).map((s) => ({ value: s, label: STATE[s].label }))}
                    style={{ borderColor: C.ink, color: C.text }}
                  />
                )}
                <SelectFilter value={sort} onChange={(v) => update({ sort: v })} options={SORT_OPTIONS} />
                <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 12, fontSize: 12, color: C.textMuted, flexWrap: 'wrap' }}>
                  {(Object.keys(STATE) as FeatureState[]).map((s) => (
                    <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}><Dot state={s} title={STATE[s].label} />{STATE[s].label}</span>
                  ))}
                </span>
              </div>
              <div style={{ padding: '8px 6px' }}>
                {list.length === 0 ? <Empty>Aucun commerçant ne correspond.</Empty> : (
                  <DataTable rows={pageRows} rowKey={(m) => m.id} onRowClick={(m) => navigate(`/merchants/${m.id}`)} columns={columns} />
                )}
              </div>
              <div style={{ padding: '0 16px 12px' }}>
                <Pagination page={Math.min(page, totalPages)} totalPages={totalPages} total={list.length} onPage={(p) => update({ page: p })} />
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function FeatureGroupRows({ title, rows, total, onPick }: { title: string; rows: Adoption[]; total: number; onPick: (f: UsageFeature, s: FeatureState) => void }) {
  return (
    <>
      <tr>
        <td colSpan={7} style={{ padding: '12px 12px 4px', fontSize: 12, fontWeight: 600, color: C.textMuted }}>{title}</td>
      </tr>
      {rows.map((a) => {
        const meta = FEATURES[a.key];
        const rate = sharePct(a.used, total);
        return (
          <tr key={a.key} style={{ borderBottom: `1px solid ${C.borderLight}` }}>
            <td style={{ padding: '8px 12px', minWidth: 180 }}>
              <div style={{ fontWeight: 500 }}>{meta.label}</div>
              <div style={{ fontSize: 12, color: C.textMuted, maxWidth: 320 }}>{meta.hint}</div>
            </td>
            <td style={{ padding: '8px 12px', minWidth: 200 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, height: 6, borderRadius: 3, background: C.surfaceAlt, overflow: 'hidden', minWidth: 60 }}>
                  <div style={{ width: `${Math.min(100, rate)}%`, height: '100%', background: C.green }} />
                </div>
                <CountButton n={a.used} total={total} onClick={() => onPick(a.key, 'used')} strong />
              </div>
            </td>
            <td style={{ padding: '8px 12px', textAlign: 'right' }} title={`${fmtNumber(a.usedPrev)} commerçants sur la période précédente`}>
              <Delta now={a.used} before={a.usedPrev} />
            </td>
            <td style={{ padding: '8px 12px', textAlign: 'right' }}>
              <CountButton n={a.live} total={total} color={C.amber} onClick={() => onPick(a.key, 'live')} />
            </td>
            <td style={{ padding: '8px 12px', textAlign: 'right' }}>
              <CountButton n={a.lapsed} total={total} color={C.red} onClick={() => onPick(a.key, 'lapsed')} />
            </td>
            <td style={{ padding: '8px 12px', textAlign: 'right' }}>
              <CountButton n={a.never} total={total} color={C.textMuted} onClick={() => onPick(a.key, 'never')} />
            </td>
            <td className="num" style={{ padding: '8px 12px', textAlign: 'right', whiteSpace: 'nowrap', color: a.volume ? C.text : C.textMuted }}>
              {fmtNumber(a.volume)} <span style={{ fontSize: 12, color: C.textMuted }}>{meta.unit}</span>
            </td>
          </tr>
        );
      })}
    </>
  );
}
