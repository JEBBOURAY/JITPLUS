import React, { useCallback, useEffect, useState } from 'react';
import {
  countMerchantNewsAudience,
  getMerchantNotificationStats,
  sendMerchantNews,
  type MerchantNewsAudience,
  type MerchantNotifyResult,
} from '../api';
import { C, S } from '../theme';
import { getErrorMessage } from '@jitplus/shared';

/** Screens the push can open (backend MERCHANT_PUSH_ACTIONS). */
const ACTIONS: { key: string; label: string }[] = [
  { key: '', label: 'Boîte de notifications (par défaut)' },
  { key: 'open_dashboard', label: 'Accueil' },
  { key: 'open_scan', label: 'Scanner' },
  { key: 'open_clients', label: 'Clients' },
  { key: 'open_messages', label: 'Messages (push / email / WhatsApp)' },
  { key: 'open_settings', label: 'Carte de fidélité' },
  { key: 'open_logo', label: 'Compte / logo' },
  { key: 'open_plan', label: 'Forfait Premium' },
  { key: 'open_referral', label: 'Parrainage' },
  { key: 'open_deals', label: 'Bons plans' },
  { key: 'open_lucky_wheel', label: 'Roue de la chance' },
  { key: 'open_scratch_campaigns', label: 'Cartes à gratter' },
  { key: 'open_stamp_codes', label: 'Codes tampons (e-commerce)' },
  { key: 'open_team', label: 'Équipe' },
  { key: 'open_stores', label: 'Points de vente' },
  { key: 'open_client_qr', label: 'QR code à afficher' },
  { key: 'open_quick_add', label: 'Ajout rapide' },
  { key: 'open_games', label: 'Jeux' },
  { key: 'open_support', label: 'WhatsApp support' },
];

const CATEGORIES = [
  'CAFE', 'RESTAURANT', 'EPICERIE', 'BOULANGERIE', 'PHARMACIE', 'LIBRAIRIE', 'VETEMENTS', 'ELECTRONIQUE', 'COIFFURE', 'BEAUTE', 'SPORT', 'SUPERMARCHE', 'BOUCHERIE', 'PATISSERIE', 'FASTFOOD', 'HAMMAM', 'ANIMALERIE', 'FLEURISTE', 'BIJOUTERIE', 'OPTIQUE', 'TELEPHONE', 'BRICOLAGE', 'AUTO', 'HOTEL', 'PARFUMERIE', 'TRAITEUR', 'LOCATION_VOITURE', 'SALLE_JEU', 'AUTRE',
];

const RESULT_LABELS: Record<MerchantNotifyResult, string> = {
  sent: 'Envoyés',
  inbox_only: 'Boîte uniquement',
  duplicate: 'Doublons',
  opted_out: 'Désactivé par le commerçant',
  capped: 'Limite de fréquence',
  quiet_hours: 'Heures calmes (non envoyé)',
  no_device: 'Sans appareil',
  stale_token: 'Token expiré',
  error: 'Erreur',
};

const CAT_LABELS: Record<string, string> = {
  SECURITY: 'Sécurité', PLAN: 'Forfait', STATUS: 'Compte', QUOTA: 'Quota', ACTIVITY: 'Bilans',
  TIP: 'Conseils', SETUP: 'Configuration', OFFER: 'Offres', NEWS: 'Nouveautés', REMINDER: 'Rappels',
};

