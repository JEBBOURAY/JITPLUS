import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Animated,
  type TextInputProps,
} from 'react-native';
import { Phone } from 'lucide-react-native';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { wp, hp, ms, fontSize, radius } from '@/utils/responsive';
import {
  DEFAULT_COUNTRY,
  isValidPhoneForCountry,
  formatPhoneLocal,
  type CountryCode,
} from '@/utils/countryCodes';
import CountryCodePicker from './CountryCodePicker';

// ── Types ──────────────────────────────────────────────────────────────────
export interface PremiumPhoneInputProps {
  /** Current local phone digits (without dial code) */
  value: string;
  /** Called with cleaned digits only */
  onChangePhone: (digits: string) => void;
  /** Currently selected country – defaults to Morocco if omitted */
  country?: CountryCode;
  /** Called when user picks a different country */
  onChangeCountry?: (c: CountryCode) => void;
  /** Accent colour for border / icons when valid */
  accentColor?: string;
  /** Force error state (e.g. after form submit) */
  error?: boolean;
  /** Error message to display below the input */
  errorMessage?: string;
  /** Disable interaction */
  disabled?: boolean;
  /** Extra TextInput props (e.g. testID) */
  inputProps?: Omit<TextInputProps, 'value' | 'onChangeText' | 'keyboardType' | 'maxLength'>;
}

// ── Component ──────────────────────────────────────────────────────────────
function PremiumPhoneInput({
  value,
  onChangePhone,
  country: externalCountry,
  onChangeCountry,
  accentColor = palette.violet,
  error = false,
  errorMessage,
  disabled = false,
  inputProps,
}: PremiumPhoneInputProps) {
  const theme = useTheme();
  const { t } = useLanguage();

  // Allow controlled or uncontrolled country state
  const [internalCountry, setInternalCountry] = useState<CountryCode>(DEFAULT_COUNTRY);
  const country = externalCountry ?? internalCountry;

  const handleCountryChange = useCallback(
    (c: CountryCode) => {
      setInternalCountry(c);
      onChangeCountry?.(c);
      // Clear digits when country changes (different format)
      onChangePhone('');
    },
    [onChangeCountry, onChangePhone],
  );

  // ── Validation ─────────────────────────────────────────────────────────
  const isValid = value.length > 0 && isValidPhoneForCountry(value, country);
  const showError = error || (value.length > 0 && value.length >= country.maxDigits && !isValid);

  // ── Live formatting for placeholder (memoized) ─────────────────────────
  const placeholder = useMemo(() => {
    const placeholderDigits = country.code === 'MA'
      ? '6' + 'X'.repeat(country.maxDigits - 1)
      : 'X'.repeat(country.maxDigits);
    const formattedPlaceholder = formatPhoneLocal(placeholderDigits.replace(/X/g, '0'))
      .replace(/0/g, 'X');
    return country.code === 'MA'
      ? '6' + formattedPlaceholder.slice(1)
      : formattedPlaceholder;
  }, [country.code, country.maxDigits]);

  // ── Border animation ──────────────────────────────────────────────────
  const borderAnim = useRef(new Animated.Value(0)).current;
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    Animated.timing(borderAnim, {
      toValue: isFocused ? 1 : 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [isFocused, borderAnim]);

  const borderColor = showError
    ? theme.danger
    : isValid
      ? accentColor
      : borderAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [theme.inputBorder, accentColor],
        });

  const borderWidth = isValid || isFocused ? 2 : 1.5;

  // ── Live formatted display ─────────────────────────────────────────────
  const handleChange = useCallback(
    (text: string) => {
      const cleaned = text.replace(/[^0-9]/g, '');
      onChangePhone(cleaned);
    },
    [onChangePhone],
  );

  return (
    <View style={styles.container}>
      {/* Main input row */}
      <Animated.View
        style={[
          styles.inputWrapper,
          {
            backgroundColor: disabled ? theme.inputBg + '80' : theme.inputBg,
            borderColor,
            borderWidth,
            opacity: disabled ? 0.6 : 1,
          },
        ]}
      >
        {/* Country picker section */}
        <View style={styles.countrySection}>
          <CountryCodePicker
            selected={country}
            onSelect={handleCountryChange}
            accentColor={accentColor}
          />
        </View>

        {/* Vertical separator */}
        <View style={[styles.separator, { backgroundColor: theme.inputBorder }]} />

        {/* Phone icon */}
        <Phone
          size={ms(16)}
          color={isValid ? accentColor : theme.inputPlaceholder}
          strokeWidth={1.5}
          style={styles.phoneIcon}
        />

        {/* Phone number input */}
        <TextInput
          style={[styles.phoneInput, { color: theme.text }]}
          placeholder={placeholder}
          placeholderTextColor={theme.inputPlaceholder}
          value={value}
          onChangeText={handleChange}
          keyboardType="phone-pad"
          maxLength={country.maxDigits}
          editable={!disabled}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          {...inputProps}
        />

        {/* Validation indicator */}
        {value.length > 0 && (
          <View
            style={[
              styles.validationDot,
              {
                backgroundColor: isValid ? accentColor : showError ? theme.danger : theme.inputBorder,
              },
            ]}
          />
        )}
      </Animated.View>

      {/* Digit counter */}
      {isFocused && value.length > 0 && (
        <Text
          style={[
            styles.digitCounter,
            {
              color: isValid
                ? accentColor
                : value.length >= country.maxDigits
                  ? theme.danger
                  : theme.inputPlaceholder,
            },
          ]}
        >
          {value.length}/{country.maxDigits}
        </Text>
      )}

      {/* Error message */}
      {showError && errorMessage ? (
        <Text style={[styles.errorText, { color: theme.danger }]}>{errorMessage}</Text>
      ) : null}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    marginBottom: hp(16),
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    paddingHorizontal: wp(14),
    height: hp(58),
  },
  countrySection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  separator: {
    width: 1,
    height: ms(24),
    marginHorizontal: wp(8),
  },
  phoneIcon: {
    marginRight: wp(6),
  },
  phoneInput: {
    flex: 1,
    fontSize: fontSize.md,
    fontWeight: '500',
    letterSpacing: 0.5,
  },
  validationDot: {
    width: ms(8),
    height: ms(8),
    borderRadius: ms(4),
    marginLeft: wp(8),
  },
  digitCounter: {
    fontSize: fontSize.xs,
    fontWeight: '500',
    textAlign: 'right',
    marginTop: hp(4),
    marginRight: wp(4),
  },
  errorText: {
    fontSize: fontSize.xs,
    fontWeight: '500',
    marginTop: hp(4),
    marginLeft: wp(4),
  },
});

export default React.memo(PremiumPhoneInput);
