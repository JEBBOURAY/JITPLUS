import { useState, useMemo, useCallback, useEffect, useRef, forwardRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, StyleProp, ViewStyle, TextInputProps, Animated } from 'react-native';
import { ChevronDown, Phone } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDir } from '@/hooks/useDir';
import { font, icon } from '@/constants/design';
import CountryPickerModal from '@/components/CountryPickerModal';
import { COUNTRIES, DEFAULT_COUNTRY } from '@/constants/Countries';
import { isValidPhoneForCountry, formatPhoneLocal } from '@jitplus/shared';
import type { CountryCode } from '@jitplus/shared';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface PhoneInputProps extends Omit<TextInputProps, 'onChangeText' | 'value' | 'style'> {
  value: string;
  onChangeText: (value: string) => void;
  style?: StyleProp<ViewStyle>;
  /** Show validation state only after user has interacted */
  showValidation?: boolean;
}

/** Parse stored value "+212612..." or local "0612..." into dialCode + localPart + country */
export function parsePhone(value: string | undefined | null): {
  dialCode: string;
  localPart: string;
  country: CountryCode;
} {
  const safeVal = value || '';
  if (safeVal.startsWith('+')) {
    // Sort by dial length desc to match longest prefix first (e.g. +212 before +2)
    const sorted = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);
    const match = sorted.find((c) => safeVal.startsWith(c.dial));
    if (match) {
      return { dialCode: match.dial, localPart: safeVal.slice(match.dial.length), country: match };
    }
  }
  // Default to Morocco, clean leading 0
  const localPart = safeVal.replace(/^0+/, '');
  return { dialCode: DEFAULT_COUNTRY.dial, localPart, country: DEFAULT_COUNTRY };
}

