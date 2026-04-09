import React, { RefObject } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { Mail, Check } from 'lucide-react-native';
import { isValidEmail } from '@/utils/validation';
import type { ThemeColors } from '@/contexts/ThemeContext';
import { palette } from '@/contexts/ThemeContext';
import { wp, hp, ms, fontSize, radius } from '@/utils/responsive';

interface Props {
  theme: ThemeColors;
  t: (key: string, opts?: Record<string, unknown>) => string;
  email: string;
  setEmail: (v: string) => void;
  emailRef: RefObject<TextInput | null>;
  googleIdToken: string | null;
  setGoogleIdToken: (v: string | null) => void;
  google: {
    promptGoogle: () => void;
    isLoading: boolean;
    error: string | null;
  };
  isLoading: boolean;
}

function StepAccountInner({
  theme, t, email, setEmail, emailRef,
  googleIdToken, setGoogleIdToken, google, isLoading,
}: Props) {
  const emailValid = email ? isValidEmail(email) : false;
  return (
    <>
      {/* Google Sign-Up */}
      {!googleIdToken && (
        <>
          <TouchableOpacity
            style={[styles.googleBtn, { backgroundColor: theme.bgCard, borderColor: theme.border }]}
            onPress={google.promptGoogle}
            disabled={google.isLoading || isLoading}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t('registerExtra.signUpWithGoogle')}
          >
            {google.isLoading ? (
              <ActivityIndicator color={palette.charbon} size="small" />
            ) : (
              <>
                <View style={styles.googleIconWrap}>
                  <Text style={styles.googleG}>G</Text>
                </View>
                <Text style={[styles.googleBtnText, { color: theme.text }]}>
                  {t('registerExtra.signUpWithGoogle')}
                </Text>
              </>
            )}
          </TouchableOpacity>

          {!!google.error && (
            <Text style={[styles.hint, { color: theme.danger, textAlign: 'center', marginTop: 4 }]}>
              {google.error}
            </Text>
          )}

          <View style={styles.separator}>
            <View style={[styles.separatorLine, { backgroundColor: theme.border }]} />
            <Text style={[styles.separatorText, { color: theme.textMuted }]}>
              {t('login.orDivider')}
            </Text>
            <View style={[styles.separatorLine, { backgroundColor: theme.border }]} />
          </View>
        </>
      )}

      {/* Google linked badge */}
      {googleIdToken && (
        <View style={[styles.googleBadge, { backgroundColor: `${theme.success}12`, borderColor: `${theme.success}30` }]}>
          <Check size={16} color={theme.success} strokeWidth={2} />
          <Text style={[styles.googleBadgeText, { color: theme.success }]}>
            {t('registerExtra.googleLinked')}
          </Text>
          <TouchableOpacity onPress={() => setGoogleIdToken(null)} activeOpacity={0.7}>
            <Text style={[styles.googleBadgeReset, { color: theme.textMuted }]}>
              {t('registerExtra.googleChange')}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Email */}
      {!googleIdToken && (
        <View style={styles.field}>
          <Text style={[styles.label, { color: theme.text }]}>
            {t('register.emailLabel')} *
          </Text>
          <View
            style={[
              styles.inputRow,
              {
                backgroundColor: theme.bgInput,
                borderColor: email && isValidEmail(email) ? palette.charbon : email.length > 3 && !isValidEmail(email) ? theme.danger : email ? palette.charbon : theme.border,
                borderWidth: email && isValidEmail(email) ? 2 : 1.5,
              },
            ]}
          >
            <Mail size={ms(18)} color={emailValid ? palette.charbon : theme.textMuted} />
            <TextInput
              ref={emailRef}
              style={[styles.input, { color: theme.text }]}
              value={email}
              onChangeText={setEmail}
              placeholder={t('register.emailPlaceholder')}
              placeholderTextColor={theme.textMuted}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              autoFocus
              editable={!google.isLoading && !isLoading}
              returnKeyType="done"
            />
            {emailValid && (
              <Check size={ms(16)} color={palette.charbon} strokeWidth={2.5} />
            )}
          </View>
          {email.length > 3 && !emailValid && (
            <Text style={[styles.hint, { color: theme.danger }]}>{t('login.invalidEmail')}</Text>
          )}
        </View>
      )}

      {/* Secure note */}
      <View style={[styles.secureNote, { backgroundColor: `${theme.success}08` }]}>
        <Text style={[styles.secureNoteText, { color: theme.textMuted }]}>
          {t('registerExtra.secureNote')}
        </Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: hp(20) },
  label: { fontSize: fontSize.sm, fontWeight: '700', marginBottom: hp(8), letterSpacing: 0.2 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: radius.lg,
    paddingHorizontal: wp(14),
    height: hp(52),
    gap: wp(10),
  },
  input: { flex: 1, fontSize: fontSize.md, fontWeight: '500' },
  hint: { fontSize: fontSize.xs, marginTop: hp(6), lineHeight: ms(16) },
  secureNote: { padding: wp(14), borderRadius: radius.md, marginTop: hp(4) },
  secureNoteText: { fontSize: fontSize.xs, lineHeight: ms(18), textAlign: 'center' },
  separator: { flexDirection: 'row', alignItems: 'center', marginVertical: hp(14) },
  separatorLine: { flex: 1, height: 1 },
  separatorText: { marginHorizontal: wp(14), fontSize: fontSize.xs, fontWeight: '600' },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderRadius: radius.lg,
    height: hp(50),
    gap: wp(10),
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } },
      android: { elevation: 1 },
    }),
  },
  googleIconWrap: {
    width: ms(26),
    height: ms(26),
    borderRadius: ms(13),
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  googleG: { fontSize: ms(15), fontWeight: '700', color: '#4285F4' },
  googleBtnText: { fontSize: fontSize.md, fontWeight: '600' },
  googleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(8),
    padding: wp(12),
    borderRadius: radius.lg,
    borderWidth: 1.5,
    marginBottom: hp(14),
  },
  googleBadgeText: { flex: 1, fontSize: fontSize.sm, fontWeight: '600' },
  googleBadgeReset: { fontSize: fontSize.xs, fontWeight: '600', textDecorationLine: 'underline' },
});

export const StepAccount = React.memo(StepAccountInner);
