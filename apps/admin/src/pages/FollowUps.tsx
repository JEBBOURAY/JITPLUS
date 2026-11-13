import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getErrorMessage } from '@jitplus/shared';
import { getFollowUps, updateMerchantFollowUp } from '../api';
import type { FollowUpRow, FollowUpStatus, FollowUpsResponse } from '../types';
import { DataTable, type Column } from '../components/charts';
import { ContactButtons, MerchantCell, PlanKindBadge, QuickNoteModal } from '../components/crm';
import { Dash, Divider, ExportButton, FilterBar, LastActivity, PageHeader, Pagination, SearchInput, pillStyle, useToast } from '../components/ui';
import { C, S } from '../theme';
import { fmtNumber, fmtRelative } from '../utils/format';
import { FOLLOW_UP_ORDER, FOLLOW_UP_STATUS, NOTE_KIND, WA_TEMPLATES, fmtDue } from '../utils/crm';
import { exportCsv, fetchAllPages } from '../utils/csv';
import { useDebouncedInput, useUrlFilters } from '../utils/useUrlFilters';

const DEFAULTS = { search: '', status: '', due: '', closed: '' };

const DUE = [
  { value: '', label: 'Toutes échéances' },
  { value: 'overdue', label: 'En retard' },
  { value: 'today', label: 'À faire aujourd\'hui' },
  { value: 'week', label: '7 prochains jours' },
  { value: 'none', label: 'Sans relance prévue' },
];

/** Inline status picker: changing it saves immediately. */
function StatusSelect({ row, onSaved }: { row: FollowUpRow; onSaved: () => void }) {
  const [busy, setBusy] = useState(false);
  const status = row.followUp?.status ?? 'TO_CONTACT';
  return (
    <select
      value={status}
      disabled={busy}
      onClick={(e) => e.stopPropagation()}
      onChange={async (e) => {
        setBusy(true);
        try { await updateMerchantFollowUp(row.id, { status: e.target.value as FollowUpStatus }); onSaved(); } finally { setBusy(false); }
      }}
      style={{ ...S.input, width: 'auto', padding: '3px 6px', fontSize: 12.5, borderColor: 'transparent', background: 'transparent', color: FOLLOW_UP_STATUS[status].color, fontWeight: 500, cursor: 'pointer' }}
    >
      {FOLLOW_UP_ORDER.map((s) => <option key={s} value={s}>{FOLLOW_UP_STATUS[s].label}</option>)}
    </select>
  );
}

