import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, TextInput,
  StyleSheet, Platform, ActivityIndicator,
} from 'react-native';
import { Instagram, FileText, Music, Gift, Globe } from 'lucide-react-native';
import type { ThemeColors } from '@/contexts/ThemeContext';
import { palette } from '@/contexts/ThemeContext';
import { ms, wp, hp, fontSize, radius } from '@/utils/responsive';
import api from '@/services/api';
import PhoneInput from '@/components/PhoneInput';

export interface SocialInfoData {
  instagram: string;
  tiktok: string;
  website: string;
  storePhone: string;
  description: string;
  referralCode: string;
}

interface Props {
  theme: ThemeColors;
  t: (key: string, params?: Record<string, unknown>) => string;
  data: SocialInfoData;
  setData: (patch: Partial<SocialInfoData>) => void;
}

function StepSocialInfoInner({ theme, t, data, setData }: Props) {
  const { instagram, tiktok, website, storePhone, description, referralCode } = data;

  // Referral code validation state
  const [referralStatus, setReferralStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle');
  const [referralName, setReferralName] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const checkReferralCode = useCallback((code: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = code.trim().toUpperCase();
    if (!trimmed || trimmed.length < 4) {
      setReferralStatus('idle');
      setReferralName('');
      return;
    }
    setReferralStatus('checking');
    debounceRef.current = setTimeout(async () => {
      try {
        const { data: result } = await api.get(`/auth/referral/check/${encodeURIComponent(trimmed)}`);
        setReferralStatus('valid');
        setReferralName(result.nom || result.name || '');
      } catch {
        setReferralStatus('invalid');
        setReferralName('');
      }
    }, 600);
  }, []);

  const handleReferralChange = useCallback((v: string) => {
    setData({ referralCode: v });
    checkReferralCode(v);
  }, [setData, checkReferralCode]);

  return (
    <>
      {/* ── Optional badge ── */}
      <View style={[styles.optionalBadge, { backgroundColor: `${palette.charbon}08`, borderColor: `${palette.charbon}15` }]}>
        <Text style={[styles.optionalText, { color: theme.textMuted }]}>
          {t('registerExtra.socialOptionalHint')}
        </Text>
      </View>

      {/* ── Instagram ── */}
      <View style={styles.fieldGroup}>
        <Text style={[styles.label, { color: theme.text }]}>Instagram</Text>
        <View style={[styles.inputWrapper, {
          backgroundColor: theme.bgInput,
          borderColor: instagram.trim() ? palette.charbon : theme.border,
          borderWidth: instagram.trim() ? 2 : 1.5,
        }]}>
          <Instagram size={ms(16)} color={instagram.trim() ? palette.charbon : theme.textMuted} />
          <TextInput
            style={[styles.input, { color: theme.text }]}
            value={instagram}
            onChangeText={(v) => setData({ instagram: v })}
            placeholder={t('registerExtra.instagramPlaceholder')}
            placeholderTextColor={theme.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={200}
          />
        </View>
      </View>

      {/* ── TikTok ── */}
      <View style={styles.fieldGroup}>
        <Text style={[styles.label, { color: theme.text }]}>TikTok</Text>
        <View style={[styles.inputWrapper, {
          backgroundColor: theme.bgInput,
          borderColor: tiktok.trim() ? palette.charbon : theme.border,
          borderWidth: tiktok.trim() ? 2 : 1.5,
        }]}>
          <Music size={ms(16)} color={tiktok.trim() ? palette.charbon : theme.textMuted} />
          <TextInput
            style={[styles.input, { color: theme.text }]}
            value={tiktok}
            onChangeText={(v) => setData({ tiktok: v })}
            placeholder={t('registerExtra.tiktokPlaceholder')}
            placeholderTextColor={theme.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={200}
          />
        </View>
      </View>

      {/* ── Website ── */}
      <View style={styles.fieldGroup}>
        <Text style={[styles.label, { color: theme.text }]}>{t('registerExtra.websiteLabel')}</Text>
        <View style={[styles.inputWrapper, {
          backgroundColor: theme.bgInput,
          borderColor: website.trim() ? palette.charbon : theme.border,
          borderWidth: website.trim() ? 2 : 1.5,
        }]}>
          <Globe size={ms(16)} color={website.trim() ? palette.charbon : theme.textMuted} />
          <TextInput
            style={[styles.input, { color: theme.text }]}
            value={website}
            onChangeText={(v) => setData({ website: v })}
            placeholder={t('registerExtra.websitePlaceholder')}
            placeholderTextColor={theme.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            maxLength={200}
          />
        </View>
      </View>

      {/* ── Phone ── */}
      <View style={styles.fieldGroup}>
        <Text style={[styles.label, { color: theme.text }]}>{t('registerExtra.storePhoneLabel')}</Text>
        <PhoneInput
          value={storePhone}
          onChangeText={(v) => setData({ storePhone: v })}
          placeholder={t('registerExtra.storePhonePlaceholder')}
        />
      </View>

      {/* ── Description ── */}
      <View style={styles.fieldGroup}>
        <Text style={[styles.label, { color: theme.text }]}>{t('registerExtra.descriptionLabel')}</Text>
        <View style={[styles.inputWrapper, styles.descWrapper, {
          backgroundColor: theme.bgInput,
          borderColor: description.trim() ? palette.charbon : theme.border,
          borderWidth: description.trim() ? 2 : 1.5,
        }]}>
          <FileText size={ms(16)} color={description.trim() ? palette.charbon : theme.textMuted} style={{ marginTop: hp(2) }} />
          <TextInput
            style={[styles.input, styles.descInput, { color: theme.text }]}
            value={description}
            onChangeText={(v) => setData({ description: v })}
            placeholder={t('registerExtra.descriptionPlaceholder')}
            placeholderTextColor={theme.textMuted}
            multiline
            numberOfLines={3}
            maxLength={1000}
            textAlignVertical="top"
          />
        </View>
      </View>

      {/* ── Referral code ── */}
      <View style={styles.fieldGroup}>
        <Text style={[styles.label, { color: theme.text }]}>{t('referral.referralCodeLabel')}</Text>
        <View style={[styles.inputWrapper, {
          backgroundColor: theme.bgInput,
          borderColor: referralStatus === 'valid' ? '#16a34a' : referralStatus === 'invalid' ? theme.danger : referralCode.trim() ? palette.charbon : theme.border,
          borderWidth: referralCode.trim() ? 2 : 1.5,
        }]}>
          <Gift size={ms(16)} color={referralStatus === 'valid' ? '#16a34a' : referralStatus === 'invalid' ? theme.danger : referralCode.trim() ? palette.charbon : theme.textMuted} />
          <TextInput
            style={[styles.input, { color: theme.text }]}
            value={referralCode}
            onChangeText={handleReferralChange}
            placeholder={t('referral.referralCodePlaceholder')}
            placeholderTextColor={theme.textMuted}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={20}
          />
          {referralStatus === 'checking' && (
            <ActivityIndicator size="small" color={palette.charbon} />
          )}
        </View>
        {referralStatus === 'valid' && (
          <Text style={[styles.referralFeedback, { color: '#16a34a' }]}>
            {t('referral.referralCodeValid', { nom: referralName })}
          </Text>
        )}
        {referralStatus === 'invalid' && (
          <Text style={[styles.referralFeedback, { color: theme.danger }]}>
            {t('referral.referralCodeInvalid')}
          </Text>
        )}
        {referralStatus === 'idle' && (
          <Text style={[styles.referralFeedback, { color: theme.textMuted }]}>
            {t('registerExtra.referralHint')}
          </Text>
        )}
      </View>
    </>
  );
}

export const StepSocialInfo = React.memo(StepSocialInfoInner);

const styles = StyleSheet.create({
  optionalBadge: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: wp(12),
    paddingVertical: hp(6),
    marginBottom: hp(10),
    alignItems: 'center',
  },
  optionalText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    textAlign: 'center',
  },
  fieldGroup: { marginBottom: hp(10) },
  label: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    marginBottom: hp(4),
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingHorizontal: wp(12),
    gap: wp(8),
    minHeight: ms(42),
  },
  input: {
    flex: 1,
    fontSize: fontSize.sm,
    paddingVertical: Platform.OS === 'ios' ? hp(10) : hp(7),
  },
  descWrapper: {
    alignItems: 'flex-start',
  },
  descInput: {
    minHeight: ms(60),
    maxHeight: ms(80),
  },
  referralFeedback: {
    fontSize: fontSize.xs,
    marginTop: hp(3),
    paddingHorizontal: wp(4),
  },
});
