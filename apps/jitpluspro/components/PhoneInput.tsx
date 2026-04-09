import React, { useState, useMemo, useCallback, useEffect, useRef, forwardRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, StyleProp, ViewStyle, TextInputProps, Animated } from 'react-native';
import { ChevronDown, Phone, Check, AlertCircle } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import CountryPickerModal from '@/components/CountryPickerModal';
import { COUNTRIES, DEFAULT_COUNTRY } from '@/constants/Countries';
import { isValidPhoneForCountry, formatPhoneLocal } from '@jitplus/shared';
import type { CountryCode } from '@jitplus/shared';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export interface PhoneInputProps extends Omit<TextInputProps, 'onChangeText' | 'value' | 'style'> {
  value: string;
  onChangeText: (value: string) => void;
  /** @deprecated – validation is now automatic based on country rules */
  isValid?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Show validation state only after user has interacted */
  showValidation?: boolean;
}

/** Parse stored value "+212612..." or local "0612..." into dialCode + localPart + country */
function parsePhone(value: string | undefined | null): {
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
  ({ value, onChangeText, placeholder, isValid: isValidProp, showValidation = true, style, ...rest }, ref) => {
    const theme = useTheme();
    const { t } = useLanguage();
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

    // ── Border animation ──────────────────────────────────────────────────
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
        <Animated.View style={[styles.container, { backgroundColor: theme.bgInput, borderColor, borderWidth }, style]}>
          <TouchableOpacity
            activeOpacity={0.7}
            style={styles.countryBtn}
            onPress={() => setShowPicker(true)}
          >
            <Text style={styles.flag}>{selectedCountry.flag}</Text>
            <Text style={[styles.dialCode, { color: theme.textSecondary }]}>{selectedCountry.dial}</Text>
            <ChevronDown size={14} color={theme.textMuted} />
          </TouchableOpacity>

          <View style={[styles.divider, { backgroundColor: theme.borderLight }]} />

          <View style={styles.inputWrapper}>
            <Phone size={18} color={showSuccess ? theme.success : showError ? theme.danger : theme.textMuted} style={styles.icon} />
            <TextInput
              ref={ref}
              style={[styles.input, { color: theme.text }]}
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

          {/* Validation indicator dot */}
          {hasContent && (
            <View
              style={[
                styles.validationDot,
                {
                  backgroundColor: showSuccess ? theme.success : showError ? theme.danger : theme.border,
                },
              ]}
            />
          )}
        </Animated.View>

        {/* Digit counter + validation hint */}
        <View style={styles.hintRow}>
          {showValidation && hasContent && showError && (
            <Text style={[styles.hintText, { color: theme.danger }]}>
              {selectedCountry.code === 'MA'
                ? t('phoneInput.maFormat')
                : t('phoneInput.digitCount', { count: digitCount, max: maxDigits })}
            </Text>
          )}
          {showValidation && hasContent && showSuccess && (
            <Text style={[styles.hintText, { color: theme.success }]}>
              {selectedCountry.dial} {formatPhoneLocal(parsed.localPart)}
            </Text>
          )}
          {isFocused && hasContent && (
            <Text
              style={[
                styles.digitCounterText,
                {
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

/** Helper: check if a stored phone value is valid for its detected country */
export function isStoredPhoneValid(value: string): boolean {
  const { localPart, country } = parsePhone(value);
  return isValidPhoneForCountry(localPart, country);
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    height: 52,
  },
  countryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    height: '100%',
  },
  flag: {
    fontSize: 18,
    marginRight: 6,
  },
  dialCode: {
    fontSize: 15,
    fontWeight: '600',
    marginRight: 6,
  },
  divider: {
    width: 1,
    height: 24,
  },
  inputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 12,
    height: '100%',
  },
  icon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 15,
    height: '100%',
    letterSpacing: 0.5,
  },
  validationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 14,
  },
  hintRow: {
    marginTop: 4,
    paddingHorizontal: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 18,
  },
  hintText: {
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
  },
  digitCounterText: {
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'right',
  },
});