export default function FollowUps() {
  const navigate = useNavigate();
  const { filters, page, update, reset, active } = useUrlFilters(DEFAULTS);
  const [search, setSearch] = useDebouncedInput(filters.search, (v) => update({ search: v }));
  const [data, setData] = useState<FollowUpsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [noteFor, setNoteFor] = useState<FollowUpRow | null>(null);
  const [toastNode, showToast] = useToast();

  const params = useCallback((p: number, limit = 30) => ({
    page: p,
    limit,
    search: filters.search || undefined,
    status: (filters.status || '') as FollowUpStatus | '',
    due: filters.due as '' | 'overdue' | 'today' | 'week' | 'none',
    closed: (filters.closed || '') as '' | '1',
  }), [filters]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await getFollowUps(params(page)));
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [params, page]);

  useEffect(() => { load(); }, [load]);

  const c = data?.counts;

  const columns: Column<FollowUpRow>[] = [
    {
      header: 'Commerce',
      render: (r) => <MerchantCell m={r} />,
    },
    { header: 'Statut', render: (r) => <StatusSelect row={r} onSaved={load} /> },
    {
      header: 'Prochaine action',
      render: (r) => {
        const due = fmtDue(r.followUp?.nextActionAt);
        return (
          <div style={{ minWidth: 140 }}>
            <span style={{ color: due.color, fontSize: 12.5, fontWeight: due.color === C.red ? 500 : 400 }}>{due.text}</span>
            {r.followUp?.nextAction && <div style={{ fontSize: 12.5 }}>{r.followUp.nextAction}</div>}
          </div>
        );
      },
    },
    {
      header: 'Dernier contact',
      render: (r) => r.lastNote ? (
        <div style={{ maxWidth: 320 }}>
          <div style={{ fontSize: 12, color: C.textMuted }}>
            {NOTE_KIND[r.lastNote.kind].label} · {fmtRelative(r.lastNote.createdAt).toLowerCase()}{r.lastNote.adminEmail ? ` · ${r.lastNote.adminEmail.split('@')[0]}` : ''}
            {r.noteCount > 1 && <> · {r.noteCount} notes</>}
          </div>
          <div style={{ fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.lastNote.body}>{r.lastNote.body}</div>
        </div>
      ) : <Dash />,
    },
    { header: 'Plan', render: (r) => <PlanKindBadge kind={r.planKind} expiresAt={r.planExpiresAt} /> },
    { header: 'Clients', align: 'right', render: (r) => fmtNumber(r.clients) },
    { header: 'Dernier scan', render: (r) => <LastActivity date={r.lastActivityAt} /> },
    { header: '', align: 'right', render: (r) => <ContactButtons phone={r.phone} email={r.email} waText={WA_TEMPLATES.generic(r.nom)} onNote={() => setNoteFor(r)} /> },
  ];

  const exportAll = async (progress: (n: number) => void) => {
    const all = await fetchAllPages(async (p, limit) => {
      const res = await getFollowUps(params(p, limit));
      return { rows: res.followUps, totalPages: res.pagination.totalPages };
    }, progress);
    exportCsv('suivi-commercants', all, [
      { header: 'Commerce', value: (r) => r.nom },
      { header: 'Téléphone', value: (r) => r.phone },
      { header: 'Email', value: (r) => r.email },
      { header: 'Ville', value: (r) => r.ville },
      { header: 'Statut', value: (r) => (r.followUp ? FOLLOW_UP_STATUS[r.followUp.status].label : '') },
      { header: 'Prochaine relance', value: (r) => r.followUp?.nextActionAt?.slice(0, 10) },
      { header: 'Action prévue', value: (r) => r.followUp?.nextAction },
      { header: 'Responsable', value: (r) => r.followUp?.owner },
      { header: 'Dernier contact', value: (r) => r.lastNote?.createdAt.slice(0, 10) },
      { header: 'Dernière note', value: (r) => r.lastNote?.body },
      { header: 'Clients', value: (r) => r.clients },
      { header: 'Transactions 30 j', value: (r) => r.transactions30d },
    ]);
  };

  return (
    <div style={{ paddingBottom: 48 }}>
      {toastNode}
      <PageHeader
        title="Suivi commercial"
        count={data?.pagination.total}
        subtitle="Commerçants suivis par l'équipe : où ils en sont, ce qui a été dit, quand les relancer. Ajoutez-en depuis la fiche d'un commerçant ou le tableau de bord."
        right={<>
          <SearchInput value={search} onChange={setSearch} placeholder="Nom, email ou téléphone…" width={240} />
          <ExportButton onExport={exportAll} />
        </>}
      />

      {/* Pipeline counts double as the status filter */}
      {c && (
        <div style={{ ...S.card, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', marginBottom: 14 }}>
          {[
            { key: '', label: 'En cours', value: c.byStatus.TO_CONTACT + c.byStatus.CONTACTED + c.byStatus.INTERESTED + c.byStatus.ONBOARDING, color: C.text },
            ...FOLLOW_UP_ORDER.map((s) => ({ key: s, label: FOLLOW_UP_STATUS[s].label, value: c.byStatus[s], color: FOLLOW_UP_STATUS[s].color })),
          ].map((it, i) => {
            const on = filters.status === it.key && (it.key !== '' || !filters.closed);
            return (
              <button
                key={it.key || 'open'}
                onClick={() => update({ status: it.key, closed: '' })}
                className="row-link"
                style={{ textAlign: 'left', padding: '10px 14px', border: 'none', borderLeft: i ? `1px solid ${C.borderLight}` : 'none', borderBottom: `2px solid ${on ? C.ink : 'transparent'}`, background: 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                <div style={{ fontSize: 12, color: C.textMuted, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {it.key && <span style={{ width: 7, height: 7, borderRadius: 2, background: it.color }} />}
                  {it.label}
                </div>
                <div className="num" style={{ fontSize: 20, color: C.text }}>{it.value}</div>
              </button>
            );
          })}
        </div>
      )}

      <FilterBar>
        {DUE.map((o) => {
          const n = o.value === 'overdue' ? c?.overdue : o.value === 'today' ? (c ? c.overdue + c.dueToday : undefined) : o.value === 'none' ? c?.unplanned : undefined;
          return (
            <button key={o.value} onClick={() => update({ due: o.value })} style={{ ...pillStyle(filters.due === o.value), ...(o.value === 'overdue' && n ? { color: filters.due === o.value ? C.onInk : C.red } : {}) }}>
              {o.label}{n !== undefined ? ` · ${n}` : ''}
            </button>
          );
        })}
        <Divider />
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: C.textMuted, cursor: 'pointer' }}>
          <input type="checkbox" checked={filters.closed === '1'} onChange={(e) => update({ closed: e.target.checked ? '1' : '', status: '' })} />
          Inclure convertis et perdus
        </label>
        {active && <button onClick={reset} style={{ ...S.btnGhost(C.red), fontSize: 12.5 }}>Réinitialiser</button>}
      </FilterBar>

      <div style={{ ...S.card, padding: '4px 6px' }}>
        {loading && !data ? (
          <p style={{ color: C.textMuted, margin: 12 }}>Chargement…</p>
        ) : error ? (
          <p style={{ color: C.red, margin: 12 }}>{error}</p>
        ) : !data || data.followUps.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 16px', color: C.textMuted }}>
            <p style={{ margin: 0 }}>Aucun commerçant suivi avec ces filtres.</p>
            <p style={{ margin: '6px 0 0', fontSize: 12.5 }}>
              Commencez par les <Link to="/" style={{ color: C.primary }}>essais qui expirent et les démarrages bloqués</Link> du tableau de bord.
            </p>
          </div>
        ) : (
          <div style={{ opacity: loading ? 0.6 : 1 }}>
            <DataTable rows={data.followUps} columns={columns} rowKey={(r) => r.id} onRowClick={(r) => navigate(`/merchants/${r.id}`)} />
          </div>
        )}
        {data && (
          <div style={{ padding: '0 8px 8px' }}>
            <Pagination page={page} totalPages={data.pagination.totalPages} total={data.pagination.total} onPage={(p) => update({ page: p })} />
          </div>
        )}
      </div>

      <QuickNoteModal
        open={!!noteFor}
        merchant={noteFor}
        currentStatus={noteFor?.followUp?.status}
        onClose={() => setNoteFor(null)}
        onSaved={() => { showToast('Suivi enregistré'); load(); }}
      />
    </div>
  );
}
