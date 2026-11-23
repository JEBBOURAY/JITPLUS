import { memo, useState } from 'react';
import { Animated, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { Gift } from 'lucide-react-native';
import { pluralKey } from '@jitplus/shared';
import { Text } from '@/components/AppText';
import BottomSheet from '@/components/BottomSheet';
import ConfettiBurst from '@/components/luckyWheel/ConfettiBurst';
import { rewardSheetStyles as shared } from '@/components/rewardSheetStyles';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePopIn } from '@/hooks/usePopIn';
import { useAppFonts } from '@/utils/fonts';
import { hp, ms, radius } from '@/utils/responsive';
import MerchantStampProgress from './MerchantStampProgress';
import type { MerchantLoyalty } from './useMerchantLoyalty';

interface Props {
  /** Stamps just credited; 0 slides the sheet away. */
  stamps: number;
  merchantName: string;
  loyalty: MerchantLoyalty;
  accent: string;
  bottomInset: number;
  onClose: () => void;
  onViewCard: () => void;
}

/** Announces the welcome gift credited by adding the card, with the card's real progress. */
function WelcomeGiftSheet({ stamps, merchantName, loyalty, accent, bottomInset, onClose, onViewCard }: Props) {
  const theme = useTheme();
  const { t } = useLanguage();
  const fonts = useAppFonts();
  const reduceMotion = useReducedMotion();
  const pop = usePopIn(stamps > 0);
  // Keeps the amount on screen while the sheet slides out.
  const [shown, setShown] = useState(stamps);
  if (stamps > 0 && stamps !== shown) setShown(stamps);

  if (shown === 0) return null;

  return (
    <BottomSheet
      visible={stamps > 0}
      onClose={onClose}
      onExited={() => setShown(0)}
      backdropColor="rgba(5,2,12,0.55)"
      backdropLabel={t('common.close')}
      backdropContent={reduceMotion ? null : <ConfettiBurst play />}
      handleStyle={shared.handle}
      style={[shared.sheet, { paddingBottom: Math.max(bottomInset, hp(16)) + hp(8) }]}
    >
      <View style={shared.content} accessibilityLiveRegion="assertive">
        <Animated.View style={{ transform: [{ scale: pop }] }}>
          <View style={[shared.badge, { backgroundColor: accent }]}>
            <Gift size={ms(40)} color="#fff" strokeWidth={2} />
          </View>
        </Animated.View>

        <Text style={[shared.kicker, { color: theme.textSecondary, fontFamily: fonts.semibold }]}>
          {t('merchant.welcomeGiftKicker')}
        </Text>
        <Text style={[shared.title, styles.title, { color: theme.text, fontFamily: fonts.bold }]} accessibilityRole="header">
          {t(pluralKey('merchant.welcomeGiftTitle', shown), { count: shown })}
        </Text>
        <Text style={[shared.desc, { color: theme.textSecondary, fontFamily: fonts.regular }]}>
          {t('merchant.welcomeGiftBody', { name: merchantName })}
        </Text>

        <View style={[styles.progress, { backgroundColor: theme.bgInput }]}>
          <MerchantStampProgress loyalty={loyalty} accent={accent} />
        </View>

        <TouchableOpacity onPress={onViewCard} activeOpacity={0.85} style={shared.primaryWrap} accessibilityRole="button">
          <View style={[shared.primary, { backgroundColor: accent }]}>
            <Text style={[shared.primaryText, { fontFamily: fonts.bold }]}>{t('merchant.welcomeGiftCta')}</Text>
          </View>
        </TouchableOpacity>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: { marginTop: hp(4) },
  progress: { alignSelf: 'stretch', borderRadius: radius.lg, padding: ms(14), marginTop: hp(16) },
});

export default memo(WelcomeGiftSheet);
