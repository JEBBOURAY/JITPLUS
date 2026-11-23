import type { ComponentProps } from 'react';
import { ActivityIndicator, Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import { ArrowRight } from 'lucide-react-native';
import { Text } from '@/components/AppText';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDir } from '@/hooks/useDir';
import { getErrorMessage } from '@/utils/error';
import { hapticLight } from '@/utils/haptics';
import { wp, hp, ms, fontSize, radius } from '@/utils/responsive';
import { font } from '@/constants/design';
import { AppleLogo } from '@/components/AppleLogo';
import { GoogleLogo } from '@/components/GoogleLogo';
import { ActionButton } from '@/components/ui/ActionButton';
import PressScale from '@jitplus/shared/src/login/PressScale';
import { PRESS_SPRING } from '@/components/login/loginConstants';

interface OAuthState {
  isLoading: boolean;
  error: string;
  noAccount: boolean;
  dismissNoAccount: () => void;
}

type AnimatedStyle = ComponentProps<typeof PressScale>['style'];

/**
 * Google and (iOS) Apple sign-in buttons with their error and "no account yet"
 * banners. `authBusy` locks both while any sign-in runs.
 */
export function SocialSignIn({ google, apple, authBusy, dark, googleStyle, appleStyle, onRegister }: {
  google: OAuthState & { promptGoogle: () => void };
  apple: OAuthState & { isAvailable: boolean; promptApple: () => void };
  authBusy: boolean;
  dark: boolean;
  googleStyle: AnimatedStyle;
  appleStyle: AnimatedStyle;
  onRegister: () => void;
}) {
  const theme = useTheme();
  const { t } = useLanguage();
  const dir = useDir();
  const appleInk = dark ? '#000' : '#fff';

  return (
    <>
      <PressScale style={googleStyle} spring={PRESS_SPRING}>
        {(press) => (
          <TouchableOpacity
            {...press}
            onPress={() => { hapticLight(); google.promptGoogle(); }}
            disabled={authBusy}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel={t('login.loginWithGoogle')}
            style={[styles.socialBtn, { flexDirection: dir.row, backgroundColor: theme.bgCard, borderColor: theme.inputBorder }]}
          >
            {google.isLoading ? (
              <ActivityIndicator color={theme.text} size="small" />
            ) : (
              <>
                <GoogleLogo size={ms(20)} />
                <Text style={[styles.socialBtnText, { color: theme.text }]}>{t('login.loginWithGoogle')}</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </PressScale>

      {Platform.OS === 'ios' && apple.isAvailable && (
        <PressScale style={appleStyle} spring={PRESS_SPRING}>
          {(press) => (
            <TouchableOpacity
              {...press}
              onPress={() => { hapticLight(); apple.promptApple(); }}
              disabled={authBusy}
              activeOpacity={0.88}
              accessibilityRole="button"
              accessibilityLabel={t('login.loginWithApple')}
              // Apple's guidelines: white button on dark backgrounds.
              style={[styles.socialBtn, dark ? styles.appleBtnDark : styles.appleBtn, { flexDirection: dir.row }]}
            >
              {apple.isLoading ? (
                <ActivityIndicator color={appleInk} size="small" />
              ) : (
                <>
                  <AppleLogo size={ms(19)} color={appleInk} />
                  <Text style={[styles.socialBtnText, { color: appleInk }]}>{t('login.loginWithApple')}</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </PressScale>
      )}

      <OAuthFeedback
        state={google}
        title={t('googleAuth.noAccountTitle')}
        message={t('googleAuth.noAccountAction')}
        actionLabel={t('googleAuth.goToRegister')}
        onRegister={onRegister}
      />
      <OAuthFeedback
        state={apple}
        title={t('appleAuth.noAccountTitle')}
        message={t('appleAuth.noAccountAction')}
        actionLabel={t('appleAuth.goToRegister')}
        onRegister={onRegister}
      />
    </>
  );
}

/** Error line, or the "no account yet" card that leads to sign-up. */
function OAuthFeedback({ state, title, message, actionLabel, onRegister }: {
  state: OAuthState;
  title: string;
  message: string;
  actionLabel: string;
  onRegister: () => void;
}) {
  const theme = useTheme();
  const { t } = useLanguage();
  const dir = useDir();

  if (state.noAccount) {
    // Charbon tints vanish on the dark background; use the light violet there.
    const dark = theme.mode === 'dark';
    return (
      <View
        style={[
          styles.noAccountBanner,
          dark
            ? { backgroundColor: `${palette.violetLight}14`, borderColor: `${palette.violetLight}40` }
            : { backgroundColor: `${palette.charbon}08`, borderColor: `${palette.charbon}25` },
        ]}
      >
        <Text style={[styles.noAccountTitle, { color: theme.text, textAlign: dir.textAlign }]}>{title}</Text>
        <Text style={[styles.noAccountMsg, { color: theme.textMuted, textAlign: dir.textAlign }]}>{message}</Text>
        <ActionButton
          label={actionLabel}
          onPress={() => { state.dismissNoAccount(); onRegister(); }}
          icon={ArrowRight}
          iconPosition="end"
          flipIconInRTL
          style={styles.noAccountBtn}
        />
      </View>
    );
  }

  if (!state.error) return null;
  return (
    <View style={[styles.errorBanner, { backgroundColor: `${theme.danger}15`, borderColor: `${theme.danger}30` }]}>
      <Text style={[styles.errorText, { color: theme.danger, textAlign: dir.textAlign }]}>
        {getErrorMessage(state.error, t('common.genericError'))}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  socialBtn: {
    minHeight: ms(52),
    borderRadius: radius.md,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    gap: wp(10),
    marginBottom: hp(10),
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOpacity: 0.05,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
      },
      android: { elevation: 2 },
    }),
  },
  appleBtn: {
    backgroundColor: '#000',
    borderColor: '#000',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.08,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
      },
      android: { elevation: 2 },
    }),
  },
  appleBtnDark: {
    backgroundColor: '#fff',
    borderColor: '#fff',
  },
  socialBtnText: {
    fontSize: fontSize.md,
    fontFamily: font.semibold,
  },
  errorBanner: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: wp(14),
    paddingVertical: hp(10),
    marginBottom: hp(12),
  },
  errorText: {
    fontSize: fontSize.xs,
    fontFamily: font.regular,
  },
  noAccountBanner: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    paddingHorizontal: wp(16),
    paddingVertical: hp(14),
    marginBottom: hp(12),
    gap: hp(6),
  },
  noAccountTitle: {
    fontSize: fontSize.md,
    fontFamily: font.semibold,
  },
  noAccountMsg: {
    fontSize: fontSize.sm,
    lineHeight: ms(20),
    fontFamily: font.regular,
  },
  noAccountBtn: {
    marginTop: hp(6),
    backgroundColor: palette.charbon,
    borderColor: palette.charbon,
  },
});
