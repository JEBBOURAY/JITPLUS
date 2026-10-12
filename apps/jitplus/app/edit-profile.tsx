import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  ActivityIndicator, Alert, I18nManager, Keyboard, KeyboardAvoidingView, Platform,
  Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useNavigation, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Calendar, Mail, User } from 'lucide-react-native';
import { palette, useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import PremiumPhoneInput from '@/components/PremiumPhoneInput';
import { FieldLabel, OtpVerificationModal, ProfileTextField, VerificationBadge } from '@/components/profile';
import { useProfileEditing } from '@/hooks/useProfileEditing';
import { formatDateInput } from '@/utils/dateInput';
import { useAppFonts } from '@/utils/fonts';
import { hapticSuccess } from '@/utils/haptics';
import { fontSize as FS, hp, ms, radius, wp } from '@/utils/responsive';

export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ScreenErrorBoundary';

const BACK_FLIP = I18nManager.isRTL ? { transform: [{ scaleX: -1 }] } : undefined;

export default function EditProfileScreen() {
  const theme = useTheme();
  const fonts = useAppFonts();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const navigation = useNavigation();
  const { t } = useLanguage();
  const { client, refreshProfile } = useAuth();
  const form = useProfileEditing(client, refreshProfile, t);
  const {
    fields, isDirty, isSaving, saveProfile, discardDraft, startOtpFlow, otpTarget, isSendingOtp, setDateNaissance,
  } = form;

  const nomRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const allowLeaveRef = useRef(false);
  const isDirtyRef = useRef(isDirty);

  useEffect(() => { isDirtyRef.current = isDirty; }, [isDirty]);

  useEffect(() => {
    if (client?.id) return;
    allowLeaveRef.current = true;
    router.replace('/login');
  }, [client?.id, router]);

  // iOS swipe-back can't be intercepted by beforeRemove on native-stack, so it
  // is disabled while there are unsaved changes.
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: !isDirty });
  }, [navigation, isDirty]);

  useEffect(() => navigation.addListener('beforeRemove', (e) => {
    if (allowLeaveRef.current || !isDirtyRef.current) return;
    e.preventDefault();
    Alert.alert(t('profile.discardTitle'), t('profile.discardBody'), [
      { text: t('profile.keepEditing'), style: 'cancel' },
      {
        text: t('profile.discard'),
        style: 'destructive',
        onPress: () => {
          discardDraft();
          allowLeaveRef.current = true;
          navigation.dispatch(e.data.action);
        },
      },
    ]);
  }), [navigation, discardDraft, t]);

  const handleSave = useCallback(async () => {
    Keyboard.dismiss();
    if (await saveProfile()) {
      hapticSuccess();
      allowLeaveRef.current = true;
      router.back();
    }
  }, [saveProfile, router]);

  const handleDateChange = useCallback((v: string) => setDateNaissance(formatDateInput(v)), [setDateNaissance]);

  // Badges only describe the saved value; once the user edits the field it no
  // longer applies.
  const emailUnchanged = !!client?.email && fields.email.trim() === client.email;
  const composedPhone = fields.phoneLocal.startsWith('+') ? fields.phoneLocal : `${fields.phoneCountry.dial}${fields.phoneLocal}`;
  const phoneUnchanged = !!client?.telephone && composedPhone === client.telephone;
  const sendingEmailOtp = isSendingOtp && otpTarget?.type === 'email';
  const sendingPhoneOtp = isSendingOtp && otpTarget?.type === 'telephone';

  const emailBadge = useMemo(() => (emailUnchanged ? (
    <VerificationBadge
      verified={!!client?.emailVerified}
      loading={sendingEmailOtp}
      onVerify={() => startOtpFlow({ type: 'email', value: client?.email ?? '' })}
    />
  ) : null), [emailUnchanged, client, sendingEmailOtp, startOtpFlow]);

  const phoneBadge = useMemo(() => (phoneUnchanged ? (
    <VerificationBadge
      verified={!!client?.telephoneVerified}
      loading={sendingPhoneOtp}
      onVerify={() => startOtpFlow({ type: 'telephone', value: client?.telephone ?? '' })}
    />
  ) : null), [phoneUnchanged, client, sendingPhoneOtp, startOtpFlow]);

  const initials = `${fields.prenom.trim().charAt(0)}${fields.nom.trim().charAt(0)}`.toUpperCase() || '?';
  const canSave = isDirty && !isSaving;

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={[styles.header, { paddingTop: insets.top + hp(6), borderBottomColor: theme.border }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          disabled={isSaving}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          style={({ pressed }) => [styles.backBtn, { backgroundColor: theme.bgCard, borderColor: theme.border }, pressed && styles.pressed]}
        >
          <ArrowLeft size={ms(20)} color={theme.text} strokeWidth={2} style={BACK_FLIP} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text, fontFamily: fonts.semibold }]} numberOfLines={1} accessibilityRole="header">
          {t('profile.editProfile')}
        </Text>
        <View style={styles.backBtnSpacer} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.avatarBlock}>
            <LinearGradient
              colors={[palette.violet, palette.violetVivid, palette.gold]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.avatarRing}
            >
              <View style={[styles.avatarInner, { backgroundColor: theme.isDark ? palette.violetDeep : palette.violet }]}>
                <Text style={[styles.avatarText, { fontFamily: fonts.bold }]}>{initials}</Text>
              </View>
            </LinearGradient>
            <Text style={[styles.subtitle, { color: theme.textMuted, fontFamily: fonts.regular }]}>
              {t('profile.editProfileSubtitle')}
            </Text>
          </View>

          <Text style={[styles.sectionTitle, { color: theme.textMuted, fontFamily: fonts.semibold }]}>
            {t('profile.identitySection')}
          </Text>
          <ProfileTextField
            label={t('profile.firstName')}
            icon={User}
            value={fields.prenom}
            onChangeText={form.setPrenom}
            placeholder={t('profile.firstNamePlaceholder')}
            autoCapitalize="words"
            autoComplete="given-name"
            textContentType="givenName"
            returnKeyType="next"
            onSubmitEditing={() => nomRef.current?.focus()}
            submitBehavior="submit"
          />
          <ProfileTextField
            ref={nomRef}
            label={t('profile.lastName')}
            icon={User}
            value={fields.nom}
            onChangeText={form.setNom}
            placeholder={t('profile.lastNamePlaceholder')}
            autoCapitalize="words"
            autoComplete="family-name"
            textContentType="familyName"
            returnKeyType="next"
            onSubmitEditing={() => emailRef.current?.focus()}
            submitBehavior="submit"
          />

          <Text style={[styles.sectionTitle, { color: theme.textMuted, fontFamily: fonts.semibold }]}>
            {t('profile.contactSection')}
          </Text>
          <ProfileTextField
            ref={emailRef}
            label={t('profile.email')}
            icon={Mail}
            badge={emailBadge}
            value={fields.email}
            onChangeText={form.setEmail}
            placeholder={t('profile.emailPlaceholder')}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="done"
          />

          <FieldLabel label={t('profile.phone')} badge={phoneBadge} />
          <PremiumPhoneInput
            value={fields.phoneLocal}
            onChangePhone={form.setPhoneLocal}
            country={fields.phoneCountry}
            onChangeCountry={form.setPhoneCountry}
            accentColor={theme.primary}
            errorMessage={t('profile.phoneInvalid')}
          />

          <ProfileTextField
            label={t('profile.dateNaissance')}
            labelHint={`(${t('profile.optional')})`}
            icon={Calendar}
            value={fields.dateNaissance}
            onChangeText={handleDateChange}
            placeholder={t('profile.dateNaissancePlaceholder')}
            keyboardType="number-pad"
            maxLength={10}
            clearLabel={t('common.delete')}
          />
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + hp(10), backgroundColor: theme.bg, borderTopColor: theme.border }]}>
          <Pressable
            onPress={handleSave}
            disabled={!canSave}
            accessibilityRole="button"
            accessibilityLabel={t('common.save')}
            accessibilityState={{ disabled: !canSave, busy: isSaving }}
            style={({ pressed }) => [
              styles.saveBtn,
              { backgroundColor: palette.violet },
              !canSave && !isSaving && styles.saveBtnDisabled,
              pressed && styles.pressed,
            ]}
          >
            {isSaving
              ? <ActivityIndicator color="#fff" />
              : <Text style={[styles.saveText, { fontFamily: fonts.semibold }]}>{t('common.save')}</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <OtpVerificationModal
        visible={form.showOtpModal}
        targetValue={otpTarget?.value || ''}
        otpCode={form.otpCode}
        otpError={form.otpError}
        isVerifying={form.isVerifyingOtp}
        isSending={isSendingOtp}
        resendTimer={form.otpResendTimer}
        onChangeCode={form.changeOtpCode}
        onVerify={form.verifyOtpAndApply}
        onResend={form.resendOtp}
        onClose={form.dismissOtpModal}
      />
    </View>
  );
}

