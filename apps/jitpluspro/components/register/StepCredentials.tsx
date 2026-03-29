import React, { RefObject } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Mail, Phone, Lock, Eye, EyeOff, Check } from 'lucide-react-native';
import { isValidEmail } from '@/utils/validation';
import { MIN_PASSWORD_LENGTH } from '@/constants/app';
import type { ThemeColors } from '@/contexts/ThemeContext';

interface Props {
  theme: ThemeColors;
  t: (key: string, opts?: Record<string, unknown>) => string;
  email: string;
  setEmail: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  phoneNumber: string;
  setPhoneNumber: (v: string) => void;
  showPassword: boolean;
  setShowPassword: (v: boolean) => void;
  emailRef: RefObject<TextInput | null>;
  phoneRef: RefObject<TextInput | null>;
  passwordRef: RefObject<TextInput | null>;
}

export function StepCredentials({
  theme, t, email, setEmail, password, setPassword,
  phoneNumber, setPhoneNumber, showPassword, setShowPassword,
  emailRef, phoneRef, passwordRef,
}: Props) {
  return (
    <>
      {/* Email */}
      <View style={styles.field}>
        <Text style={[styles.label, { color: theme.text }]}>
          {t('register.emailLabel')} *
        </Text>
        <View
          style={[
            styles.inputRow,
            {
              backgroundColor: theme.bgInput,
              borderColor: email && isValidEmail(email) ? theme.success : email.length > 3 && !isValidEmail(email) ? theme.danger : email ? theme.primary : theme.border,
            },
          ]}
        >
          <Mail size={20} color={email && isValidEmail(email) ? theme.success : theme.textMuted} />
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
            returnKeyType="next"
            onSubmitEditing={() => phoneRef.current?.focus()}
          />
          {email && isValidEmail(email) && (
            <Check size={18} color={theme.success} strokeWidth={2.5} />
          )}
        </View>
        {email.length > 3 && !isValidEmail(email) && (
          <Text style={[styles.hint, { color: theme.danger }]}>{t('login.invalidEmail')}</Text>
        )}
        {email && isValidEmail(email) && (
          <Text style={[styles.hint, { color: theme.success }]}>{t('registerExtra.emailValid')}</Text>
        )}
        {!email && (
          <Text style={[styles.hint, { color: theme.textMuted }]}>{t('registerExtra.emailHint')}</Text>
        )}
      </View>

      {/* Phone */}
      <View style={styles.field}>
        <Text style={[styles.label, { color: theme.text }]}>
          {t('registerExtra.phoneLabel')} *
        </Text>
        <View
          style={[
            styles.inputRow,
            {
              backgroundColor: theme.bgInput,
              borderColor: phoneNumber.trim().length >= 7 ? theme.success : phoneNumber ? theme.primary : theme.border,
            },
          ]}
        >
          <Phone size={20} color={phoneNumber.trim().length >= 7 ? theme.success : theme.textMuted} />
          <TextInput
            ref={phoneRef}
            style={[styles.input, { color: theme.text }]}
            value={phoneNumber}
            onChangeText={setPhoneNumber}
            placeholder={t('registerExtra.phonePlaceholder')}
            placeholderTextColor={theme.textMuted}
            keyboardType="phone-pad"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
          />
          {phoneNumber.trim().length >= 7 && (
            <Check size={18} color={theme.success} strokeWidth={2.5} />
          )}
        </View>
        <Text style={[styles.hint, { color: theme.textMuted }]}>{t('registerExtra.phoneHint')}</Text>
      </View>

      {/* Password */}
      <View style={styles.field}>
        <Text style={[styles.label, { color: theme.text }]}>
          {t('register.passwordLabel')} *
        </Text>
        <View
          style={[
            styles.inputRow,
            {
              backgroundColor: theme.bgInput,
              borderColor:
                password.length === 0 ? theme.border
                  : password.length >= MIN_PASSWORD_LENGTH ? theme.success
                  : theme.danger,
            },
          ]}
        >
          <Lock size={20} color={password.length >= MIN_PASSWORD_LENGTH ? theme.success : theme.textMuted} />
          <TextInput
            ref={passwordRef}
            style={[styles.input, { color: theme.text }]}
            value={password}
            onChangeText={setPassword}
            placeholder={t('registerExtra.passwordPlaceholder', { count: MIN_PASSWORD_LENGTH })}
            placeholderTextColor={theme.textMuted}
            secureTextEntry={!showPassword}
            returnKeyType="done"
          />
          <TouchableOpacity onPress={() => setShowPassword(!showPassword)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            {showPassword ? <EyeOff size={20} color={theme.textMuted} /> : <Eye size={20} color={theme.textMuted} />}
          </TouchableOpacity>
          {password.length >= MIN_PASSWORD_LENGTH && (
            <Check size={18} color={theme.success} style={{ marginLeft: 4 }} />
          )}
        </View>
        {/* Strength bar */}
        {password.length > 0 && (
          <View style={{ marginTop: 6 }}>
            <View style={{ height: 4, borderRadius: 2, backgroundColor: theme.border, overflow: 'hidden' }}>
              <View
                style={{
                  width: `${Math.min((password.length / MIN_PASSWORD_LENGTH) * 100, 100)}%`,
                  height: '100%',
                  borderRadius: 2,
                  backgroundColor: password.length >= MIN_PASSWORD_LENGTH ? theme.success : theme.danger,
                }}
              />
            </View>
            <Text
              style={[
                styles.hint,
                { color: password.length >= MIN_PASSWORD_LENGTH ? theme.success : theme.danger, marginTop: 4 },
              ]}
            >
              {password.length < MIN_PASSWORD_LENGTH
                ? t('registerExtra.passwordTooShort', { count: MIN_PASSWORD_LENGTH - password.length })
                : t('registerExtra.passwordValid')}
            </Text>
          </View>
        )}
      </View>

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
  field: { marginBottom: 20 },
  label: { fontSize: 15, fontWeight: '700', marginBottom: 8 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 52,
    gap: 10,
  },
  input: { flex: 1, fontSize: 15, fontWeight: '500' },
  hint: { fontSize: 12, marginTop: 6, lineHeight: 16 },
  secureNote: { padding: 14, borderRadius: 12, marginTop: 4 },
  secureNoteText: { fontSize: 12, lineHeight: 18, textAlign: 'center' },
});
