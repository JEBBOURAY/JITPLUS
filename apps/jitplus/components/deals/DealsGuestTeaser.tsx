import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { BadgePercent } from 'lucide-react-native';
import { pluralKey } from '@jitplus/shared';
import { Text } from '@/components/AppText';
import { useTheme, palette, brandGradient } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAppFonts } from '@/utils/fonts';
import { resolveImageUrl } from '@/utils/imageUrl';
import { wp, hp, ms, fontSize, radius } from '@/utils/responsive';
import { haptic } from '@/utils/haptics';
import { useKnownLocation } from '@/hooks/useKnownLocation';
import { dealArea, useDealTeaser } from '@/hooks/useDealHooks';

/** Guests see how many deals are around and blurred pictures, never the deals themselves. */
export default function DealsGuestTeaser() {
  const theme = useTheme();
  const fonts = useAppFonts();
  const { t } = useLanguage();
  const router = useRouter();
  const coords = useKnownLocation();
  const { data } = useDealTeaser(dealArea(null, coords));
  const count = data?.count ?? 0;
  const thumbs = (data?.thumbs ?? []).slice(0, 3);

  return (
    <View style={styles.container}>
      <View style={styles.thumbs}>
        {thumbs.length > 0 ? thumbs.map((uri, i) => (
          <ExpoImage
            key={`${i}-${uri}`}
            source={{ uri: resolveImageUrl(uri) }}
            blurRadius={24}
            contentFit="cover"
            cachePolicy="memory-disk"
            style={[styles.thumb, { borderColor: theme.bg }, i === 1 && styles.thumbMiddle]}
            accessible={false}
          />
        )) : (
          <View style={[styles.iconCircle, { backgroundColor: `${palette.violet}15` }]}>
            <BadgePercent size={ms(38)} color={palette.violet} strokeWidth={1.6} />
          </View>
        )}
      </View>

      <Text style={[styles.title, { color: theme.text, fontFamily: fonts.bold }]} accessibilityRole="header">
        {count > 0 ? t(pluralKey('deals.guest.title', count), { count }) : t('deals.guest.titleNone')}
      </Text>
      <Text style={[styles.body, { color: theme.textSecondary, fontFamily: fonts.regular }]}>{t('deals.guest.body')}</Text>

      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => { haptic(); router.push('/register'); }}
        style={styles.btn}
        accessibilityRole="button"
        accessibilityLabel={t('welcome.createAccount')}
      >
        <LinearGradient colors={[brandGradient[0], brandGradient[1]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.gradient}>
          <Text style={[styles.btnText, { fontFamily: fonts.semibold }]}>{t('welcome.createAccount')}</Text>
        </LinearGradient>
      </TouchableOpacity>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => { haptic(); router.push('/login'); }}
        style={styles.secondaryBtn}
        accessibilityRole="button"
        accessibilityLabel={t('welcome.login')}
      >
        <Text style={[styles.secondaryText, { color: palette.violet, fontFamily: fonts.medium }]}>{t('welcome.login')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const THUMB = ms(92);

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: wp(32), paddingBottom: hp(80) },
  thumbs: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: hp(24), minHeight: THUMB + ms(12) },
  thumb: { width: THUMB, height: THUMB, borderRadius: ms(20), borderWidth: 3, marginHorizontal: -ms(10) },
  thumbMiddle: { width: THUMB + ms(12), height: THUMB + ms(12), zIndex: 1 },
  iconCircle: { width: ms(88), height: ms(88), borderRadius: ms(24), alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: ms(20), textAlign: 'center', marginBottom: hp(8) },
  body: { fontSize: fontSize.md, textAlign: 'center', lineHeight: ms(22), marginBottom: hp(28), paddingHorizontal: wp(8) },
  btn: { borderRadius: radius.xl, overflow: 'hidden', width: '100%' },
  gradient: { paddingVertical: hp(15), borderRadius: radius.xl, alignItems: 'center' },
  btnText: { fontSize: fontSize.md, color: '#FFFFFF' },
  secondaryBtn: { marginTop: hp(16), paddingVertical: hp(8) },
  secondaryText: { fontSize: fontSize.md },
});