const AVATAR = ms(76);

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(12),
    paddingHorizontal: wp(16),
    paddingBottom: hp(10),
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: ms(40),
    height: ms(40),
    borderRadius: ms(20),
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnSpacer: { width: ms(40) },
  headerTitle: { flex: 1, fontSize: FS.lg, textAlign: 'center' },
  content: { paddingHorizontal: wp(20), paddingTop: hp(20), paddingBottom: hp(24) },
  avatarBlock: { alignItems: 'center', marginBottom: hp(20) },
  avatarRing: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2, padding: ms(3) },
  avatarInner: { flex: 1, borderRadius: AVATAR / 2, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: FS['2xl'], letterSpacing: 0.5 },
  subtitle: { fontSize: FS.sm, textAlign: 'center', marginTop: hp(12), lineHeight: ms(19), paddingHorizontal: wp(16) },
  sectionTitle: {
    fontSize: FS.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: hp(6),
    marginBottom: hp(12),
    marginHorizontal: wp(2),
    textAlign: 'left',
  },
  footer: {
    paddingHorizontal: wp(20),
    paddingTop: hp(10),
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  saveBtn: {
    height: ms(52),
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnDisabled: { opacity: 0.45 },
  saveText: { color: '#fff', fontSize: FS.md },
  pressed: { opacity: 0.8 },
});