const PhoneInput = forwardRef<TextInput, PhoneInputProps>(
  ({ value, onChangeText, placeholder, showValidation = true, style, ...rest }, ref) => {
    const theme = useTheme();
    const { t } = useLanguage();
    const dir = useDir();
    const insets = useSafeAreaInsets();
    const [showPicker, setShowPicker] = useState(false);
    const [touched, setTouched] = useState(false);
    const [isFocused, setIsFocused] = useState(false);

    const parsed = useMemo(() => parsePhone(value), [value]);

    // Real validation using shared rules (ANRT-compliant for Morocco)
    const isPhoneValid = useMemo(
      () => isValidPhoneForCountry(parsed.localPart, parsed.country),
      [parsed.localPart, parsed.country],
    );

    // Determine visual validation state
    const hasContent = parsed.localPart.length > 0;
    const showError = touched && hasContent && !isPhoneValid && showValidation;
    const showSuccess = hasContent && isPhoneValid;

    const borderAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
      Animated.timing(borderAnim, {
        toValue: isFocused ? 1 : 0,
        duration: 200,
        useNativeDriver: false,
      }).start();
    }, [isFocused, borderAnim]);

    const borderColor = showSuccess
      ? theme.success
      : showError
        ? theme.danger
        : borderAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [theme.border, theme.success],
          });

    const borderWidth = showSuccess || showError || isFocused ? 2 : 1;

    const handleCountrySelect = useCallback(
      (index: number) => {
        const newCountry = COUNTRIES[index];
        // Trim local part to new country's maxDigits
        const trimmed = parsed.localPart.slice(0, newCountry.maxDigits);
        onChangeText(newCountry.dial + trimmed);
        setShowPicker(false);
      },
      [parsed.localPart, onChangeText],
    );

    const handleLocalChange = useCallback(
      (text: string) => {
        // Keep only digits
        let cleaned = text.replace(/[^0-9]/g, '');
        // Strip leading 0 (local format) to store internationally clean
        if (cleaned.startsWith('0') && cleaned.length > 1) {
          cleaned = cleaned.substring(1);
        }
        // Enforce maxDigits for the selected country
        if (cleaned.length > parsed.country.maxDigits) {
          cleaned = cleaned.slice(0, parsed.country.maxDigits);
        }
        onChangeText(parsed.dialCode + cleaned);
      },
      [parsed.dialCode, parsed.country.maxDigits, onChangeText],
    );

    const handleFocus = useCallback(() => {
      setIsFocused(true);
    }, []);

    const handleBlur = useCallback(() => {
      setTouched(true);
      setIsFocused(false);
    }, []);

    const selectedCountry = parsed.country;

    // Dynamic placeholder based on selected country
    const dynamicPlaceholder = useMemo(() => {
      if (placeholder) return placeholder;
      // Generate a placeholder pattern from maxDigits
      const md = selectedCountry.maxDigits;
      if (selectedCountry.code === 'MA') return '6 XX XX XX XX';
      if (md === 8) return 'XX XX XX XX';
      if (md === 9) return 'X XX XX XX XX';
      if (md === 10) return 'XX XX XX XX XX';
      if (md === 11) return 'XXX XX XX XX XX';
      return 'X'.repeat(md);
    }, [placeholder, selectedCountry]);

    // Digit counter
    const digitCount = parsed.localPart.replace(/\D/g, '').length;
    const maxDigits = selectedCountry.maxDigits;

    return (
      <>
        <Animated.View
          style={[styles.container, { flexDirection: dir.row, backgroundColor: theme.bgInput, borderColor, borderWidth }, style]}
        >
          <TouchableOpacity
            activeOpacity={0.7}
            style={[styles.countryBtn, { flexDirection: dir.row }]}
            onPress={() => setShowPicker(true)}
            accessibilityRole="button"
            accessibilityLabel={t('common.selectCountry')}
          >
            <Text style={styles.flag}>{selectedCountry.flag}</Text>
            <Text style={[styles.dialCode, { color: theme.textSecondary }]}>{selectedCountry.dial}</Text>
            <ChevronDown size={14} color={theme.textMuted} strokeWidth={icon.strokeSmall} />
          </TouchableOpacity>

          <View style={[styles.divider, { backgroundColor: theme.borderLight }]} />

          <View style={[styles.inputWrapper, { flexDirection: dir.row }, dir.isRTL ? styles.inputWrapperRtl : styles.inputWrapperLtr]}>
            <Phone
              size={18}
              color={showSuccess ? theme.success : showError ? theme.danger : theme.textMuted}
              strokeWidth={icon.stroke}
              style={dir.isRTL ? styles.iconRtl : styles.icon}
            />
            <TextInput
              ref={ref}
              style={[styles.input, { color: theme.text, textAlign: dir.textAlign }]}
              value={parsed.localPart}
              onChangeText={handleLocalChange}
              onFocus={handleFocus}
              onBlur={handleBlur}
              keyboardType="phone-pad"
              placeholder={dynamicPlaceholder}
              placeholderTextColor={theme.textMuted}
              autoCorrect={false}
              maxLength={maxDigits + 4} // Allow some slack for spaces if pasted
              {...rest}
            />
          </View>

          {hasContent && (
            <View
              style={[
                styles.validationDot,
                dir.isRTL ? styles.validationDotRtl : styles.validationDotLtr,
                {
                  backgroundColor: showSuccess ? theme.success : showError ? theme.danger : theme.border,
                },
              ]}
            />
          )}
        </Animated.View>

        <View style={[styles.hintRow, { flexDirection: dir.row }]}>
          {showValidation && hasContent && showError && (
            <Text style={[styles.hintText, { color: theme.danger, textAlign: dir.textAlign }]}>
              {selectedCountry.code === 'MA'
                ? t('phoneInput.maFormat')
                : t('phoneInput.digitCount', { count: digitCount, max: maxDigits })}
            </Text>
          )}
          {showValidation && hasContent && showSuccess && (
            <Text style={[styles.hintText, { color: theme.success, textAlign: dir.textAlign }]}>
              {selectedCountry.dial} {formatPhoneLocal(parsed.localPart)}
            </Text>
          )}
          {isFocused && hasContent && (
            <Text
              style={[
                styles.digitCounterText,
                {
                  textAlign: dir.isRTL ? 'left' : 'right',
                  color: showSuccess
                    ? theme.success
                    : digitCount >= maxDigits
                      ? theme.danger
                      : theme.textMuted,
                },
              ]}
            >
              {digitCount}/{maxDigits}
            </Text>
          )}
        </View>

        {showPicker && (
          <CountryPickerModal
            visible={showPicker}
            selectedCode={selectedCountry.code}
            onSelect={handleCountrySelect}
            onClose={() => setShowPicker(false)}
            topInset={insets.top}
          />
        )}
      </>
    );
  },
);

export default PhoneInput;

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    height: 52,
  },
  countryBtn: {
    alignItems: 'center',
    paddingHorizontal: 12,
    height: '100%',
    gap: 6,
  },
  flag: {
    fontSize: 18,
  },
  dialCode: {
    fontSize: 15,
    fontFamily: font.semibold,
  },
  divider: {
    width: 1,
    height: 24,
  },
  inputWrapper: {
    flex: 1,
    alignItems: 'center',
    height: '100%',
  },
  inputWrapperLtr: { paddingLeft: 12 },
  inputWrapperRtl: { paddingRight: 12 },
  icon: {
    marginRight: 10,
  },
  iconRtl: {
    marginLeft: 10,
  },
  input: {
    flex: 1,
    fontSize: 15,
    height: '100%',
    letterSpacing: 0.5,
    fontFamily: font.regular,
  },
  validationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  validationDotLtr: { marginRight: 14 },
  validationDotRtl: { marginLeft: 14 },
  hintRow: {
    marginTop: 4,
    paddingHorizontal: 4,
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 18,
  },
  hintText: {
    fontSize: 12,
    flex: 1,
    fontFamily: font.medium,
  },
  digitCounterText: {
    fontSize: 11,
    fontFamily: font.medium,
  },
});
