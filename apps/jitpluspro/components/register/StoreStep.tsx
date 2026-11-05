import type { RefObject } from 'react';
import { ActivityIndicator, Keyboard, StyleSheet, Text, TextInput, TouchableOpacity, View, type LayoutChangeEvent } from 'react-native';
import { Check, ChevronDown, Tag } from 'lucide-react-native';
import { JitStore } from '@/components/icons';
import MerchantCategoryIcon from '@/components/MerchantCategoryIcon';
import PhoneInput from '@/components/PhoneInput';
import { getCategoryLabel } from '@/constants/categories';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDir } from '@/hooks/useDir';
import type { StoreLocationState } from '@/hooks/useStoreLocation';
import type { ReferralCodeState } from '@/hooks/useReferralCode';
import type { MerchantCategory } from '@/types';
import { font, icon } from '@/constants/design';
import { wp, hp, ms, fontSize } from '@/utils/responsive';
import { FieldError } from './FieldError';
import { LocationField } from './LocationField';
import { ReferralField } from './ReferralField';
import { formStyles, HIT_SLOP } from './formStyles';

export type StoreField = 'name' | 'phone' | 'terms';

const STORE_NAME_MAX = 100;

interface Props {
  nomCommerce: string;
  onNameChange: (value: string) => void;
  showNameError: boolean;

  categorie: MerchantCategory | '';
  onOpenCategory: () => void;

  phoneNumber: string;
  onPhoneChange: (value: string) => void;
  onPhoneBlur: () => void;
  defaultCountry: string;
  phoneChecking: boolean;
  phoneTaken: boolean;
  showPhoneRequired: boolean;
  onLoginInstead: () => void;

  location: StoreLocationState;
  referral: ReferralCodeState;

  termsAccepted: boolean;
  onToggleTerms: () => void;
  onOpenTerms: () => void;
  showTermsError: boolean;

  nameRef: RefObject<TextInput | null>;
  phoneRef: RefObject<TextInput | null>;
  isLoading: boolean;
  onFieldLayout: (field: StoreField, e: LayoutChangeEvent) => void;
}

