import React, { useCallback, useEffect, useState } from 'react';
import { getErrorMessage } from '@jitplus/shared';
import {
  createServiceTemplate,
  getBookingStats,
  getCustomServiceSuggestions,
  getServiceTemplates,
  updateServiceTemplate,
  type AdminBookingStats,
  type AdminCustomServiceSuggestion,
  type AdminServiceTemplate,
} from '../api';
import { C, S } from '../theme';
import { fmtNumber, tableCellStyle, tableHeaderStyle } from '../utils/format';
import { FilterBar, PageHeader, SelectFilter, useToast } from '../components/ui';
import StatCard from '../components/StatCard';

const CATEGORIES = [
  'COIFFURE', 'BEAUTE', 'HAMMAM', 'SPORT', 'OPTIQUE', 'AUTO', 'ANIMALERIE', 'SALLE_JEU', 'TELEPHONE', 'RESTAURANT',
  'CAFE', 'EPICERIE', 'BOULANGERIE', 'PHARMACIE', 'LIBRAIRIE', 'VETEMENTS', 'ELECTRONIQUE', 'SUPERMARCHE', 'BOUCHERIE',
  'PATISSERIE', 'FASTFOOD', 'FLEURISTE', 'BIJOUTERIE', 'BRICOLAGE', 'HOTEL', 'PARFUMERIE', 'TRAITEUR', 'LOCATION_VOITURE', 'AUTRE',
];
const CAT_LABEL = (c: string) => c.charAt(0) + c.slice(1).toLowerCase().replace(/_/g, ' ');

const STATUS_LABELS: Record<string, string> = {
  CONFIRMED: 'Confirmés', CHECKED_IN: 'Arrivés', COMPLETED: 'Terminés', NO_SHOW: 'Absents',
  CANCELLED_CLIENT: 'Annulés (client)', CANCELLED_MERCHANT: 'Annulés (commerçant)', DECLINED: 'Refusés',
  EXPIRED: 'Expirés', PENDING: 'En attente',
};

/**
 * Booking back-office: adoption, the catalogue of service names per category
 * (durations and prices are always set by merchants), and the custom services
 * merchants create most, to add to the catalogue in one click.
 */
