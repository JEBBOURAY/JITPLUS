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
        setError(`Trop de tentatives. Reessayez dans ${LOCKOUT_SECONDS} secondes.`);
      } else {
        setError(getErrorMessage(err, 'Erreur de connexion'));
      }
    } finally {
      setLoading(false);
    }
  };

  const isProd = env === 'prod';

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
      <div style={{ ...S.card, width: 400, padding: 36, boxShadow: 'var(--shadow-md)' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 48,
            height: 48,
            borderRadius: 'var(--radius-md)',
            background: `linear-gradient(135deg, ${C.primary}, ${C.cyan})`,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 16,
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
          </div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: C.text, letterSpacing: '-0.02em' }}>
            JitPlus Admin
          </h1>
          <p style={{ color: C.textMuted, fontSize: 13, marginTop: 6 }}>
            Tableau de bord d'administration
          </p>
        </div>

        {/* Environment selector */}
        <div style={{
          display: 'flex',
          gap: 4,
          marginBottom: 20,
          background: C.bg,
          borderRadius: 'var(--radius-sm)',
          padding: 3,
        }}>
          {(['dev', 'prod'] as const).map((e) => {
            const active = env === e;
            const col = e === 'prod' ? C.red : C.green;
            return (
              <button
                key={e}
                type="button"
                onClick={() => { setEnv(e); setError(''); }}
                style={{
                  flex: 1,
                  padding: '8px 0',
                  borderRadius: 'calc(var(--radius-sm) - 2px)',
                  border: 'none',
                  fontSize: 12,
                  fontWeight: 600,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                  background: active ? C.surface : 'transparent',
                  color: active ? col : C.textMuted,
                  boxShadow: active ? 'var(--shadow-sm)' : 'none',
                  transition: 'all .15s ease',
                }}
              >
                {e === 'dev' ? 'Developpement' : 'Production'}
              </button>
            );
          })}
        </div>

        {isProd && (
          <div style={{
            background: C.redAlpha,
            border: `1px solid ${C.red}`,
            borderRadius: 'var(--radius-sm)',
            padding: '8px 12px',
            marginBottom: 16,
            fontSize: 12,
            color: C.red,
            fontWeight: 600,
            textAlign: 'center',
          }}>
            Connexion a la base de donnees PRODUCTION
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, color: C.text, marginBottom: 6, fontWeight: 500 }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="admin@jitplus.com"
              style={{ ...S.input, fontSize: 14, padding: '10px 14px' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 13, color: C.text, marginBottom: 6, fontWeight: 500 }}>
              Mot de passe
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="Entrez votre mot de passe"
              style={{ ...S.input, fontSize: 14, padding: '10px 14px' }}
            />
          </div>

          {error && (
            <div
              style={{
                background: C.redAlpha,
                border: `1px solid ${C.red}`,
                borderRadius: 'var(--radius-sm)',
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
              padding: '11px',
              fontSize: 14,
              marginTop: 4,
              opacity: loading || isLocked ? 0.5 : 1,
              width: '100%',
            }}
          >
            {isLocked
              ? `Verrouille (${countdown}s)`
              : loading
                ? 'Connexion...'
                : 'Se connecter'}
          </button>
        </form>
      </div>
    </div>
  );
}
