import React, { useEffect, useState, useCallback } from 'react';
import { getMerchants, sendAdminNotification } from '../api';
import { MerchantRow } from '../types';
import { C, S } from '../theme';
import { getErrorMessage } from '@jitplus/shared';

type Audience = 'MERCHANT_CLIENTS' | 'ALL_CLIENTS' | 'ALL_MERCHANTS';

const AUDIENCES: { key: Audience; label: string; icon: string; desc: string }[] = [
  { key: 'MERCHANT_CLIENTS', label: 'Clients d\'un commerçant', icon: '👥', desc: 'Clients ayant une carte de fidélité chez un commerçant spécifique' },
  { key: 'ALL_CLIENTS', label: 'Tous les clients (JitPlus)', icon: '📱', desc: 'Tous les utilisateurs de l\'app JitPlus' },
  { key: 'ALL_MERCHANTS', label: 'Tous les commerçants (JitPlus Pro)', icon: '🏪', desc: 'Tous les commerçants sur JitPlus Pro' },
];

const CHANNELS = [
  { key: 'PUSH' as const, label: '📱 Push', color: C.primary },
  { key: 'EMAIL' as const, label: '📧 Email', color: '#EA4335' },
  { key: 'WHATSAPP' as const, label: '💬 WhatsApp', color: '#25D366' },
];