export default function Booking() {
  const [stats, setStats] = useState<AdminBookingStats | null>(null);
  const [templates, setTemplates] = useState<AdminServiceTemplate[]>([]);
  const [suggestions, setSuggestions] = useState<AdminCustomServiceSuggestion[]>([]);
  const [category, setCategory] = useState('COIFFURE');
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, showToast] = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, t, c] = await Promise.all([
        getBookingStats(),
        getServiceTemplates(category || undefined),
        getCustomServiceSuggestions(category || undefined),
      ]);
      setStats(s);
      setTemplates(t);
      setSuggestions(c);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [category]);

  useEffect(() => { void load(); }, [load]);

  const add = async (cat: string, nom: string) => {
    if (!cat || nom.trim().length < 2) return;
    try {
      // Last of its category (the list holds every category when unfiltered).
      const order = templates.filter((t) => t.category === cat).reduce((max, t) => Math.max(max, t.order), 0) + 1;
      await createServiceTemplate({ category: cat, nom: nom.trim(), order });
      showToast(`« ${nom.trim()} » ajouté au catalogue`);
      setNewName('');
      await load();
    } catch (e) {
      showToast(getErrorMessage(e), 'error');
    }
  };

  const patch = async (t: AdminServiceTemplate, body: Parameters<typeof updateServiceTemplate>[1]) => {
    try {
      await updateServiceTemplate(t.id, body);
      await load();
    } catch (e) {
      showToast(getErrorMessage(e), 'error');
    }
  };

  const rename = (t: AdminServiceTemplate) => {
    const nom = window.prompt('Nouveau nom', t.nom);
    if (nom && nom.trim() !== t.nom) void patch(t, { nom: nom.trim() });
  };

  const rate = stats?.last30Days.attendanceRate;

  return (
    <div>
      {toast}
      <PageHeader
        title="Réservations"
        subtitle="Ouvert à tous les commerçants. Le catalogue ne propose que des noms : la durée et le prix sont toujours fixés par le commerçant."
      />

      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
          <StatCard label="Commerçants actifs" value={fmtNumber(stats.merchantsEnabled)} sub={`${fmtNumber(stats.merchantsConfigured)} ont commencé la configuration`} />
          <StatCard label="RDV à venir" value={fmtNumber(stats.upcomingBookings)} />
          <StatCard label="Réservés depuis l'app (30 j)" value={fmtNumber(stats.last30Days.bookedFromApp)} />
          <StatCard
            label="Taux de présence (30 j)"
            value={rate === null || rate === undefined ? '—' : `${Math.round(rate * 100)} %`}
            sub="arrivés / (arrivés + absents)"
          />
          <StatCard label="Prestations personnalisées" value={fmtNumber(stats.customServices)} />
        </div>
      )}

      {stats && Object.keys(stats.last30Days.byStatus).length > 0 && (
        <div style={{ ...S.card, marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {Object.entries(stats.last30Days.byStatus).map(([k, v]) => (
            <span key={k} style={S.badge(C.textMuted)}>{STATUS_LABELS[k] ?? k} : {fmtNumber(v)}</span>
          ))}
        </div>
      )}

      <FilterBar>
        <SelectFilter
          value={category}
          onChange={setCategory}
          options={[{ value: '', label: 'Toutes les catégories' }, ...CATEGORIES.map((c) => ({ value: c, label: CAT_LABEL(c) }))]}
        />
      </FilterBar>

      {loading ? (
        <p style={{ color: C.textMuted }}>Chargement…</p>
      ) : error ? (
        <p style={{ color: C.red }}>{error}</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 16, alignItems: 'start' }}>
          <div style={S.card}>
            <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>Catalogue {category ? `· ${CAT_LABEL(category)}` : ''}</h3>
            {category && (
              <form
                onSubmit={(e) => { e.preventDefault(); void add(category, newName); }}
                style={{ display: 'flex', gap: 8, marginBottom: 12 }}
              >
                <input style={S.input} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nom de la prestation (ex. Coupe homme)" maxLength={120} />
                <button type="submit" style={S.btn()} disabled={newName.trim().length < 2}>Ajouter</button>
              </form>
            )}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}`, textAlign: 'left' }}>
                  {[...(category ? [] : ['Catégorie']), 'Prestation', 'Utilisée par', ''].map((h) => (
                    <th key={h} style={tableHeaderStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {templates.map((t) => (
                  <tr key={t.id} style={{ borderBottom: `1px solid ${C.borderLight}`, opacity: t.isActive ? 1 : 0.5 }}>
                    {!category && <td style={{ ...tableCellStyle, color: C.textMuted }}>{CAT_LABEL(t.category)}</td>}
                    <td style={{ ...tableCellStyle, fontWeight: 600 }}>{t.nom}</td>
                    <td style={{ ...tableCellStyle, color: C.textMuted }}>{fmtNumber(t._count.services)}</td>
                    <td style={{ ...tableCellStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button style={S.btnGhost()} onClick={() => rename(t)}>Renommer</button>
                      <button style={S.btnGhost(t.isActive ? C.red : C.green)} onClick={() => void patch(t, { isActive: !t.isActive })}>
                        {t.isActive ? 'Masquer' : 'Réactiver'}
                      </button>
                    </td>
                  </tr>
                ))}
                {!templates.length && (
                  <tr><td colSpan={4} style={{ ...tableCellStyle, color: C.textMuted }}>Aucune prestation dans le catalogue.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={S.card}>
            <h3 style={{ margin: '0 0 4px', fontSize: 15 }}>Prestations créées par les commerçants</h3>
            <p style={{ margin: '0 0 12px', fontSize: 12.5, color: C.textMuted }}>
              Absentes du catalogue, les plus fréquentes en premier. Un clic les ajoute au catalogue de leur catégorie.
            </p>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}`, textAlign: 'left' }}>
                  {[...(category ? [] : ['Catégorie']), 'Prestation', 'Commerçants', 'Durée moy.', ''].map((h) => (
                    <th key={h} style={tableHeaderStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {suggestions.map((s) => (
                  <tr key={`${s.category}:${s.nom}`} style={{ borderBottom: `1px solid ${C.borderLight}` }}>
                    {!category && <td style={{ ...tableCellStyle, color: C.textMuted }}>{CAT_LABEL(s.category)}</td>}
                    <td style={{ ...tableCellStyle, fontWeight: 600 }}>{s.nom}</td>
                    <td style={tableCellStyle}>{fmtNumber(s.merchants)}</td>
                    <td style={{ ...tableCellStyle, color: C.textMuted }}>{s.avgDurationMin} min</td>
                    <td style={{ ...tableCellStyle, textAlign: 'right' }}>
                      <button style={{ ...S.btnOutline(C.primary), padding: '5px 12px', fontSize: 12 }} onClick={() => void add(s.category, s.nom)}>
                        Ajouter au catalogue
                      </button>
                    </td>
                  </tr>
                ))}
                {!suggestions.length && (
                  <tr><td colSpan={5} style={{ ...tableCellStyle, color: C.textMuted }}>Aucune prestation personnalisée pour l'instant.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