const label: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: C.textMuted, marginBottom: 6 };
const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)} %` : '—');

export default function MerchantNews() {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [action, setAction] = useState('');
  const [audience, setAudience] = useState<MerchantNewsAudience>({});
  const [count, setCount] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ recipientCount: number; results: Partial<Record<MerchantNotifyResult, number>> } | null>(null);
  const [stats, setStats] = useState<Array<{ category: string; sent: number; opened: number; read: number }>>([]);

  const loadStats = useCallback(() => {
    getMerchantNotificationStats(30).then((r) => setStats(r.categories)).catch(() => {});
  }, []);
  useEffect(loadStats, [loadStats]);

  useEffect(() => {
    const timer = setTimeout(() => {
      countMerchantNewsAudience(audience).then((r) => setCount(r.count)).catch(() => setCount(null));
    }, 300);
    return () => clearTimeout(timer);
  }, [audience]);

  const doSend = async () => {
    setConfirm(false);
    setSending(true);
    setError('');
    setResult(null);
    try {
      const res = await sendMerchantNews({ ...audience, title: title.trim(), body: body.trim(), ...(action ? { action } : {}) });
      setResult(res);
      setTitle('');
      setBody('');
      loadStats();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSending(false);
    }
  };

  const canSend = title.trim().length > 0 && body.trim().length > 0 && !sending;

  return (
    <div style={{ maxWidth: 760 }}>
      <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, color: C.text }}>Nouveautés JitPlus Pro</h1>
      <p style={{ margin: '0 0 20px', fontSize: 13, color: C.textMuted }}>
        Annonce ciblée aux commerçants. Elle arrive dans leur boîte de notifications et en push. Elle respecte leur
        réglage « Nouveautés » et les heures calmes (pas d'envoi entre 21 h et 9 h, ni le vendredi midi).
      </p>

      <div style={{ ...S.card, marginBottom: 16 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: C.text }}>1. Audience</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
          <div>
            <span style={label}>Forfait</span>
            <select style={S.input} value={audience.plan ?? ''} onChange={(e) => setAudience((a) => ({ ...a, plan: (e.target.value || undefined) as MerchantNewsAudience['plan'] }))}>
              <option value="">Tous</option>
              <option value="FREE">Gratuit</option>
              <option value="PREMIUM">Premium</option>
            </select>
          </div>
          <div>
            <span style={label}>Ville</span>
            <input style={S.input} placeholder="Toutes" value={audience.ville ?? ''} onChange={(e) => setAudience((a) => ({ ...a, ville: e.target.value || undefined }))} />
          </div>
          <div>
            <span style={label}>Catégorie</span>
            <select style={S.input} value={audience.categorie ?? ''} onChange={(e) => setAudience((a) => ({ ...a, categorie: e.target.value || undefined }))}>
              <option value="">Toutes</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <span style={label}>Inscrits depuis (jours)</span>
            <input style={S.input} type="number" min={0} placeholder="0" value={audience.minAccountAgeDays ?? ''} onChange={(e) => setAudience((a) => ({ ...a, minAccountAgeDays: e.target.value ? Number(e.target.value) : undefined }))} />
          </div>
        </div>
        <div style={{ marginTop: 12, fontSize: 13, color: C.text }}>
          {count === null ? '…' : <><strong>{count}</strong> commerçant{count > 1 ? 's' : ''} ciblé{count > 1 ? 's' : ''}</>}
        </div>
      </div>

      <div style={{ ...S.card, marginBottom: 16 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: C.text }}>2. Message</h3>
        <span style={label}>Titre ({title.length}/120)</span>
        <input style={{ ...S.input, marginBottom: 12 }} maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nouveau : la roue de la chance 🎡" />
        <span style={label}>Texte ({body.length}/500)</span>
        <textarea style={{ ...S.input, minHeight: 90, resize: 'vertical', marginBottom: 12 }} maxLength={500} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Faites jouer vos clients et créez du bouche-à-oreille." />
        <span style={label}>Écran ouvert au clic</span>
        <select style={S.input} value={action} onChange={(e) => setAction(e.target.value)}>
          {ACTIONS.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
        </select>
      </div>

      {error && <div style={{ ...S.card, borderColor: C.red, color: C.red, marginBottom: 16, padding: 14 }}>{error}</div>}

      {result && (
        <div style={{ ...S.card, borderColor: C.green, marginBottom: 16, padding: 16 }}>
          <div style={{ fontWeight: 700, color: C.text, marginBottom: 8 }}>{result.recipientCount} commerçants traités</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {(Object.entries(result.results) as Array<[MerchantNotifyResult, number]>).map(([k, v]) => (
              <span key={k} style={S.badge(k === 'sent' ? C.green : C.textMuted)}>{RESULT_LABELS[k] ?? k} : {v}</span>
            ))}
          </div>
        </div>
      )}

      {confirm ? (
        <div style={{ display: 'flex', gap: 8, marginBottom: 28 }}>
          <button style={S.btn(C.green)} onClick={doSend}>Confirmer l'envoi à {count ?? '?'} commerçants</button>
          <button style={S.btnOutline(C.textMuted)} onClick={() => setConfirm(false)}>Annuler</button>
        </div>
      ) : (
        <button style={{ ...S.btn(), opacity: canSend ? 1 : 0.5, marginBottom: 28 }} disabled={!canSend} onClick={() => setConfirm(true)}>
          {sending ? 'Envoi…' : 'Envoyer la nouveauté'}
        </button>
      )}

      <div style={S.card}>
        <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: C.text }}>Notifications Pro — 30 derniers jours</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ color: C.textMuted, textAlign: 'left' }}>
              <th style={{ padding: '6px 4px' }}>Catégorie</th>
              <th style={{ padding: '6px 4px' }}>Envoyées</th>
              <th style={{ padding: '6px 4px' }}>Ouvertes depuis le push</th>
              <th style={{ padding: '6px 4px' }}>Lues</th>
            </tr>
          </thead>
          <tbody>
            {stats.length === 0 && (
              <tr><td colSpan={4} style={{ padding: 8, color: C.textMuted }}>Aucune donnée.</td></tr>
            )}
            {stats.map((s) => (
              <tr key={s.category} style={{ borderTop: `1px solid ${C.border}`, color: C.text }}>
                <td style={{ padding: '8px 4px' }}>{CAT_LABELS[s.category] ?? s.category}</td>
                <td style={{ padding: '8px 4px' }}>{s.sent}</td>
                <td style={{ padding: '8px 4px' }}>{s.opened} ({pct(s.opened, s.sent)})</td>
                <td style={{ padding: '8px 4px' }}>{s.read} ({pct(s.read, s.sent)})</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
