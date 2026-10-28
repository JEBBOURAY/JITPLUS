import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Copy, Check } from 'lucide-react-native';
import { JitGift } from '@/components/icons';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { wp, hp, ms, fontSize as FS, radius } from '@/utils/responsive';
import { font, icon } from '@/constants/design';
import { useDir } from '@/hooks/useDir';
import type { ImperativeRouter } from 'expo-router';

interface Props {
  theme: ReturnType<typeof useTheme>;
  t: (key: string, opts?: Record<string, unknown>) => string;
  referralCode: string;
  router: ImperativeRouter;
}

/**
 * Standalone compact referral row (mirrors the mockup's `.referral-row`).
 * Tap on the label routes to /referral; tap on the code copies it to clipboard.
 * Only rendered when a `referralCode` is provided.
 */
export default React.memo(function ReferralInlineRow({ theme, t, referralCode, router }: Props) {
  const dir = useDir();
  const [codeCopied, setCodeCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear any pending "copied" reset timer when the row unmounts to avoid a
  // setState-after-unmount warning.
  useEffect(() => () => {
    if (copyTimer.current) clearTimeout(copyTimer.current);
  }, []);

  const goToReferral = useCallback(() => router.push('/referral'), [router]);

  const copyReferral = useCallback(async () => {
    if (!referralCode) return;
    try {
      await Clipboard.setStringAsync(referralCode);
      setCodeCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCodeCopied(false), 1500);
    } catch {
      // silent
    }
  }, [referralCode]);

  return (
    <Pressable
      onPress={goToReferral}
      style={({ pressed }) => [
        styles.row,
        { flexDirection: dir.row, backgroundColor: theme.bgCard, borderColor: theme.borderLight },
        pressed && { opacity: 0.8 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={t('account.referralActive')}
    >
      <View style={styles.icon}>
        <JitGift size={ms(17)} color={palette.violet} strokeWidth={icon.stroke} />
      </View>
      <View style={styles.body}>
        <Text style={[styles.title, { color: theme.text, textAlign: dir.textAlign }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
          {t('account.referralActive')}
        </Text>
        <Text style={[styles.sub, { color: theme.textMuted, textAlign: dir.textAlign }]} numberOfLines={2} maxFontSizeMultiplier={1.3}>
          {codeCopied ? t('referral.codeCopied') : t('account.referralInviteHint')}
        </Text>
      </View>
      <Pressable
        onPress={copyReferral}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        style={({ pressed }) => [
          styles.codeChip,
          { flexDirection: dir.row },
          pressed && { opacity: 0.7 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={t('referral.copyCode')}
        accessibilityState={{ disabled: codeCopied }}
      >
        <Text style={styles.codeText} maxFontSizeMultiplier={1.2} numberOfLines={1}>
          {referralCode}
        </Text>
        {codeCopied
          ? <Check size={ms(12)} color={palette.violet} strokeWidth={icon.strokeSmall} />
          : <Copy size={ms(12)} color={palette.violet} strokeWidth={icon.strokeSmall} />}
      </Pressable>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(12),
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: wp(14),
    paddingVertical: hp(13),
    marginBottom: hp(20),
  },
  icon: {
    width: ms(36),
    height: ms(36),
    borderRadius: radius.md,
    backgroundColor: 'rgba(124,58,237,0.09)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: FS.sm,
    fontFamily: font.semibold,
  },
  sub: {
    fontSize: FS.xs,
    marginTop: hp(1),
    fontFamily: font.regular,
  },
  codeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(5),
    paddingHorizontal: wp(10),
    paddingVertical: hp(5),
    borderRadius: radius.sm,
    backgroundColor: 'rgba(124,58,237,0.08)',
  },
  codeText: {
    fontSize: ms(12),
    color: palette.violet,
    letterSpacing: 0.6,
    fontFamily: font.semibold,
  },
});
