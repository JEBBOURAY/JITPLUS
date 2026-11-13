// Flow shared by the two "scan a link, credit my account" screens (Quick-Add
// claim and parcel stamp code): stash the token while logged out, ask before
// crediting the account logged in now, then show the result.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, BackHandler, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, Keyframe, LayoutAnimationConfig, useReducedMotion } from 'react-native-reanimated';
import { AlertCircle, CheckCircle2, Clock, type LucideIcon } from 'lucide-react-native';
import { Text } from '@/components/AppText';
import StarLoader from '@/components/StarLoader';
import { useTheme } from '@/contexts/ThemeContext';
import { hapticError, hapticSuccess } from '@/utils/haptics';
import { EASE_OUT } from '@/utils/motion';

// Each state swap (loading → confirm → result) fades in instead of cutting.
const STATE_IN = FadeIn.duration(220).easing(EASE_OUT);
const STATE_IN_REDUCED = FadeIn.duration(150);
const ICON_POP = new Keyframe({
  0: { opacity: 0, transform: [{ scale: 0.9 }] },
  100: { opacity: 1, transform: [{ scale: 1 }], easing: EASE_OUT },
}).duration(260);

export type RedeemScreenState<Result, ErrorKey extends string> =
  | { kind: 'loading' }
  | { kind: 'login-required' }
  | { kind: 'confirm' }
  | { kind: 'success'; result: Result }
  | { kind: 'error'; messageKey: ErrorKey; retryable: boolean };

interface FlowOptions<Result, ErrorKey extends string> {
  token: string;
  tokenValid: boolean;
  /** Account logged in now, if any. */
  clientId: string | undefined;
  invalidKey: ErrorKey;
  redeem: (token: string) => Promise<Result>;
  onSuccess: (result: Result) => void;
  /** Message for a failure, and whether the token is still usable afterwards. */
  classifyError: (err: unknown) => { messageKey: ErrorKey; retryable: boolean };
  savePending: (token: string) => Promise<void>;
  clearPending: () => Promise<void>;
}

export function useRedeemFlow<Result, ErrorKey extends string>(options: FlowOptions<Result, ErrorKey>) {
  const { token, tokenValid, clientId, invalidKey } = options;
  const [screen, setScreen] = useState<RedeemScreenState<Result, ErrorKey>>({ kind: 'loading' });
  // Guards against a second call for the same token. Without it an unrelated
  // store re-emit would redeem again and land on "already used".
  const redeemedRef = useRef<string | null>(null);
  // Callbacks are read at call time: only the token and the account drive the effects.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // No hardware back while the request is in flight.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => screen.kind === 'loading');
    return () => sub.remove();
  }, [screen.kind]);

  const run = useCallback(async () => {
    if (!tokenValid) {
      setScreen({ kind: 'error', messageKey: invalidKey, retryable: false });
      return;
    }
    if (redeemedRef.current === token) return;
    redeemedRef.current = token;
    setScreen({ kind: 'loading' });
    try {
      const result = await optionsRef.current.redeem(token);
      optionsRef.current.onSuccess(result);
      setScreen({ kind: 'success', result });
      hapticSuccess();
    } catch (err: unknown) {
      const failure = optionsRef.current.classifyError(err);
      setScreen({ kind: 'error', ...failure });
      hapticError();
      if (failure.retryable) redeemedRef.current = null;
    }
  }, [token, tokenValid, invalidKey]);

  // Any app or web page can open the link, and on a shared phone the account
  // logged in now may not be the one it was meant for: always ask first.
  useEffect(() => {
    if (!tokenValid) {
      setScreen({ kind: 'error', messageKey: invalidKey, retryable: false });
      return;
    }
    if (!clientId) {
      let cancelled = false;
      // A failed write must not leave the screen on its loader.
      optionsRef.current.savePending(token).catch(() => {}).then(() => {
        if (!cancelled) setScreen({ kind: 'login-required' });
      });
      return () => { cancelled = true; };
    }
    // The token now lives in this screen's params: a declined or failed
    // attempt must not reopen on the next login.
    void optionsRef.current.clearPending();
    if (redeemedRef.current !== token) setScreen({ kind: 'confirm' });
  }, [clientId, token, tokenValid, invalidKey]);

  return { screen, run };
}

// ── Views ──────────────────────────────────────────────────────────────

