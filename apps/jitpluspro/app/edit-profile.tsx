import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {
  ArrowLeft,
  Check,
  Store as StoreIcon,
  FileText,
  Instagram,
  Globe,
  Phone,
  Mail,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import api from '@/services/api';
import { getErrorMessage } from '@/utils/error';
import { MerchantCategory } from '@/types';
import { CATEGORY_LABELS } from '@/constants/categories';
import { LinearGradient } from 'expo-linear-gradient';
import { wp, hp, ms, fontSize as FS, radius } from '@/utils/responsive';


export default function EditProfileScreen() {
  const { merchant, updateMerchant } = useAuth();
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();

  // ── Form state ──
  const [nom, setNom] = useState(merchant?.nom ?? '');
  const [description, setDescription] = useState(merchant?.description ?? '');
  const [categorie, setCategorie] = useState<MerchantCategory>(
    merchant?.categorie ?? MerchantCategory.AUTRE,
  );
  const [instagram, setInstagram] = useState(merchant?.socialLinks?.instagram ?? '');
  const [tiktok, setTiktok] = useState(merchant?.socialLinks?.tiktok ?? '');
  const [phoneNumber, setPhoneNumber] = useState(merchant?.phoneNumber ?? '');
  const [email, setEmail] = useState(merchant?.email ?? '');
  const [saving, setSaving] = useState(false);

  // ── Sync when merchant changes ──
  useEffect(() => {
    if (merchant) {
      setNom(merchant.nom ?? '');
      setDescription(merchant.description ?? '');
      setCategorie(merchant.categorie ?? MerchantCategory.AUTRE);
      setInstagram(merchant.socialLinks?.instagram ?? '');
      setTiktok(merchant.socialLinks?.tiktok ?? '');
      setPhoneNumber(merchant.phoneNumber ?? '');
      setEmail(merchant.email ?? '');
    }
  }, [merchant]);

  // ── Save ──
  const handleSave = useCallback(async () => {
    if (!nom.trim()) {
      Alert.alert(t('common.error'), t('editProfile.nameRequired'));
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, any> = {
        nom: nom.trim(),
        description: description.trim() || undefined,
        categorie,
        phoneNumber: phoneNumber.trim() || undefined,
        email: email.trim() || undefined,
        socialLinks: {
          instagram: instagram.trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/.*$/, '') || undefined,
          tiktok: tiktok.trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?tiktok\.com\/@?/, '').replace(/\/.*$/, '') || undefined,
        },
      };

      const res = await api.patch('/merchant/profile', payload);
      updateMerchant(res.data);
      Alert.alert(t('editProfile.saveSuccess'));
      router.back();
    } catch (err: unknown) {
      Alert.alert(t('common.error'), getErrorMessage(err, t('editProfile.saveError')));
    } finally {
      setSaving(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nom, description, categorie, phoneNumber, email, instagram, tiktok, t, updateMerchant, router]);

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: insets.top + hp(8), backgroundColor: theme.bgCard, borderBottomColor: theme.borderLight }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={ms(22)} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>{t('editProfile.title')}</Text>
        <TouchableOpacity
          onPress={handleSave}
          disabled={saving}
          style={[styles.saveBtn, saving && { opacity: 0.6 }]}
        >
          <LinearGradient
            colors={['#7C3AED', '#5B21B6']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.saveBtnGradient}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Check size={ms(18)} color="#fff" strokeWidth={2.5} />
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ═══ Section: Informations ═══ */}
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
          {t('editProfile.nameLabel').toUpperCase()}
        </Text>
        <View style={[styles.card, { backgroundColor: theme.bgCard }]}>
          {/* Nom */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: theme.text }]}>{t('editProfile.nameLabel')} *</Text>
            <View style={[styles.inputWrapper, { backgroundColor: theme.bgInput, borderColor: theme.border }]}>
              <StoreIcon size={ms(16)} color={theme.textMuted} />
              <TextInput
                style={[styles.input, { color: theme.text }]}
                value={nom}
                onChangeText={setNom}
                placeholder={t('editProfile.namePlaceholder')}
                placeholderTextColor={theme.textMuted}
              />
            </View>
          </View>

          {/* Description */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: theme.text }]}>{t('editProfile.descLabel')}</Text>
            <View style={[styles.inputWrapper, { backgroundColor: theme.bgInput, borderColor: theme.border, minHeight: hp(90), alignItems: 'flex-start' }]}>
              <FileText size={ms(16)} color={theme.textMuted} style={{ marginTop: hp(12) }} />
              <TextInput
                style={[styles.input, { color: theme.text, textAlignVertical: 'top', minHeight: hp(70) }]}
                value={description}
                onChangeText={setDescription}
                placeholder={t('editProfile.descPlaceholder')}
                placeholderTextColor={theme.textMuted}
                multiline
                maxLength={200}
              />
            </View>
            <Text style={[styles.charCount, { color: theme.textMuted }]}>
              {description.length}/200
            </Text>
          </View>
        </View>

        {/* ═══ Section: Contact ═══ */}
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
          {t('editProfile.contactSection').toUpperCase()}
        </Text>
        <View style={[styles.card, { backgroundColor: theme.bgCard }]}>
          {/* Téléphone */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: theme.text }]}>{t('editProfile.phoneLabel')}</Text>
            <View style={[styles.inputWrapper, { backgroundColor: theme.bgInput, borderColor: theme.border }]}>
              <Phone size={ms(16)} color={theme.textMuted} />
              <TextInput
                style={[styles.input, { color: theme.text }]}
                value={phoneNumber}
                onChangeText={setPhoneNumber}
                placeholder={t('editProfile.phonePlaceholder')}
                placeholderTextColor={theme.textMuted}
                keyboardType="phone-pad"
              />
            </View>
          </View>

          {/* Email */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: theme.text }]}>{t('editProfile.emailLabel')}</Text>
            <View style={[styles.inputWrapper, { backgroundColor: theme.bgInput, borderColor: theme.border }]}>
              <Mail size={ms(16)} color={theme.textMuted} />
              <TextInput
                style={[styles.input, { color: theme.text }]}
                value={email}
                onChangeText={setEmail}
                placeholder={t('editProfile.emailPlaceholder')}
                placeholderTextColor={theme.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>
        </View>

        {/* ═══ Section: Catégorie ═══ */}
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
          {t('editProfile.categoryLabel').toUpperCase()}
        </Text>
        <View style={[styles.card, { backgroundColor: theme.bgCard }]}>
          <View style={styles.categoryGrid}>
            {(Object.keys(CATEGORY_LABELS) as MerchantCategory[]).map((key) => {
              const { label, emoji } = CATEGORY_LABELS[key];
              const isSelected = categorie === key;
              return (
                <TouchableOpacity
                  key={key}
                  style={[
                    styles.categoryChip,
                    {
                      backgroundColor: isSelected ? `${palette.violet}15` : theme.bgInput,
                      borderColor: isSelected ? palette.violet : theme.border,
                    },
                  ]}
                  onPress={() => setCategorie(key)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.categoryEmoji}>{emoji}</Text>
                  <Text
                    style={[
                      styles.categoryLabel,
                      { color: isSelected ? palette.violet : theme.text },
                    ]}
                  >
                    {label}
                  </Text>
                  {isSelected && (
                    <View style={[styles.categoryCheck, { backgroundColor: palette.violet }]}>
                      <Check size={ms(10)} color="#fff" strokeWidth={3} />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ═══ Section: Réseaux sociaux ═══ */}
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
          {t('editProfile.socialLinksLabel').toUpperCase()}
        </Text>
        <View style={[styles.card, { backgroundColor: theme.bgCard }]}>
          <View style={styles.fieldGroup}>
            <View style={[styles.inputWrapper, { backgroundColor: theme.bgInput, borderColor: theme.border }]}>
              <Instagram size={ms(16)} color="#E1306C" />
              <TextInput
                style={[styles.input, { color: theme.text }]}
                value={instagram}
                onChangeText={setInstagram}
                placeholder={t('editProfile.instagramPlaceholder')}
                placeholderTextColor={theme.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>
          <View style={styles.fieldGroup}>
            <View style={[styles.inputWrapper, { backgroundColor: theme.bgInput, borderColor: theme.border }]}>
              <Globe size={ms(16)} color={theme.textMuted} />
              <TextInput
                style={[styles.input, { color: theme.text }]}
                value={tiktok}
                onChangeText={setTiktok}
                placeholder={t('editProfile.tiktokPlaceholder')}
                placeholderTextColor={theme.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>
        </View>

        {/* ═══ Save button (bottom) ═══ */}
        <TouchableOpacity
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.85}
          style={{ marginTop: hp(24) }}
        >
          <LinearGradient
            colors={['#7C3AED', '#5B21B6']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.bottomSaveBtn, saving && { opacity: 0.6 }]}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Check size={ms(18)} color="#fff" strokeWidth={2} />
                <Text style={styles.bottomSaveBtnText}>{t('editProfile.saveBtn')}</Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  // ── Header ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: wp(16),
    paddingBottom: hp(12),
    borderBottomWidth: 1,
  },
  backBtn: { padding: wp(4) },
  headerTitle: { flex: 1, fontSize: FS.lg, fontWeight: '700', marginLeft: wp(12) },
  saveBtn: {},
  saveBtnGradient: {
    width: ms(40),
    height: ms(40),
    borderRadius: ms(20),
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Scroll content ──
  scrollContent: {
    paddingHorizontal: wp(20),
    paddingTop: hp(16),
    paddingBottom: hp(120),
  },

  // ── Section ──
  sectionTitle: {
    fontSize: FS.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: hp(20),
    marginBottom: hp(8),
    marginLeft: wp(4),
  },

  // ── Card ──
  card: {
    borderRadius: radius.xl,
    padding: wp(16),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 2,
  },

  // ── Fields ──
  fieldGroup: {
    marginBottom: hp(12),
  },
  label: {
    fontSize: FS.sm,
    fontWeight: '600',
    marginBottom: hp(6),
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: wp(14),
    gap: wp(10),
  },
  input: {
    flex: 1,
    fontSize: FS.md,
    paddingVertical: hp(13),
  },
  charCount: {
    fontSize: FS.xs - 1,
    textAlign: 'right',
    marginTop: hp(4),
  },

  // ── Category grid ──
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: wp(8),
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: wp(12),
    paddingVertical: hp(8),
    borderRadius: radius.md,
    borderWidth: 1.5,
    gap: wp(4),
  },
  categoryEmoji: { fontSize: FS.md },
  categoryLabel: { fontSize: FS.sm, fontWeight: '600' },
  categoryCheck: {
    width: ms(16),
    height: ms(16),
    borderRadius: ms(8),
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: wp(2),
  },

  // ── Bottom save ──
  bottomSaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: hp(16),
    borderRadius: radius.xl,
    gap: wp(8),
  },
  bottomSaveBtnText: {
    color: '#fff',
    fontSize: FS.md,
    fontWeight: '700',
  },
});
