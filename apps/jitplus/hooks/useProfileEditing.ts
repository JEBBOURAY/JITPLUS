import { useState, useCallback, useEffect, useRef } from 'react';
import { Alert, AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { haptic, HapticStyle } from '@/utils/haptics';
import { api } from '@/services/api';
import { isValidEmail } from '@/utils/validation';
import { extractErrorMessage } from '@/utils/errorMessage';
import { toIsoDate, isoDtoDmy } from '@/utils/dateInput';
import { DRAFT_PERSIST_DEBOUNCE_MS, OTP_RESEND_COOLDOWN_S } from '@/constants';
import { DEFAULT_COUNTRY, COUNTRY_CODES, isValidPhoneForCountry, type CountryCode } from '@/utils/countryCodes';
import type { Client } from '@/types';

const DRAFT_KEY = 'profile_draft';

// Longest-dial-first so '+1' (US) doesn't shadow '+12' / '+123' dial codes.
const COUNTRIES_BY_DIAL_LENGTH = [...COUNTRY_CODES].sort((a, b) => b.dial.length - a.dial.length);

interface ProfileFields {
  prenom: string;
  nom: string;
  email: string;
  phoneLocal: string;
  phoneCountry: CountryCode;
  dateNaissance: string;
}

function splitPhone(rawPhone: string): { country: CountryCode; local: string } {
  if (!rawPhone.startsWith('+')) {
    return { country: DEFAULT_COUNTRY, local: rawPhone.replace(/[^0-9]/g, '') };
  }
  const match = COUNTRIES_BY_DIAL_LENGTH.find((c) => rawPhone.startsWith(c.dial));
  // Unknown dial code: keep the full +XXX number in the local field. The save
  // path detects the leading '+' and sends it as-is instead of prefixing the
  // selected dial again (would corrupt to e.g. '+212+33...').
  return match
    ? { country: match, local: rawPhone.slice(match.dial.length) }
    : { country: DEFAULT_COUNTRY, local: rawPhone };
}

function fieldsFromClient(client: Client | null): ProfileFields {
  const { country, local } = splitPhone(client?.telephone || '');
  return {
    prenom: client?.prenom || '',
    nom: client?.nom || '',
    email: client?.email || '',
    phoneLocal: local,
    phoneCountry: country,
    dateNaissance: isoDtoDmy(client?.dateNaissance),
  };
}

function sameFields(a: ProfileFields, b: ProfileFields): boolean {
  return a.prenom === b.prenom
    && a.nom === b.nom
    && a.email === b.email
    && a.phoneLocal === b.phoneLocal
    && a.phoneCountry.code === b.phoneCountry.code
    && a.dateNaissance === b.dateNaissance;
}

/**
 * Form state for the edit-profile screen: field values seeded from the current
 * client, dirty tracking, draft persistence when the app is backgrounded, and
 * the OTP flow used to verify email / phone.
 */
export function useProfileEditing(
  client: Client | null,
  refreshProfile: (() => Promise<void>) | undefined,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  const [initialFields, setInitialFields] = useState<ProfileFields>(() => fieldsFromClient(client));
  const [fields, setFields] = useState<ProfileFields>(initialFields);
  const [isSaving, setIsSaving] = useState(false);

  // OTP verification
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otpTarget, setOtpTarget] = useState<{ type: 'email' | 'telephone'; value: string } | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [otpError, setOtpError] = useState('');
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [otpResendTimer, setOtpResendTimer] = useState(0);

  const isDirty = !sameFields(fields, initialFields);

  const setField = useCallback(<K extends keyof ProfileFields>(key: K, value: ProfileFields[K]) => {
    setFields((prev) => (prev[key] === value ? prev : { ...prev, [key]: value }));
  }, []);

  const setPrenom = useCallback((v: string) => setField('prenom', v), [setField]);
  const setNom = useCallback((v: string) => setField('nom', v), [setField]);
  const setEmail = useCallback((v: string) => setField('email', v), [setField]);
  const setPhoneLocal = useCallback((v: string) => setField('phoneLocal', v), [setField]);
  const setPhoneCountry = useCallback((v: CountryCode) => setField('phoneCountry', v), [setField]);
  const setDateNaissance = useCallback((v: string) => setField('dateNaissance', v), [setField]);

  // ── Persist the draft when the user leaves the app mid-edit ──
  const fieldsRef = useRef(fields);
  const isDirtyRef = useRef(isDirty);
  useEffect(() => {
    fieldsRef.current = fields;
    isDirtyRef.current = isDirty;
  }, [fields, isDirty]);

  // The offline profile cache has no contact details or birth date: reseed the
  // form when the server profile arrives, unless the user already edited it.
  useEffect(() => {
    if (isDirtyRef.current) return;
    const next = fieldsFromClient(client);
    setInitialFields((prev) => (sameFields(prev, next) ? prev : next));
    setFields((prev) => (sameFields(prev, next) ? prev : next));
  }, [client]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next !== 'background' || !isDirtyRef.current) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const f = fieldsRef.current;
        // AsyncStorage: drafts can exceed SecureStore's 2048-byte limit
        AsyncStorage.setItem(DRAFT_KEY, JSON.stringify({ ...f, phoneCountry: f.phoneCountry.code })).catch(() => {});
      }, DRAFT_PERSIST_DEBOUNCE_MS);
    });
    return () => {
      sub.remove();
      if (timer) clearTimeout(timer);
    };
  }, []);

  // Restore a draft left by a previous session (one-shot).
  useEffect(() => {
    AsyncStorage.getItem(DRAFT_KEY).then((raw) => {
      if (!raw) return;
      AsyncStorage.removeItem(DRAFT_KEY).catch(() => {});
      try {
        const d = JSON.parse(raw);
        setFields((prev) => ({
          prenom: typeof d.prenom === 'string' ? d.prenom : prev.prenom,
          nom: typeof d.nom === 'string' ? d.nom : prev.nom,
          email: typeof d.email === 'string' ? d.email : prev.email,
          phoneLocal: typeof d.phoneLocal === 'string' ? d.phoneLocal : prev.phoneLocal,
          phoneCountry: COUNTRY_CODES.find((c) => c.code === d.phoneCountry) ?? prev.phoneCountry,
          dateNaissance: typeof d.dateNaissance === 'string' ? d.dateNaissance : prev.dateNaissance,
        }));
      } catch { /* corrupt draft, ignore */ }
    }).catch(() => {});
  }, []);

  const discardDraft = useCallback(() => {
    AsyncStorage.removeItem(DRAFT_KEY).catch(() => {});
  }, []);

  // OTP resend timer
  useEffect(() => {
    if (otpResendTimer <= 0) return;
    const id = setTimeout(() => setOtpResendTimer((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [otpResendTimer]);

  const startOtpFlow = useCallback(async (target: { type: 'email' | 'telephone'; value: string }) => {
    setOtpTarget(target);
    setOtpCode('');
    setOtpError('');
    setIsSendingOtp(true);
    try {
      await api.sendChangeContactOtp(target.type, target.value);
      setOtpResendTimer(OTP_RESEND_COOLDOWN_S);
      setShowOtpModal(true);
    } catch (error) {
      Alert.alert(t('common.error'), extractErrorMessage(error));
    } finally {
      setIsSendingOtp(false);
    }
  }, [t]);

  const verifyOtpAndApply = useCallback(async () => {
    if (!otpTarget || otpCode.length !== 6 || isVerifyingOtp) return;
    setIsVerifyingOtp(true);
    setOtpError('');
    try {
      await api.verifyChangeContactOtp(otpTarget.type, otpTarget.value, otpCode);
      setShowOtpModal(false);
      await refreshProfile?.();
      const fieldLabel = otpTarget.type === 'email' ? t('profile.email') : t('profile.phone');
      Alert.alert(t('common.success'), t('profile.otpContactUpdated', { field: fieldLabel }));
    } catch (error) {
      setOtpError(extractErrorMessage(error) || t('profile.otpVerifyError'));
    } finally {
      setIsVerifyingOtp(false);
    }
  }, [otpTarget, otpCode, isVerifyingOtp, refreshProfile, t]);

  const resendOtp = useCallback(async () => {
    if (!otpTarget || otpResendTimer > 0) return;
    setIsSendingOtp(true);
    setOtpError('');
    try {
      await api.sendChangeContactOtp(otpTarget.type, otpTarget.value);
      setOtpResendTimer(OTP_RESEND_COOLDOWN_S);
    } catch (error) {
      setOtpError(extractErrorMessage(error) || t('profile.otpSendError'));
    } finally {
      setIsSendingOtp(false);
    }
  }, [otpTarget, otpResendTimer, t]);

  const dismissOtpModal = useCallback(() => setShowOtpModal(false), []);

  const changeOtpCode = useCallback((code: string) => {
    setOtpCode(code);
    setOtpError('');
  }, []);

  /** Validates and saves. Resolves to `true` on success so the screen can close. */
  const saveProfile = useCallback(async (): Promise<boolean> => {
    const { prenom, nom, email, phoneLocal, phoneCountry, dateNaissance } = fields;
    if (!prenom.trim() || !nom.trim()) {
      Alert.alert(t('common.error'), t('profile.nameRequired'));
      return false;
    }
    const emailTrimmed = email.trim();
    if (emailTrimmed && !isValidEmail(emailTrimmed)) {
      Alert.alert(t('common.error'), t('profile.emailInvalid'));
      return false;
    }
    const phoneTrimmed = phoneLocal.trim();
    if (phoneTrimmed && !phoneTrimmed.startsWith('+') && !isValidPhoneForCountry(phoneTrimmed, phoneCountry)) {
      Alert.alert(t('common.error'), t('profile.phoneInvalid'));
      return false;
    }
    let dateNaissancePayload: string | null;
    if (dateNaissance.trim() === '') {
      dateNaissancePayload = null;
    } else {
      const iso = dateNaissance.length === 10 ? toIsoDate(dateNaissance) : null;
      if (!iso) {
        Alert.alert(t('common.error'), t('profile.dateInvalid'));
        return false;
      }
      dateNaissancePayload = iso;
    }

    setIsSaving(true);
    haptic(HapticStyle.Medium);
    try {
      await api.updateProfile({
        prenom: prenom.trim(),
        nom: nom.trim(),
        ...(emailTrimmed ? { email: emailTrimmed } : {}),
        ...(phoneTrimmed
          ? { telephone: phoneTrimmed.startsWith('+') ? phoneTrimmed : `${phoneCountry.dial}${phoneTrimmed}` }
          : {}),
        // Only when edited: a form seeded without the birth date must not erase it.
        ...(dateNaissance !== initialFields.dateNaissance ? { dateNaissance: dateNaissancePayload } : {}),
      });
      await refreshProfile?.();
      discardDraft();
      return true;
    } catch (error) {
      if (__DEV__) console.error('Update profile error:', error);
      Alert.alert(t('common.error'), extractErrorMessage(error));
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [fields, initialFields, refreshProfile, discardDraft, t]);

  return {
    fields,
    isDirty,
    isSaving,
    setPrenom, setNom, setEmail, setPhoneLocal, setPhoneCountry, setDateNaissance,
    saveProfile, discardDraft,
    showOtpModal, otpTarget, otpCode, otpError,
    isVerifyingOtp, isSendingOtp, otpResendTimer,
    startOtpFlow, verifyOtpAndApply, resendOtp, dismissOtpModal, changeOtpCode,
  };
}
