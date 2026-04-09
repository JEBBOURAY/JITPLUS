import React, { useState, useEffect } from 'react';
import { C, S } from '../theme';

export interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  confirmColor?: string;
  /** User must type this exact text to confirm */
  requireText?: string;
  /** Show a reason textarea (must be ≥ 3 chars) */
  requireReason?: boolean;
  loading?: boolean;
  onConfirm: (reason?: string) => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = 'Confirmer',
  confirmColor = C.red,
  requireText,
  requireReason = false,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const [typed, setTyped] = useState('');
  const [reason, setReason] = useState('');

  // Reset internal state when modal opens/closes
  useEffect(() => {
    if (!open) {
      setTyped('');
      setReason('');
    }
  }, [open]);

  if (!open) return null;

  const canConfirm =
    (!requireText || typed === requireText) &&
    (!requireReason || reason.trim().length >= 3) &&
    !loading;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        backdropFilter: 'blur(4px)',
      }}
      onClick={onCancel}
    >
      <div
        style={{
          ...S.card,
          maxWidth: 440,
          width: '90%',
          boxShadow: 'var(--shadow-lg)',
          padding: 28,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: '0 0 8px', color: C.text, fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em' }}>{title}</h3>
        <p style={{ margin: '0 0 20px', color: C.textMuted, fontSize: 13, lineHeight: 1.6 }}>{message}</p>

        {requireReason && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, color: C.textMuted, marginBottom: 6, fontWeight: 500 }}>
              Raison (obligatoire)
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              style={{
                ...S.input,
                resize: 'vertical',
              }}
            />
          </div>
        )}

        {requireText && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, color: C.textMuted, marginBottom: 6, fontWeight: 500 }}>
              Tapez <strong style={{ color: C.text }}>{requireText}</strong> pour confirmer
            </label>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              style={S.input}
            />
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
          <button onClick={onCancel} style={{ ...S.btnOutline(C.textMuted), borderColor: C.border, color: C.textMuted }}>Annuler</button>
          <button
            onClick={() => { onConfirm(reason.trim() || undefined); }}
            disabled={!canConfirm}
            style={{ ...S.btn(confirmColor), opacity: canConfirm ? 1 : 0.4 }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
