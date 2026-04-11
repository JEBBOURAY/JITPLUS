import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Shield,
  FileText,
  Database,
  Mail,
  ChevronRight,
  Info,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Constants from 'expo-constants';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';

// ── URLs ──────────────────────────────────────────────────────────────────────
const PRIVACY_URL =
  process.env.EXPO_PUBLIC_PRIVACY_URL ||
  'https://jitplus.com/privacy';
const TERMS_URL =
  process.env.EXPO_PUBLIC_TERMS_URL || 'https://jitplus.com/cgu';
const DATA_RIGHTS_URL =
  process.env.EXPO_PUBLIC_DATA_RIGHTS_URL || 'https://jitplus.com/legal';
const CONTACT_EMAIL = 'contact@jitplus.com';

// ── Legal row component ───────────────────────────────────────────────────────
interface LegalRowProps {
  icon: React.ReactNode;
  label: string;
  subtitle: string;
  onPress: () => void;
  textColor: string;
  mutedColor: string;
  bgCard: string;
  borderLight: string;
}

function LegalRow({
  icon,
  label,
  subtitle,
  onPress,
  textColor,
  mutedColor,
  bgCard,
  borderLight,
}: LegalRowProps) {
  return (
    <TouchableOpacity
      style={[styles.row, { backgroundColor: bgCard, borderColor: borderLight }]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={styles.rowIcon}>{icon}</View>
      <View style={styles.rowContent}>
        <Text style={[styles.rowLabel, { color: textColor }]}>{label}</Text>
        <Text style={[styles.rowSubtitle, { color: mutedColor }]} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <ChevronRight size={18} color={mutedColor} />
    </TouchableOpacity>
  );
}

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

  const openUrl = async (url: string) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert(t('common.error'), t('legal.openError'));
      }
    } catch {
      Alert.alert(t('common.error'), t('legal.openError'));
    }
  };

  const openMail = () => openUrl(`mailto:${CONTACT_EMAIL}`);

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* ── Header ─────────────────────────────────── */}
      <LinearGradient
        colors={['#7C3AED', '#1F2937']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.header, { paddingTop: insets.top + 8 }]}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <ArrowLeft size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('legal.title')}</Text>
        <View style={styles.headerRight} />
      </LinearGradient>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Info banner ────────────────────────────── */}
        <View
          style={[
            styles.infoBanner,
            { backgroundColor: theme.primary + '10', borderColor: theme.primary + '30' },
          ]}
        >
          <Info size={16} color={theme.primary} />
          <Text style={[styles.infoText, { color: theme.textMuted }]}>
            {t('legal.privacyPolicySubtitle')}
          </Text>
        </View>

        {/* ── Legal links ────────────────────────────── */}
        <LegalRow
          icon={<Shield size={22} color="#6B7280" strokeWidth={2} />}
          label={t('legal.privacyPolicy')}
          subtitle={t('legal.privacyPolicySubtitle')}
          onPress={() => openUrl(PRIVACY_URL)}
          textColor={theme.text}
          mutedColor={theme.textMuted}
          bgCard={theme.bgCard}
          borderLight={theme.borderLight}
        />

        <LegalRow
          icon={<FileText size={22} color="#6B7280" strokeWidth={2} />}
          label={t('legal.terms')}
          subtitle={t('legal.termsSubtitle')}
          onPress={() => openUrl(TERMS_URL)}
          textColor={theme.text}
          mutedColor={theme.textMuted}
          bgCard={theme.bgCard}
          borderLight={theme.borderLight}
        />

        <LegalRow
          icon={<Database size={22} color="#6B7280" strokeWidth={2} />}
          label={t('legal.dataRights')}
          subtitle={t('legal.dataRightsSubtitle')}
          onPress={() => openUrl(DATA_RIGHTS_URL)}
          textColor={theme.text}
          mutedColor={theme.textMuted}
          bgCard={theme.bgCard}
          borderLight={theme.borderLight}
        />

        <LegalRow
          icon={<Mail size={22} color={theme.primary} strokeWidth={2} />}
          label={t('legal.contact')}
          subtitle={t('legal.contactSubtitle')}
          onPress={openMail}
          textColor={theme.text}
          mutedColor={theme.textMuted}
          bgCard={theme.bgCard}
          borderLight={theme.borderLight}
        />

        {/* ── Version footer ─────────────────────────── */}
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

  // ── Header ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    fontFamily: 'Lexend_700Bold',
  },
  headerRight: { width: 40 },

  // ── Content ──
  content: {
    padding: 16,
    gap: 10,
  },

  // ── Info banner ──
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 4,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Lexend_400Regular',
  },

  // ── Row ──
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 14,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(124,58,237,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowContent: { flex: 1 },
  rowLabel: {
    fontSize: 15,
    fontWeight: '600',
    fontFamily: 'Lexend_600SemiBold',
    marginBottom: 2,
  },
  rowSubtitle: {
    fontSize: 12,
    fontFamily: 'Lexend_400Regular',
  },

  // ── Footer ──
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
