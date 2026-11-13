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

export type StoreField = 'name' | 'category' | 'phone' | 'location';

const STORE_NAME_MAX = 100;

interface Props {
  nomCommerce: string;
  onNameChange: (value: string) => void;
  showNameError: boolean;

  categorie: MerchantCategory | '';
  onOpenCategory: () => void;
  showCategoryError: boolean;

  phoneNumber: string;
  onPhoneChange: (value: string) => void;
  onPhoneBlur: () => void;
  defaultCountry: string;
  phoneChecking: boolean;
  phoneTaken: boolean;
  showPhoneRequired: boolean;
  showPhoneInvalid: boolean;
  onLoginInstead: () => void;

  location: StoreLocationState;
  isEcommerce: boolean;
  onToggleEcommerce: () => void;
  showLocationError: boolean;
  mapOpenRequest: number;
  referral: ReferralCodeState;

  nameRef: RefObject<TextInput | null>;
  phoneRef: RefObject<TextInput | null>;
  isLoading: boolean;
  onFieldLayout: (field: StoreField, e: LayoutChangeEvent) => void;
}

/** Step 2: the store (name, category, phone, position, referral). */
export function StoreStep({
  nomCommerce, onNameChange, showNameError, categorie, onOpenCategory, showCategoryError, phoneNumber, onPhoneChange, onPhoneBlur, defaultCountry, phoneChecking, phoneTaken, showPhoneRequired, showPhoneInvalid, onLoginInstead, location, isEcommerce, onToggleEcommerce, showLocationError, mapOpenRequest, referral, nameRef, phoneRef, isLoading, onFieldLayout,
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

      <View style={formStyles.field} onLayout={(e) => onFieldLayout('category', e)}>
        <Text style={[formStyles.label, { color: theme.text, textAlign: dir.textAlign }]}>
          {t('register.categoryLabel')} *
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
              borderColor: categorie ? palette.charbon : showCategoryError ? theme.danger : theme.border,
              borderWidth: categorie || showCategoryError ? 2 : 1.5,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={categorie ? getCategoryLabel(categorie) : t('register.categoryPlaceholder')}
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
        {showCategoryError && <FieldError>{t('registerExtra.categoryRequired')}</FieldError>}
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
        {showPhoneInvalid && <FieldError>{t('registerExtra.phoneInvalid')}</FieldError>}
        {phoneTaken && (
          <View style={[styles.takenRow, { flexDirection: dir.row }]}>
            <Text style={[formStyles.takenText, { color: theme.danger, textAlign: dir.textAlign }]}>{t('registerExtra.phoneAlreadyUsed')}</Text>
            <TouchableOpacity onPress={onLoginInstead} hitSlop={HIT_SLOP} accessibilityRole="link">
              <Text style={[styles.takenLink, { color: palette.charbon }]}>{t('register.loginLink')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <View onLayout={(e) => onFieldLayout('location', e)}>
        <LocationField
          location={location}
          disabled={isLoading}
          isEcommerce={isEcommerce}
          onToggleEcommerce={onToggleEcommerce}
          showError={showLocationError}
          openRequest={mapOpenRequest}
        />
      </View>

      <ReferralField referral={referral} disabled={isLoading} />
    </>
  );
}

const styles = StyleSheet.create({
  takenRow: { alignItems: 'center', gap: wp(8), marginTop: hp(6) },
  takenLink: { fontSize: fontSize.xs, fontFamily: font.semibold, textDecorationLine: 'underline' },
});
