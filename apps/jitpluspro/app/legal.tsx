import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import Constants from 'expo-constants';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDir } from '@/hooks/useDir';
import { font, icon } from '@/constants/design';
import { ms } from '@/utils/responsive';

const CONTACT_EMAIL = 'contact@jitplus.com';
const CNDP_URL = 'https://www.cndp.ma';

export default function LegalScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { t } = useLanguage();
  const dir = useDir();
  const align = { textAlign: dir.textAlign };
  const bulletStyle = [styles.bullet, dir.isRTL ? styles.bulletRtl : styles.bulletLtr, align, { color: theme.textSecondary }];

  const version = Constants.expoConfig?.version ?? '1.0.0';
  const buildNumber =
    (Constants.expoConfig?.ios?.buildNumber ??
      Constants.expoConfig?.android?.versionCode?.toString() ??
      '1');

  const openEmail = () => Linking.openURL(`mailto:${CONTACT_EMAIL}`);
  const openCndp = () => Linking.openURL(CNDP_URL);

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <View
        style={[
          styles.headerBar,
          { flexDirection: dir.row, paddingTop: insets.top + 12, backgroundColor: theme.bgCard, borderBottomColor: theme.border },
        ]}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <ArrowLeft size={ms(22)} color={theme.text} strokeWidth={icon.stroke} style={dir.flip} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>{t('legal.title')}</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.section, { backgroundColor: `${theme.primary}10` }]}>
          <Text style={[styles.body, styles.center, { color: theme.textMuted }]}>
            {t('legal.lastUpdate')}
          </Text>
        </View>

        <View style={[styles.section, { backgroundColor: theme.bgCard }]}>
          <Text style={[styles.sectionTitle, align, { color: theme.primary }]}>{t('legal.cndpTitle')}</Text>
          <Text style={[styles.body, align, { color: theme.textSecondary }]}>
            {t('legal.cndpIntro')}{' '}
            <Text style={[styles.strong, { color: theme.text }]}>
              {t('legal.cndpBody')}
            </Text>
            {t('legal.cndpRights')}
          </Text>
          <Text style={bulletStyle}>{t('legal.rightAccess')}</Text>
          <Text style={bulletStyle}>{t('legal.rightRectify')}</Text>
          <Text style={bulletStyle}>{t('legal.rightDelete')}</Text>
          <Text style={bulletStyle}>{t('legal.rightOppose')}</Text>
          <Text style={[styles.body, styles.bodySpaced, align, { color: theme.textMuted }]}>
            {t('legal.cndpExercise')}{' '}
            <Text style={[styles.link, { color: theme.primary }]} onPress={openEmail}>{CONTACT_EMAIL}</Text>.
          </Text>
        </View>

        <View style={[styles.section, { backgroundColor: theme.bgCard }]}>
          <Text style={[styles.sectionTitle, align, { color: theme.primary }]}>{t('legal.cguTitle')}</Text>
          <Text style={[styles.body, align, { color: theme.textSecondary }]}>
            {t('legal.cguBody')}
          </Text>
          <Text style={bulletStyle}>{t('legal.cguFree')}</Text>
          <Text style={bulletStyle}>{t('legal.cguNoValue')}</Text>
          <Text style={bulletStyle}>{t('legal.cguModify')}</Text>
          <Text style={bulletStyle}>{t('legal.cguLaw')}</Text>
        </View>

        <View style={[styles.section, { backgroundColor: theme.bgCard }]}>
          <Text style={[styles.sectionTitle, align, { color: theme.primary }]}>{t('legal.dataTitle')}</Text>
          <Text style={[styles.body, align, { color: theme.textSecondary }]}>
            {t('legal.dataIntro')}
          </Text>
          <Text style={bulletStyle}>{t('legal.dataPhone')}</Text>
          <Text style={bulletStyle}>{t('legal.dataName')}</Text>
          <Text style={bulletStyle}>{t('legal.dataLocation')}</Text>
          <Text style={bulletStyle}>{t('legal.dataPhotos')}</Text>
          <Text style={bulletStyle}>{t('legal.dataNotifPrefs')}</Text>
        </View>

        <View style={[styles.section, { backgroundColor: theme.bgCard }]}>
          <Text style={[styles.sectionTitle, align, { color: theme.primary }]}>{t('legal.usageTitle')}</Text>
          <Text style={[styles.body, align, { color: theme.textSecondary }]}>
            {t('legal.usageBody')}
          </Text>
        </View>

        <View style={[styles.section, { backgroundColor: theme.bgCard }]}>
          <Text style={[styles.sectionTitle, align, { color: theme.primary }]}>{t('legal.retentionTitle')}</Text>
          <Text style={[styles.body, align, { color: theme.textSecondary }]}>
            {t('legal.retentionBody')}
          </Text>
        </View>

        <View style={[styles.section, { backgroundColor: theme.bgCard }]}>
          <Text style={[styles.sectionTitle, align, { color: theme.primary }]}>{t('legal.contactTitle')}</Text>
          <Text style={[styles.body, align, { color: theme.textSecondary }]}>
            {t('legal.contactResponsible')}{'\n'}
            {t('legal.contactEmail')} <Text style={[styles.link, { color: theme.primary }]} onPress={openEmail}>{CONTACT_EMAIL}</Text>{'\n'}
            {t('legal.contactCndp')}{' '}
            <Text style={[styles.link, { color: theme.primary }]} onPress={openCndp}>www.cndp.ma</Text>
          </Text>
        </View>

        <Text style={[styles.versionText, { color: theme.textMuted }]}>
          {t('legal.version', { version, build: buildNumber })}
        </Text>
        <Text style={[styles.copyrightText, { color: theme.textMuted }]}>
          © {new Date().getFullYear()} JitPlus. {'\n'}{t('legal.allRightsReserved')}
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerBar: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: ms(40), alignItems: 'center' },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: ms(16),
    fontFamily: font.bold,
  },
  content: {
    padding: 16,
    gap: 12,
  },
  section: {
    borderRadius: 16,
    padding: 16,
    gap: 6,
  },
  sectionTitle: {
    fontSize: ms(14),
    marginBottom: 6,
    fontFamily: font.bold,
  },
  body: {
    fontSize: ms(13),
    lineHeight: ms(21),
    fontFamily: font.regular,
  },
  bodySpaced: { marginTop: 8 },
  center: { textAlign: 'center' },
  strong: { fontFamily: font.bold },
  link: { fontFamily: font.medium },
  bullet: {
    fontSize: ms(13),
    lineHeight: ms(20),
    fontFamily: font.regular,
  },
  bulletLtr: { paddingLeft: 16 },
  bulletRtl: { paddingRight: 16 },
  versionText: {
    textAlign: 'center',
    fontSize: 12,
    marginTop: 24,
    fontFamily: font.regular,
  },
  copyrightText: {
    textAlign: 'center',
    fontSize: 11,
    marginTop: 4,
    lineHeight: 16,
    fontFamily: font.regular,
  },
}); 