/** Step 2: the store (name, category, phone, position, referral, terms). */
export function StoreStep({
  nomCommerce, onNameChange, showNameError, categorie, onOpenCategory, phoneNumber, onPhoneChange, onPhoneBlur, defaultCountry, phoneChecking, phoneTaken, showPhoneRequired, onLoginInstead, location, referral, termsAccepted, onToggleTerms, onOpenTerms, showTermsError, nameRef, phoneRef, isLoading, onFieldLayout,
}: Props) {
  const theme = useTheme();
  const { t } = useLanguage();
  const dir = useDir();
  const nameValid = nomCommerce.trim().length > 0;

  return (
    <>
      <View style={formStyles.field} onLayout={(e) => onFieldLayout('name', e)}>
        <Text style={[formStyles.label, { color: theme.text, textAlign: dir.textAlign }]}>{t('register.nameLabel')} *</Text>
        <View
          style={[
            formStyles.inputRow,
            {
              flexDirection: dir.row,
              backgroundColor: theme.bgInput,
              borderColor: nameValid ? palette.charbon : showNameError ? theme.danger : theme.border,
              borderWidth: nameValid || showNameError ? 2 : 1.5,
            },
          ]}
        >
          <JitStore size={ms(18)} color={nameValid ? palette.charbon : theme.textMuted} strokeWidth={icon.stroke} />
          <TextInput
            ref={nameRef}
            style={[formStyles.input, { color: theme.text, textAlign: dir.textAlign }]}
            value={nomCommerce}
            onChangeText={onNameChange}
            placeholder={t('register.namePlaceholder')}
            placeholderTextColor={theme.textMuted}
            maxLength={STORE_NAME_MAX}
            textContentType="organizationName"
            autoCapitalize="words"
            editable={!isLoading}
            autoFocus
            returnKeyType="next"
            onSubmitEditing={() => phoneRef.current?.focus()}
          />
          {nameValid && <Check size={ms(16)} color={palette.charbon} strokeWidth={icon.stroke} />}
        </View>
        {showNameError && <FieldError>{t('registerExtra.nameRequired')}</FieldError>}
      </View>

      <View style={formStyles.field}>
        <Text style={[formStyles.label, { color: theme.text, textAlign: dir.textAlign }]}>
          {t('register.categoryLabel')}{' '}
          <Text style={[formStyles.optionalTag, { color: theme.textMuted }]}>({t('registerExtra.optional')})</Text>
        </Text>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => { Keyboard.dismiss(); onOpenCategory(); }}
          disabled={isLoading}
          style={[
            formStyles.inputRow,
            {
              flexDirection: dir.row,
              backgroundColor: theme.bgInput,
              borderColor: categorie ? palette.charbon : theme.border,
              borderWidth: categorie ? 2 : 1.5,
            },
          ]}
          accessibilityRole="button"
        >
          {categorie ? (
            <MerchantCategoryIcon category={categorie} size={ms(20)} />
          ) : (
            <Tag size={ms(18)} color={theme.textMuted} strokeWidth={icon.stroke} />
          )}
          <Text
            style={[formStyles.input, { color: categorie ? theme.text : theme.textMuted, textAlign: dir.textAlign }]}
            numberOfLines={1}
          >
            {categorie ? getCategoryLabel(categorie) : t('register.categoryPlaceholder')}
          </Text>
          <ChevronDown size={ms(18)} color={theme.textMuted} strokeWidth={icon.stroke} />
        </TouchableOpacity>
      </View>

      <View style={formStyles.field} onLayout={(e) => onFieldLayout('phone', e)}>
        <View style={[formStyles.labelRow, { flexDirection: dir.row }]}>
          <Text style={[formStyles.label, formStyles.labelInline, { color: theme.text }]}>{t('registerExtra.phoneLabel')} *</Text>
          {phoneChecking && <ActivityIndicator size="small" color={palette.charbon} />}
        </View>
        {/* Errors show only after the field is left, never on an empty number. */}
        <PhoneInput
          ref={phoneRef}
          value={phoneNumber}
          onChangeText={onPhoneChange}
          onBlur={onPhoneBlur}
          autoComplete="tel"
          textContentType="telephoneNumber"
          defaultCountry={defaultCountry}
          editable={!isLoading}
          // Last text field of the step.
          returnKeyType="done"
        />
        {showPhoneRequired && <FieldError>{t('registerExtra.phoneRequired')}</FieldError>}
        {phoneTaken && (
          <View style={[styles.takenRow, { flexDirection: dir.row }]}>
            <Text style={[formStyles.takenText, { color: theme.danger, textAlign: dir.textAlign }]}>{t('registerExtra.phoneAlreadyUsed')}</Text>
            <TouchableOpacity onPress={onLoginInstead} hitSlop={HIT_SLOP} accessibilityRole="link">
              <Text style={[styles.takenLink, { color: palette.charbon }]}>{t('register.loginLink')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <LocationField location={location} disabled={isLoading} />

      <ReferralField referral={referral} disabled={isLoading} />

      <View onLayout={(e) => onFieldLayout('terms', e)}>
        <TouchableOpacity
          style={[styles.termsRow, { flexDirection: dir.row }]}
          onPress={onToggleTerms}
          activeOpacity={0.7}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: termsAccepted }}
        >
          <View
            style={[
              styles.checkbox,
              dir.isRTL ? styles.checkboxRtl : styles.checkboxLtr,
              {
                borderColor: termsAccepted ? theme.primary : showTermsError ? theme.danger : theme.border,
                backgroundColor: termsAccepted ? theme.primary : 'transparent',
              },
            ]}
          >
            {termsAccepted && <Check size={ms(14)} color="#fff" strokeWidth={icon.strokeSmall} />}
          </View>
          <Text style={[styles.termsText, { color: theme.textSecondary, textAlign: dir.textAlign }]}>
            {t('registerExtra.termsText')}{' '}
            <Text style={[styles.termsLink, { color: theme.primary }]} onPress={onOpenTerms}>
              {t('registerExtra.termsLink')}
            </Text>
          </Text>
        </TouchableOpacity>
        {showTermsError && <FieldError>{t('registerExtra.termsRequired')}</FieldError>}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  takenRow: { alignItems: 'center', gap: wp(8), marginTop: hp(6) },
  takenLink: { fontSize: fontSize.xs, fontFamily: font.bold, textDecorationLine: 'underline' },
  termsRow: { alignItems: 'center', marginTop: hp(2), marginBottom: hp(1), paddingHorizontal: wp(1) },
  checkbox: { width: ms(22), height: ms(22), borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  checkboxLtr: { marginRight: ms(10) },
  checkboxRtl: { marginLeft: ms(10) },
  termsText: { flex: 1, fontSize: fontSize.sm, lineHeight: ms(20), fontFamily: font.regular },
  termsLink: { fontFamily: font.semibold },
});
