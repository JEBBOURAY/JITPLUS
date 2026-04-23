import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Alert, Platform, AppState, AppStateStatus } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { haptic, HapticStyle } from '@/utils/haptics';
import { api } from '@/services/api';
import { isValidEmail } from '@/utils/validation';
import { extractErrorMessage } from '@/utils/errorMessage';
import { formatDateInput, toIsoDate, isoDtoDmy } from '@/utils/dateInput';
import { DRAFT_PERSIST_DEBOUNCE_MS, OTP_RESEND_COOLDOWN_S } from '@/constants';
import { DEFAULT_COUNTRY, COUNTRY_CODES, isValidPhoneForCountry, type CountryCode } from '@/utils/countryCodes';
import type { Client } from '@/types';

export function useProfileEditing(
  client: Client | null,
  refreshProfile: (() => Promise<void>) | undefined,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Editable fields
  const [editPrenom, setEditPrenom] = useState('');
  const [editNom, setEditNom] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editTelephone, setEditTelephone] = useState('');
  const [editPhoneCountry, setEditPhoneCountry] = useState<CountryCode>(DEFAULT_COUNTRY);
  const [editPhoneLocal, setEditPhoneLocal] = useState('');
  const [editDateNaissance, setEditDateNaissance] = useState('');

  // OTP verification
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otpTarget, setOtpTarget] = useState<{ type: 'email' | 'telephone'; value: string } | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [otpError, setOtpError] = useState('');
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [otpResendTimer, setOtpResendTimer] = useState(0);

  // ── Persist editing draft when user leaves app ──
  const isEditingRef = useRef(isEditing);
  isEditingRef.current = isEditing;
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const draftRef = useRef({ editPrenom, editNom, editEmail, editTelephone, editPhoneLocal, editPhoneCountry: editPhoneCountry.code, editDateNaissance });
  draftRef.current = { editPrenom, editNom, editEmail, editTelephone, editPhoneLocal, editPhoneCountry: editPhoneCountry.code, editDateNaissance };

  useEffect(() => {
    const handleAppState = async (nextState: AppStateStatus) => {
      if (nextState === 'background' && isEditingRef.current) {
        if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
        draftTimerRef.current = setTimeout(async () => {
          try {
            await SecureStore.setItemAsync('profile_draft', JSON.stringify(draftRef.current));
          } catch { /* best-effort */ }
        }, DRAFT_PERSIST_DEBOUNCE_MS);
      }
    };
    const sub = AppState.addEventListener('change', handleAppState);
    return () => {
      sub.remove();
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    };
  }, []);

  // Restore draft on mount
  useEffect(() => {
    SecureStore.getItemAsync('profile_draft').then((raw) => {
      if (!raw) return;
      try {
        const d = JSON.parse(raw);
        setEditPrenom(d.editPrenom || '');
        setEditNom(d.editNom || '');
        setEditEmail(d.editEmail || '');
        setEditTelephone(d.editTelephone || '');
        setEditPhoneLocal(d.editPhoneLocal || '');
        if (d.editPhoneCountry) {
          const found = COUNTRY_CODES.find((c) => c.code === d.editPhoneCountry);
          if (found) setEditPhoneCountry(found);
        }
        setEditDateNaissance(d.editDateNaissance || '');
        setIsEditing(true);
      } catch { /* corrupt draft, ignore */ }
      SecureStore.deleteItemAsync('profile_draft').catch(() => {});
    });
  }, []);

  // OTP resend timer
  useEffect(() => {
    if (otpResendTimer <= 0) return;
    const id = setTimeout(() => setOtpResendTimer((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [otpResendTimer]);

  const startEditing = useCallback(() => {
    setEditPrenom(client?.prenom || '');
    setEditNom(client?.nom || '');
    setEditEmail(client?.email || '');
    const rawPhone = client?.telephone || '';
    if (rawPhone.startsWith('+')) {
      const match = COUNTRY_CODES.find((c) => rawPhone.startsWith(c.dial));
      if (match) {
        setEditPhoneCountry(match);
        setEditPhoneLocal(rawPhone.slice(match.dial.length));
      } else {
        setEditPhoneCountry(DEFAULT_COUNTRY);
        setEditPhoneLocal(rawPhone.replace(/[^0-9]/g, ''));
      }
    } else {
      setEditPhoneCountry(DEFAULT_COUNTRY);
      setEditPhoneLocal(rawPhone.replace(/[^0-9]/g, ''));
    }
    setEditTelephone(rawPhone);
    setEditDateNaissance(isoDtoDmy(client?.dateNaissance));
    setIsEditing(true);
    haptic(HapticStyle.Light);
  }, [client]);

  const cancelEditing = useCallback(() => {
    setIsEditing(false);
    SecureStore.deleteItemAsync('profile_draft').catch(() => {});
    haptic(HapticStyle.Light);
  }, []);

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

  const dismissOtpModal = useCallback(() => {
    setShowOtpModal(false);
  }, []);

  const saveProfile = useCallback(async () => {
    if (!editPrenom.trim() || !editNom.trim()) {
      Alert.alert(t('common.error'), t('profile.nameRequired'));
      return;
    }
    const emailTrimmed = editEmail.trim();
    if (emailTrimmed && !isValidEmail(emailTrimmed)) {
      Alert.alert(t('common.error'), t('profile.emailInvalid'));
      return;
    }
    const phoneTrimmed = editPhoneLocal.trim();
    if (phoneTrimmed && !isValidPhoneForCountry(phoneTrimmed, editPhoneCountry)) {
      Alert.alert(t('common.error'), t('profile.phoneInvalid'));
      return;
    }
    let dateNaissancePayload: string | null | undefined = undefined;
    if (editDateNaissance.trim() === '') {
      dateNaissancePayload = null;
    } else if (editDateNaissance.length === 10) {
      const iso = toIsoDate(editDateNaissance);
      if (!iso) {
        Alert.alert(t('common.error'), t('profile.dateInvalid'));
        return;
      }
      dateNaissancePayload = iso;
    } else if (editDateNaissance.length > 0) {
      Alert.alert(t('common.error'), t('profile.dateInvalid'));
      return;
    }
    setIsSaving(true);
    haptic(HapticStyle.Medium);
    try {
      await api.updateProfile({
        prenom: editPrenom.trim(),
        nom: editNom.trim(),
        ...(emailTrimmed ? { email: emailTrimmed } : {}),
        ...(phoneTrimmed ? { telephone: `${editPhoneCountry.dial}${phoneTrimmed}` } : {}),
        ...(dateNaissancePayload !== undefined ? { dateNaissance: dateNaissancePayload } : {}),
      });
      await refreshProfile?.();
      setIsEditing(false);
      Alert.alert(t('common.success'), t('profile.updateSuccess'));
    } catch (error) {
      if (__DEV__) console.error('Update profile error:', error);
      Alert.alert(t('common.error'), extractErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }, [editPrenom, editNom, editEmail, editPhoneLocal, editPhoneCountry, editDateNaissance, refreshProfile, t]);

  // ── Profile completion ──
  const profileChecklist = useMemo(() => ([
    { key: 'email', done: !!client?.email, label: t('home.profileFieldEmail') },
    { key: 'emailVerified', done: !!client?.emailVerified, label: t('home.profileFieldEmailVerified') },
    { key: 'phone', done: !!client?.telephone, label: t('home.profileFieldPhone') },
    { key: 'phoneVerified', done: !!client?.telephoneVerified, label: t('home.profileFieldPhoneVerified') },
    { key: 'birthDate', done: !!client?.dateNaissance, label: t('home.profileFieldBirthDate') },
  ]), [client?.email, client?.emailVerified, client?.telephone, client?.telephoneVerified, client?.dateNaissance, t]);

  const profileCompletionPercent = useMemo(() => {
    const doneCount = profileChecklist.filter((f) => f.done).length;
    return Math.round((doneCount / profileChecklist.length) * 100);
  }, [profileChecklist]);

  const missingProfileLabels = useMemo(
    () => profileChecklist.filter((f) => !f.done).map((f) => f.label),
    [profileChecklist],
  );

  return {
    isEditing,
    isSaving,
    editPrenom, setEditPrenom,
    editNom, setEditNom,
    editEmail, setEditEmail,
    editTelephone, setEditTelephone,
    editPhoneCountry, setEditPhoneCountry,
    editPhoneLocal, setEditPhoneLocal,
    editDateNaissance, setEditDateNaissance,
    showOtpModal, otpTarget, otpCode, otpError,
    isVerifyingOtp, isSendingOtp, otpResendTimer,
    profileCompletionPercent, missingProfileLabels,
    startEditing, cancelEditing, saveProfile,
    startOtpFlow, verifyOtpAndApply, resendOtp, dismissOtpModal,
    setOtpCode, setOtpError,
  };
}
