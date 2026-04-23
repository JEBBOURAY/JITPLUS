import React from 'react';
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
import { ms } from '@/utils/responsive';

const CONTACT_EMAIL = 'contact@jitplus.com';
const CNDP_URL = 'https://www.cndp.ma';

// ── Main ──────────────────────────────────────────────────────────────────────
export default function LegalScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { t } = useLanguage();

  const version = Constants.expoConfig?.version ?? '1.0.0';
  const buildNumber =
    (Constants.expoConfig?.ios?.buildNumber ??
      Constants.expoConfig?.android?.versionCode?.toString() ??
      '1');

  const openEmail = () => Linking.openURL(`mailto:${CONTACT_EMAIL}`);
  const openCndp = () => Linking.openURL(CNDP_URL);

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* ── Header ── */}
      <View style={[styles.headerBar, { paddingTop: insets.top + 12, backgroundColor: theme.bgCard, borderBottomColor: theme.border }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <ArrowLeft size={ms(22)} color={theme.text} strokeWidth={2} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>{t('legal.title')}</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Last update */}
        <View style={[styles.section, { backgroundColor: `${theme.primary}10` }]}>
          <Text style={[styles.body, { color: theme.textMuted, textAlign: 'center' }]}>
            {t('legal.lastUpdate')}
          </Text>
        </View>

        {/* Loi 09-08 / CNDP */}
        <View style={[styles.section, { backgroundColor: theme.bgCard }]}>
          <Text style={[styles.sectionTitle, { color: theme.primary }]}>{t('legal.cndpTitle')}</Text>
          <Text style={[styles.body, { color: theme.textSecondary }]}>
            {t('legal.cndpIntro')}{' '}
            <Text style={{ fontWeight: '700', color: theme.text }}>
              {t('legal.cndpBody')}
            </Text>
            {t('legal.cndpRights')}
          </Text>
          <Text style={[styles.bullet, { color: theme.textSecondary }]}>{t('legal.rightAccess')}</Text>
          <Text style={[styles.bullet, { color: theme.textSecondary }]}>{t('legal.rightRectify')}</Text>
          <Text style={[styles.bullet, { color: theme.textSecondary }]}>{t('legal.rightDelete')}</Text>
          <Text style={[styles.bullet, { color: theme.textSecondary }]}>{t('legal.rightOppose')}</Text>
          <Text style={[styles.body, { color: theme.textMuted, marginTop: 8 }]}>
            {t('legal.cndpExercise')}{' '}
            <Text style={{ color: theme.primary }} onPress={openEmail}>{CONTACT_EMAIL}</Text>.
          </Text>
        </View>

        {/* CGU */}
        <View style={[styles.section, { backgroundColor: theme.bgCard }]}>
          <Text style={[styles.sectionTitle, { color: theme.primary }]}>{t('legal.cguTitle')}</Text>
          <Text style={[styles.body, { color: theme.textSecondary }]}>
            {t('legal.cguBody')}
          </Text>
          <Text style={[styles.bullet, { color: theme.textSecondary }]}>{t('legal.cguFree')}</Text>
          <Text style={[styles.bullet, { color: theme.textSecondary }]}>{t('legal.cguNoValue')}</Text>
          <Text style={[styles.bullet, { color: theme.textSecondary }]}>{t('legal.cguModify')}</Text>
          <Text style={[styles.bullet, { color: theme.textSecondary }]}>{t('legal.cguLaw')}</Text>
        </View>

        {/* Données collectées */}
        <View style={[styles.section, { backgroundColor: theme.bgCard }]}>
          <Text style={[styles.sectionTitle, { color: theme.primary }]}>{t('legal.dataTitle')}</Text>
          <Text style={[styles.body, { color: theme.textSecondary }]}>
            {t('legal.dataIntro')}
          </Text>
          <Text style={[styles.bullet, { color: theme.textSecondary }]}>{t('legal.dataPhone')}</Text>
          <Text style={[styles.bullet, { color: theme.textSecondary }]}>{t('legal.dataName')}</Text>
          <Text style={[styles.bullet, { color: theme.textSecondary }]}>{t('legal.dataLocation')}</Text>
          <Text style={[styles.bullet, { color: theme.textSecondary }]}>{t('legal.dataPhotos')}</Text>
          <Text style={[styles.bullet, { color: theme.textSecondary }]}>{t('legal.dataNotifPrefs')}</Text>
        </View>

        {/* Utilisation */}
        <View style={[styles.section, { backgroundColor: theme.bgCard }]}>
          <Text style={[styles.sectionTitle, { color: theme.primary }]}>{t('legal.usageTitle')}</Text>
          <Text style={[styles.body, { color: theme.textSecondary }]}>
            {t('legal.usageBody')}
          </Text>
        </View>

        {/* Conservation */}
        <View style={[styles.section, { backgroundColor: theme.bgCard }]}>
          <Text style={[styles.sectionTitle, { color: theme.primary }]}>{t('legal.retentionTitle')}</Text>
          <Text style={[styles.body, { color: theme.textSecondary }]}>
            {t('legal.retentionBody')}
          </Text>
        </View>

        {/* Contact */}
        <View style={[styles.section, { backgroundColor: theme.bgCard }]}>
          <Text style={[styles.sectionTitle, { color: theme.primary }]}>{t('legal.contactTitle')}</Text>
          <Text style={[styles.body, { color: theme.textSecondary }]}>
            {t('legal.contactResponsible')}{'\n'}
            {t('legal.contactEmail')} <Text style={{ color: theme.primary }} onPress={openEmail}>{CONTACT_EMAIL}</Text>{'\n'}
            {t('legal.contactCndp')}{' '}
            <Text style={{ color: theme.primary }} onPress={openCndp}>www.cndp.ma</Text>
          </Text>
        </View>

        {/* Version footer */}
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backBtn: { width: ms(40), alignItems: 'center' },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: ms(16),
    fontWeight: '700',
    fontFamily: 'Lexend_700Bold',
  },
  content: {
    padding: 16,
    gap: 12,
  },
  section: {
    borderRadius: 14,
    padding: 16,
    gap: 6,
  },
  sectionTitle: {
    fontSize: ms(14),
    fontWeight: '700',
    marginBottom: 6,
    fontFamily: 'Lexend_700Bold',
  },
  body: {
    fontSize: ms(13),
    lineHeight: ms(21),
    fontFamily: 'Lexend_400Regular',
  },
  bullet: {
    fontSize: ms(13),
    lineHeight: ms(20),
    paddingLeft: 16,
    fontFamily: 'Lexend_400Regular',
  },
  versionText: {
    textAlign: 'center',
    fontSize: 12,
    marginTop: 24,
    fontFamily: 'Lexend_400Regular',
  },
  copyrightText: {
    textAlign: 'center',
    fontSize: 11,
    marginTop: 4,
    lineHeight: 16,
    fontFamily: 'Lexend_400Regular',
  },
}); 
