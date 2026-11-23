import { createContext, forwardRef, useContext } from 'react';
import {
  StyleSheet,
  Text as RNText,
  TextInput as RNTextInput,
  type TextInputProps,
  type TextProps,
} from 'react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { resolveFontStyle } from '@/utils/fontResolution';

/**
 * Drop-in replacements for React Native's Text and TextInput. Lexend has no
 * Arabic glyphs: in Arabic, every Lexend weight is swapped for the same Cairo
 * weight, so titles, buttons and body text keep their hierarchy instead of
 * all falling back to the system font. Same mechanism as the client app.
 *
 * Screens that must draw a fixed script whatever the app language (the
 * Arabic social post) keep React Native's Text.
 */

const InsideTextContext = createContext(false);

export const Text = forwardRef<RNText, TextProps>(function AppText({ style, ...rest }, ref) {
  const { locale } = useLanguage();
  const nested = useContext(InsideTextContext);
  const fontStyle = resolveFontStyle(StyleSheet.flatten(style), locale, nested);
  const text = <RNText ref={ref} {...rest} style={fontStyle ? [style, fontStyle] : style} />;
  return nested ? text : <InsideTextContext.Provider value>{text}</InsideTextContext.Provider>;
});
// Same name as the value so `useRef<Text>` keeps working, as with React Native's class.
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type Text = RNText;

export const TextInput = forwardRef<RNTextInput, TextInputProps>(function AppTextInput({ style, ...rest }, ref) {
  const { locale } = useLanguage();
  const fontStyle = resolveFontStyle(StyleSheet.flatten(style), locale);
  return <RNTextInput ref={ref} {...rest} style={fontStyle ? [style, fontStyle] : style} />;
});
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type TextInput = RNTextInput;
