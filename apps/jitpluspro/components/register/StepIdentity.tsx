import React from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Store, Check } from 'lucide-react-native';
import { MerchantCategory } from '@/types';
import { CATEGORY_LABELS } from '@/constants/categories';
import type { ThemeColors } from '@/contexts/ThemeContext';

interface Props {
  theme: ThemeColors;
  t: (key: string, opts?: Record<string, unknown>) => string;
  nom: string;
  setNom: (v: string) => void;
  categorie: MerchantCategory | null;
  setCategorie: (v: MerchantCategory) => void;
  googleIdToken: string | null;
  setGoogleIdToken: (v: string | null) => void;
  google: {
    promptGoogle: () => void;
    isLoading: boolean;
    error: string | null;
  };
  canProceed: boolean;
  isLoading: boolean;
  palette: Record<string, string>;
}

export function StepIdentity({
  theme, t, nom, setNom, categorie, setCategorie,
  googleIdToken, setGoogleIdToken, google, canProceed, isLoading, palette,
}: Props) {
  return (
    <>
      {/* Nom de la boutique */}
      <View style={styles.field}>
        <Text style={[styles.label, { color: theme.text }]}>
          {t('register.nameLabel')} *
        </Text>
        <View
          style={[
            styles.inputRow,
            {
              backgroundColor: theme.bgInput,
              borderColor: nom.trim().length > 0 ? theme.success : theme.border,
            },
          ]}
        >
          <Store size={20} color={nom.trim().length > 0 ? theme.success : theme.textMuted} />
          <TextInput
            style={[styles.input, { color: theme.text }]}
            value={nom}
            onChangeText={setNom}
            placeholder={t('registerExtra.namePlaceholder')}
            placeholderTextColor={theme.textMuted}
            autoFocus
            returnKeyType="next"
          />
        </View>
      </View>

      {/* Catégorie */}
      <View style={styles.field}>
        <Text style={[styles.label, { color: theme.text }]}>
          {t('register.categoryLabel')} *
        </Text>
        <View style={styles.categoryGrid}>
          {Object.entries(CATEGORY_LABELS).map(([key, { label, emoji }]) => {
            const isSelected = categorie === key;
            return (
              <TouchableOpacity
                key={key}
                style={[
                  styles.categoryChip,
                  {
                    backgroundColor: isSelected ? theme.primaryBg : theme.bgCard,
                    borderColor: isSelected ? theme.primary : theme.border,
                  },
                ]}
                onPress={() => setCategorie(key as MerchantCategory)}
                activeOpacity={0.7}
              >
                <Text style={styles.categoryEmoji}>{emoji}</Text>
                <Text
                  style={[
                    styles.categoryLabel,
                    {
                      color: isSelected ? theme.primary : theme.textSecondary,
                      fontWeight: isSelected ? '700' : '500',
                    },
                  ]}
                >
                  {label}
                </Text>
                {isSelected && <Check size={14} color={theme.primary} strokeWidth={1.5} />}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Google Sign-Up option */}
      {!googleIdToken && (
        <>
          <View style={styles.separator}>
            <View style={[styles.separatorLine, { backgroundColor: theme.border }]} />
            <Text style={[styles.separatorText, { color: theme.textMuted }]}>
              {t('login.orDivider')}
            </Text>
            <View style={[styles.separatorLine, { backgroundColor: theme.border }]} />
          </View>

          <TouchableOpacity
            style={[styles.googleBtn, { backgroundColor: theme.bgCard, borderColor: theme.border }]}
            onPress={google.promptGoogle}
            disabled={google.isLoading || isLoading || !canProceed}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t('registerExtra.signUpWithGoogle')}
          >
            {google.isLoading ? (
              <ActivityIndicator color={palette.charbon} size="small" />
            ) : (
              <>
                <View style={styles.googleIconWrap}>
                  <Text style={styles.googleG}>G</Text>
                </View>
                <Text style={[styles.googleBtnText, { color: theme.text }]}>
                  {t('registerExtra.signUpWithGoogle')}
                </Text>
              </>
            )}
          </TouchableOpacity>

          {!!google.error && (
            <Text style={[styles.hint, { color: theme.danger, textAlign: 'center', marginTop: 8 }]}>
              {google.error}
            </Text>
          )}
        </>
      )}

      {/* Google token captured badge */}
      {googleIdToken && (
        <View style={[styles.googleBadge, { backgroundColor: `${theme.success}12`, borderColor: `${theme.success}30` }]}>
          <Check size={16} color={theme.success} strokeWidth={2} />
          <Text style={[styles.googleBadgeText, { color: theme.success }]}>
            {t('registerExtra.googleLinked')}
          </Text>
          <TouchableOpacity onPress={() => setGoogleIdToken(null)} activeOpacity={0.7}>
            <Text style={[styles.googleBadgeReset, { color: theme.textMuted }]}>
              {t('registerExtra.googleChange')}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: 20 },
  label: { fontSize: 15, fontWeight: '700', marginBottom: 8 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 52,
    gap: 10,
  },
  input: { flex: 1, fontSize: 15, fontWeight: '500' },
  hint: { fontSize: 12, marginTop: 6, lineHeight: 16 },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    gap: 6,
  },
  categoryEmoji: { fontSize: 18 },
  categoryLabel: { fontSize: 13 },
  separator: { flexDirection: 'row', alignItems: 'center', marginVertical: 20 },
  separatorLine: { flex: 1, height: 1 },
  separatorText: { marginHorizontal: 14, fontSize: 13, fontWeight: '600' },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: 14,
    gap: 10,
  },
  googleIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#4285F4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleG: { color: '#fff', fontSize: 16, fontWeight: '800' },
  googleBtnText: { fontSize: 15, fontWeight: '600' },
  googleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 8,
    marginTop: 12,
  },
  googleBadgeText: { flex: 1, fontSize: 14, fontWeight: '600' },
  googleBadgeReset: { fontSize: 13, fontWeight: '600', textDecorationLine: 'underline' },
});