export default function SendNotification() {
  const [merchants, setMerchants] = useState<MerchantRow[]>([]);
  const [merchantSearch, setMerchantSearch] = useState('');
  const [selectedMerchant, setSelectedMerchant] = useState<MerchantRow | null>(null);
  const [audience, setAudience] = useState<Audience>('MERCHANT_CLIENTS');
  const [channel, setChannel] = useState<'PUSH' | 'EMAIL' | 'WHATSAPP'>('PUSH');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ success: boolean; recipientCount?: number; successCount?: number; failureCount?: number } | null>(null);
  const [error, setError] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  const loadMerchants = useCallback(async (search?: string) => {
    try {
      const res = await getMerchants(1, 50, search || undefined);
      setMerchants(res.merchants);
    } catch {
      // Silent fallback
    }
  }, []);

  useEffect(() => { loadMerchants(); }, [loadMerchants]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadMerchants(merchantSearch || undefined);
    }, 300);
    return () => clearTimeout(timer);
  }, [merchantSearch, loadMerchants]);

  const handleSend = async () => {
    if (audience === 'MERCHANT_CLIENTS' && !selectedMerchant) return;
    if (!title.trim() && channel !== 'WHATSAPP') return;
    if (!body.trim()) return;

    setSending(true);
    setError('');
    setResult(null);
    try {
      const res = await sendAdminNotification(
        channel,
        title,
        body,
        audience,
        audience === 'MERCHANT_CLIENTS' ? selectedMerchant!.id : undefined,
      );
      setResult(res);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSending(false);
    }
  };

  const needsMerchant = audience === 'MERCHANT_CLIENTS';
  const whatsappDisabled = audience !== 'MERCHANT_CLIENTS';
  const availableChannels = whatsappDisabled
    ? CHANNELS.filter((ch) => ch.key !== 'WHATSAPP')
    : CHANNELS;
  const canSend =
    (!needsMerchant || selectedMerchant) &&
    body.trim() &&
    (channel === 'WHATSAPP' || title.trim());

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 14px',
    background: C.bg,
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    color: C.text,
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box',
  };

  return (
    <div style={{ maxWidth: 700 }}>
      <h2 style={{ margin: '0 0 24px', fontWeight: 800, fontSize: 22, color: C.text }}>
        📤 Envoyer une notification
      </h2>

      {/* Step 1: Select audience */}
      <div style={{ ...S.card, marginBottom: 16 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: C.text }}>
          1. Audience cible
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {AUDIENCES.map((a) => (
            <div
              key={a.key}
              onClick={() => {
                setAudience(a.key);
                if (a.key !== 'MERCHANT_CLIENTS') {
                  setSelectedMerchant(null);
                  // Reset to PUSH if WhatsApp was selected and not available
                  if (channel === 'WHATSAPP') setChannel('PUSH');
                }
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 16px', borderRadius: 8, cursor: 'pointer',
                background: audience === a.key ? C.primaryAlpha : 'transparent',
                border: `1px solid ${audience === a.key ? C.primary : C.border}`,
                transition: 'all .15s',
              }}
            >
              <span style={{ fontSize: 22 }}>{a.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, color: C.text, fontSize: 13 }}>{a.label}</div>
                <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{a.desc}</div>
              </div>
              <div style={{
                width: 18, height: 18, borderRadius: '50%',
                border: `2px solid ${audience === a.key ? C.primary : C.border}`,
                background: audience === a.key ? C.primary : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {audience === a.key && (
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff' }} />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Step 2: Select merchant (only for MERCHANT_CLIENTS) */}
      {needsMerchant && (
      <div style={{ ...S.card, marginBottom: 16 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: C.text }}>
          2. Sélectionner le commerçant
        </h3>
        <p style={{ margin: '0 0 10px', fontSize: 12, color: C.textMuted }}>
          La notification sera envoyée à tous les clients ayant une carte de fidélité chez ce commerçant.
        </p>

        {selectedMerchant ? (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 14px', background: C.primaryAlpha, border: `1px solid var(--theme-primary-alpha)`,
            borderRadius: 8,
          }}>
            <div>
              <span style={{ fontWeight: 600, color: C.text }}>{selectedMerchant.nom}</span>
              <span style={{ color: C.textMuted, fontSize: 12, marginLeft: 8 }}>{selectedMerchant.email}</span>
              <span style={{ ...S.badge(C.cyan), marginLeft: 8, fontSize: 10 }}>
                {selectedMerchant.clientCount} clients
              </span>
            </div>
            <button
              onClick={() => { setSelectedMerchant(null); setMerchantSearch(''); }}
              style={{ ...S.btnOutline(C.red), padding: '4px 10px', fontSize: 11 }}
            >
              Changer
            </button>
          </div>
        ) : (
          <div style={{ position: 'relative' }}>
            <input
              value={merchantSearch}
              onChange={(e) => { setMerchantSearch(e.target.value); setShowDropdown(true); }}
              onFocus={() => setShowDropdown(true)}
              placeholder="🔍  Rechercher un commerçant…"
              style={inputStyle}
            />
            {showDropdown && merchants.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                background: C.surface, border: `1px solid ${C.border}`, borderRadius: '0 0 8px 8px',
                maxHeight: 240, overflowY: 'auto',
              }}>
                {merchants.map((m) => (
                  <div
                    key={m.id}
                    onClick={() => { setSelectedMerchant(m); setShowDropdown(false); }}
                    style={{
                      padding: '10px 14px', cursor: 'pointer', display: 'flex',
                      justifyContent: 'space-between', alignItems: 'center',
                      borderBottom: `1px solid `,
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = C.surfaceHover)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div>
                      <span style={{ fontWeight: 600, color: C.text, fontSize: 13 }}>{m.nom}</span>
                      <span style={{ color: C.textMuted, fontSize: 11, marginLeft: 8 }}>{m.email}</span>
                    </div>
                    <span style={{ fontSize: 11, color: C.textMuted }}>{m.clientCount} clients</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      )}

      {/* Step 3: Select channel */}
      <div style={{ ...S.card, marginBottom: 16 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: C.text }}>
          {needsMerchant ? '3' : '2'}. Canal de notification
        </h3>
        <div style={{ display: 'flex', gap: 10 }}>
          {availableChannels.map((ch) => (
            <button
              key={ch.key}
              onClick={() => setChannel(ch.key)}
              style={{
                ...S.btn(channel === ch.key ? ch.color : C.border),
                color: channel === ch.key ? '#fff' : C.textMuted,
                flex: 1,
                padding: '10px 16px',
                fontSize: 14,
              }}
            >
              {ch.label}
            </button>
          ))}
        </div>
      </div>

      {/* Step: Compose message */}
      <div style={{ ...S.card, marginBottom: 16 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: C.text }}>
          {needsMerchant ? '4' : '3'}. Composer le message
        </h3>

        {channel !== 'WHATSAPP' && (
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.textMuted, marginBottom: 6 }}>
              Titre {channel === 'EMAIL' ? '(Objet)' : ''}
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={channel === 'EMAIL' ? 'Objet de l\'email…' : 'Titre de la notification…'}
              maxLength={255}
              style={inputStyle}
            />
          </div>
        )}

        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.textMuted, marginBottom: 6 }}>
            {channel === 'EMAIL' ? 'Contenu HTML' : 'Message'}
          </label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={
              channel === 'EMAIL' ? 'Contenu HTML de l\'email…'
                : channel === 'WHATSAPP' ? 'Message WhatsApp…'
                : 'Contenu de la notification push…'
            }
            maxLength={2000}
            rows={channel === 'EMAIL' ? 10 : 5}
            style={{ ...inputStyle, resize: 'vertical', fontFamily: channel === 'EMAIL' ? 'monospace' : 'inherit' }}
          />
          <p style={{ margin: '4px 0 0', fontSize: 11, color: C.textMuted, textAlign: 'right' }}>
            {body.length}/2000
          </p>
        </div>
      </div>

      {/* Send button */}
      <div style={{ ...S.card }}>
        {!needsMerchant && (
          <div style={{
            padding: '10px 14px', borderRadius: 8, marginBottom: 14,
            background: '#FF980015', border: '1px solid #FF980044',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{ fontSize: 18 }}>⚠️</span>
            <span style={{ fontSize: 12, color: '#FF9800' }}>
              Attention : cette notification sera envoyée à <strong>
              {audience === 'ALL_CLIENTS' ? 'tous les clients JitPlus' : 'tous les commerçants JitPlus Pro'}
              </strong>.
            </span>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button
            onClick={handleSend}
            disabled={!canSend || sending}
            style={{
              ...S.btn(availableChannels.find((c) => c.key === channel)?.color ?? C.primary),
              padding: '12px 28px',
              fontSize: 15,
              opacity: canSend && !sending ? 1 : 0.4,
            }}
          >
            {sending ? '⏳ Envoi en cours…' : `Envoyer via ${availableChannels.find((c) => c.key === channel)?.label}`}
          </button>

          {!canSend && !sending && (
            <span style={{ color: C.textMuted, fontSize: 12 }}>
              {needsMerchant && !selectedMerchant ? 'Sélectionnez un commerçant' : 'Remplissez le titre et le message'}
            </span>
          )}
        </div>

        {/* Result */}
        {result && (
          <div style={{
            marginTop: 16, padding: '12px 16px', borderRadius: 8,
            background: result.success ? C.greenAlpha : C.redAlpha,
            border: `1px solid ${result.success ? 'var(--theme-green-alpha)' : 'var(--theme-red-alpha)'}`,
          }}>
            <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: result.success ? C.green : C.red }}>
              {result.success ? '✅ Notification envoyée avec succès !' : '❌ Échec de l\'envoi'}
            </p>
            {result.recipientCount != null && (
              <div style={{ display: 'flex', gap: 20, marginTop: 8 }}>
                <span style={{ fontSize: 12, color: C.textMuted }}>
                  📬 Destinataires : <strong style={{ color: C.text }}>{result.recipientCount}</strong>
                </span>
                {result.successCount != null && (
                  <span style={{ fontSize: 12, color: C.textMuted }}>
                    ✅ Succès : <strong style={{ color: C.green }}>{result.successCount}</strong>
                  </span>
                )}
                {result.failureCount != null && result.failureCount > 0 && (
                  <span style={{ fontSize: 12, color: C.textMuted }}>
                    ❌ Échecs : <strong style={{ color: C.red }}>{result.failureCount}</strong>
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <p style={{ marginTop: 12, color: C.red, fontSize: 13 }}>❌ {error}</p>
        )}
      </div>
    </div>
  );
}