/** `stateKey` changes with each screen state: the new content fades in (not on first mount, the push already animates). */
export function RedeemLayout({ stateKey, children }: { stateKey: string; children: ReactNode }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.bg, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
      ]}
    >
      <LayoutAnimationConfig skipEntering>
        <Animated.View key={stateKey} entering={reduced ? STATE_IN_REDUCED : STATE_IN} style={styles.inner}>
          {children}
        </Animated.View>
      </LayoutAnimationConfig>
    </View>
  );
}

/** Success check that pops in with the result. */
export function RedeemSuccessIcon() {
  const theme = useTheme();
  const reduced = useReducedMotion();
  return (
    <Animated.View entering={reduced ? undefined : ICON_POP}>
      <CheckCircle2 size={64} color={theme.success} />
    </Animated.View>
  );
}

export function RedeemTitle({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return <Text style={[styles.title, { color: theme.text }]}>{children}</Text>;
}

export function RedeemText({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return <Text style={[styles.body, { color: theme.textMuted }]}>{children}</Text>;
}

interface ButtonProps {
  label: string;
  onPress: () => void;
  /** Waiting for data the button needs: disabled, with a spinner. */
  busy?: boolean;
}

export function RedeemPrimaryButton({ label, onPress, busy = false }: ButtonProps) {
  const theme = useTheme();
  return (
    <TouchableOpacity
      style={[styles.btnPrimary, { backgroundColor: theme.primary }, busy && styles.busy]}
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityState={busy ? { disabled: true, busy: true } : undefined}
    >
      {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnPrimaryText}>{label}</Text>}
    </TouchableOpacity>
  );
}

function RedeemSecondaryButton({ label, onPress }: ButtonProps) {
  const theme = useTheme();
  return (
    <TouchableOpacity style={styles.btnSecondary} onPress={onPress} accessibilityRole="button">
      <Text style={[styles.btnSecondaryText, { color: theme.textMuted }]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function RedeemLoading({ label }: { label: string }) {
  return (
    <>
      <StarLoader />
      <RedeemText>{label}</RedeemText>
    </>
  );
}

export function RedeemLoginPrompt({ title, body, cta, onLogin }: { title: string; body: string; cta: string; onLogin: () => void }) {
  const theme = useTheme();
  return (
    <>
      <Clock size={56} color={theme.primary} />
      <RedeemTitle>{title}</RedeemTitle>
      <RedeemText>{body}</RedeemText>
      <RedeemPrimaryButton label={cta} onPress={onLogin} />
    </>
  );
}

interface ConfirmProps {
  Icon: LucideIcon;
  title: string;
  body: string;
  cta: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function RedeemConfirm({ Icon, title, body, cta, cancelLabel, onConfirm, onCancel }: ConfirmProps) {
  const theme = useTheme();
  return (
    <>
      <Icon size={56} color={theme.primary} />
      <RedeemTitle>{title}</RedeemTitle>
      <RedeemText>{body}</RedeemText>
      <RedeemPrimaryButton label={cta} onPress={onConfirm} />
      <RedeemSecondaryButton label={cancelLabel} onPress={onCancel} />
    </>
  );
}

interface ErrorProps {
  title: string;
  message: string;
  /** The token is still usable: offer to try again, and demote "Close". */
  retryLabel: string | null;
  closeLabel: string;
  onRetry: () => void;
  onClose: () => void;
}

export function RedeemError({ title, message, retryLabel, closeLabel, onRetry, onClose }: ErrorProps) {
  const theme = useTheme();
  return (
    <>
      <AlertCircle size={56} color={theme.danger} />
      <RedeemTitle>{title}</RedeemTitle>
      <RedeemText>{message}</RedeemText>
      {retryLabel ? (
        <>
          <RedeemPrimaryButton label={retryLabel} onPress={onRetry} />
          <RedeemSecondaryButton label={closeLabel} onPress={onClose} />
        </>
      ) : (
        <RedeemPrimaryButton label={closeLabel} onPress={onClose} />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 24, justifyContent: 'center' },
  inner: { alignItems: 'center', gap: 16 },
  title: { fontSize: 22, fontWeight: '600', textAlign: 'center' },
  body: { fontSize: 15, lineHeight: 22, textAlign: 'center' },
  btnPrimary: {
    marginTop: 12,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
    minWidth: 200,
    alignItems: 'center',
  },
  btnPrimaryText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  busy: { opacity: 0.6 },
  btnSecondary: { paddingHorizontal: 28, paddingVertical: 10 },
  btnSecondaryText: { fontWeight: '600', fontSize: 15 },
});
