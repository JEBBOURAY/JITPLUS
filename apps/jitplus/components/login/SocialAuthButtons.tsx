import { ActivityIndicator, StyleSheet, TouchableOpacity, type StyleProp, type ViewStyle } from 'react-native';
import { Text } from '@/components/AppText';
import { GoogleLogo } from '@/components/GoogleLogo';
import { AppleLogo } from '@/components/AppleLogo';
import { useTheme } from '@/contexts/ThemeContext';
import type { useGoogleAuth } from '@/hooks/useGoogleAuth';
import type { useAppleAuth } from '@/hooks/useAppleAuth';
import { haptic } from '@/utils/haptics';
import { fontSize, hp, ms, radius, wp } from '@/utils/responsive';
import PressScale from '@jitplus/shared/src/login/PressScale';
import { shadowSm } from './authUi';

interface SocialAuthButtonsProps {
  google: ReturnType<typeof useGoogleAuth>;
  apple: ReturnType<typeof useAppleAuth>;
  googleLabel: string;
  appleLabel: string;
  disabled: boolean;
  /** Runs before the provider sheet opens; returning false cancels the tap. */
  onBeforePrompt?: () => boolean;
  /** Entrance styles of the Google and Apple buttons (login intro stagger). */
  itemStyles?: [StyleProp<ViewStyle>, StyleProp<ViewStyle>];
}

/** Google, then Apple where available, in the style of the JitPlus Pro login. */
export default function SocialAuthButtons({
  google, apple, googleLabel, appleLabel, disabled, onBeforePrompt, itemStyles,
}: SocialAuthButtonsProps) {
  const theme = useTheme();
  const dark = theme.mode === 'dark';
  // Apple's guidelines: white button on dark backgrounds.
  const appleFg = dark ? '#000' : '#fff';

  const prompt = (open: () => unknown) => () => {
    if (onBeforePrompt && !onBeforePrompt()) return;
    haptic();
    void open();
  };

  return (
    <>
      <PressScale style={itemStyles?.[0]}>
        {(press) => (
          <TouchableOpacity
            {...press}
            onPress={prompt(google.promptGoogle)}
            disabled={disabled}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel={googleLabel}
            style={[styles.btn, { backgroundColor: theme.bgCard, borderColor: theme.inputBorder }]}
          >
            {google.isLoading ? <ActivityIndicator color={theme.text} size="small" /> : (
              <>
                <GoogleLogo size={ms(20)} />
                <Text style={[styles.text, { color: theme.text }]}>{googleLabel}</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </PressScale>

      {apple.isAvailable && (
        <PressScale style={itemStyles?.[1]}>
          {(press) => (
            <TouchableOpacity
              {...press}
              onPress={prompt(apple.promptApple)}
              disabled={disabled}
              activeOpacity={0.88}
              accessibilityRole="button"
              accessibilityLabel={appleLabel}
              style={[styles.btn, dark ? styles.appleDark : styles.appleLight]}
            >
              {apple.isLoading ? <ActivityIndicator color={appleFg} size="small" /> : (
                <>
                  <AppleLogo size={ms(19)} color={appleFg} />
                  <Text style={[styles.text, { color: appleFg }]}>{appleLabel}</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </PressScale>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row', minHeight: ms(52), borderRadius: radius.md, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center', gap: wp(10), marginBottom: hp(10), ...shadowSm,
  },
  appleLight: { backgroundColor: '#000', borderColor: '#000' },
  appleDark: { backgroundColor: '#fff', borderColor: '#fff' },
  text: { fontSize: fontSize.md, fontWeight: '600' },
});
