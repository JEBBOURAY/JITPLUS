import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { login, getEnv, setEnv, onEnvChange } from '../api';
import type { AdminEnv } from '../api';
import { C, S } from '../theme';
import { getErrorMessage } from '@jitplus/shared';

const MAX_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 60;

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('contact@jitplus.com');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lockedUntil, setLockedUntil] = useState(0);
  const failedAttempts = useRef(0);
  const [countdown, setCountdown] = useState(0);
  const [env, setEnvState] = useState<AdminEnv>(getEnv);

  useEffect(() => onEnvChange(setEnvState), []);

  const startCountdown = useCallback((seconds: number) => {
    setCountdown(seconds);
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const isLocked = Date.now() < lockedUntil;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked) return;
    setError('');
    setLoading(true);
    try {
      await login(email.trim(), password);
      failedAttempts.current = 0;
      navigate('/');
    } catch (err) {
      failedAttempts.current += 1;
      if (failedAttempts.current >= MAX_ATTEMPTS) {
        const lockEnd = Date.now() + LOCKOUT_SECONDS * 1000;
        setLockedUntil(lockEnd);
        startCountdown(LOCKOUT_SECONDS);
        failedAttempts.current = 0;
        setError(`Trop de tentatives. Réessayez dans ${LOCKOUT_SECONDS} secondes.`);
      } else {
        setError(getErrorMessage(err, 'Erreur de connexion'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: C.bg,
      }}
    >
      <div style={{ ...S.card, width: 380 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>⚡</div>
          <h1
            style={{
              margin: 0,
              fontSize: 24,
              fontWeight: 800,
              background: `linear-gradient(90deg, ${C.primary}, ${C.cyan})`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            JitPlus Admin
          </h1>
          <p style={{ color: C.textMuted, fontSize: 13, marginTop: 4 }}>
            Tableau de bord administrateur
          </p>
        </div>

        {/* Environment selector */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
          {(['dev', 'prod'] as const).map((e) => {
            const active = env === e;
            const col = e === 'prod' ? C.red : C.green;
            const alphaCol = e === 'prod' ? C.redAlpha : C.greenAlpha;
            const borderCol = e === 'prod' ? 'var(--theme-red-alpha)' : 'var(--theme-green-alpha)';
            return (
              <button
                key={e}
                type="button"
                onClick={() => { setEnv(e); setError(''); }}
                style={{
                  flex: 1,
                  padding: '8px 0',
                  borderRadius: 8,
                  border: 'none',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: active ? alphaCol : C.bg,
                  color: active ? col : C.textMuted,
                  outline: active ? `1px solid ${borderCol}` : `1px solid ${C.border}`,
                }}
              >
                {e === 'dev' ? '🛠 Développement' : '🚀 Production'}
              </button>
            );
          })}
        </div>
        {env === 'prod' && (
          <div style={{
            background: C.redAlpha,
            border: `1px solid var(--theme-red-alpha)`,
            borderRadius: 8,
            padding: '8px 12px',
            marginBottom: 14,
            fontSize: 12,
            color: C.red,
            fontWeight: 600,
            textAlign: 'center',
          }}>
            ⚠️ Connexion à la base de données PRODUCTION
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: C.textMuted, marginBottom: 6 }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="admin@jitplus.com"
              style={{
                width: '100%',
                background: C.bg,
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                padding: '10px 12px',
                color: C.text,
                fontSize: 14,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, color: C.textMuted, marginBottom: 6 }}>
              Mot de passe
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              style={{
                width: '100%',
                background: C.bg,
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                padding: '10px 12px',
                color: C.text,
                fontSize: 14,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {error && (
            <div
              style={{
                background: C.redAlpha,
                border: `1px solid var(--theme-red-alpha)`,
                borderRadius: 8,
                padding: '10px 12px',
                color: C.red,
                fontSize: 13,
                whiteSpace: 'pre-line',
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || isLocked}
            style={{
              ...S.btn(C.primary),
              padding: '12px',
              fontSize: 15,
              marginTop: 4,
              opacity: loading || isLocked ? 0.6 : 1,
            }}
          >
            {isLocked
              ? `Verrouillé (${countdown}s)`
              : loading
                ? 'Connexion…'
                : 'Se connecter'}
          </button>
        </form>
      </div>
    </div>
  );
}
