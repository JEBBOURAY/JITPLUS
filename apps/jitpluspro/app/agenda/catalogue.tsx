import { useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { Text } from '@/components/AppText';
import { Check } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useDir } from '@/hooks/useDir';
import { useMoney } from '@/hooks/useCurrency';
import { useAuthStore } from '@/stores/authStore';
import { useBookingSetup, useCreateBookingService } from '@/hooks/queries/booking';
import { getErrorMessage } from '@/utils/error';
import { ms } from '@/utils/responsive';
import { font, icon } from '@/constants/design';
import { Button, Chip, ChipRow, FieldLabel, Input, Notice, ScreenHeader } from '@/components/scratch/ScratchUI';
import { formatDuration } from '@jitplus/shared/src/booking';
import { OwnerOnlyNotice } from '@/components/stores/StoreUi';
import { DURATION_PRESETS, parseDuration, parsePrice } from '@/components/booking/bookingForm';

interface Picked { duration: string; price: string }

/**
 * Catalogue of the merchant's category: the template gives only the name.
 * Duration (required) and price are always typed by the merchant.
 */
export default function BookingCatalogueScreen() {
  const shouldWait = useRequireAuth();
  const isTeamMember = useAuthStore((s) => s.isTeamMember);
  const theme = useTheme();
  const { t } = useLanguage();
  const { row, textAlign } = useDir();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { symbol } = useMoney();
  const { data, isLoading } = useBookingSetup(!shouldWait && !isTeamMember);
  const create = useCreateBookingService();
  const [picked, setPicked] = useState<Record<string, Picked>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const templates = useMemo(() => {
    const used = new Set((data?.services ?? []).map((s) => s.templateId).filter(Boolean));
    return (data?.templates ?? []).filter((tpl) => !used.has(tpl.id));
  }, [data]);

  if (shouldWait) return null;
  if (isTeamMember) return <OwnerOnlyNotice />;

  const toggle = (id: string) =>
    setPicked((cur) => {
      const next = { ...cur };
      if (next[id]) delete next[id];
      else next[id] = { duration: '', price: '' };
      return next;
    });
  const edit = (id: string, patch: Partial<Picked>) =>
    setPicked((cur) => ({ ...cur, [id]: { ...cur[id], ...patch } }));

  const count = Object.keys(picked).length;

  const submit = async () => {
    setError(null);
    const entries = templates.filter((tpl) => picked[tpl.id]);
    for (const tpl of entries) {
      if (parseDuration(picked[tpl.id].duration) === null) return setError(t('booking.catalogue.errDuration', { name: tpl.nom }));
      if (Number.isNaN(parsePrice(picked[tpl.id].price))) return setError(t('booking.catalogue.errPrice', { name: tpl.nom }));
    }
    setSaving(true);
    try {
      // One at a time: keeps the catalogue order and stops at the first refusal.
      for (const tpl of entries) {
        await create.mutateAsync({
          templateId: tpl.id,
          durationMin: parseDuration(picked[tpl.id].duration) as number,
          priceFrom: parsePrice(picked[tpl.id].price),
        });
        setPicked((cur) => {
          const next = { ...cur };
          delete next[tpl.id];
          return next;
        });
      }
      router.back();
    } catch (err) {
      setError(getErrorMessage(err, t('booking.setup.saveError')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: theme.bg }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader title={t('booking.catalogue.title')} onBack={() => router.back()} />
      {isLoading ? (
        <ActivityIndicator color={theme.primary} />
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
          <Text style={[styles.intro, { color: theme.textSecondary, textAlign }]} maxFontSizeMultiplier={1.4}>{t('booking.catalogue.intro')}</Text>
          {templates.length === 0 && <Notice text={t('booking.catalogue.empty')} />}

          {templates.map((tpl) => {
            const p = picked[tpl.id];
            const selected = !!p;
            return (
              <View key={tpl.id} style={[styles.card, { backgroundColor: theme.bgCard, borderColor: selected ? theme.primary : theme.border }]}>
                <TouchableOpacity
                  onPress={() => toggle(tpl.id)}
                  style={[styles.cardHead, { flexDirection: row }]}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={tpl.nom}
                >
                  <View style={[styles.box, { borderColor: selected ? theme.primary : theme.border, backgroundColor: selected ? theme.primary : 'transparent' }]}>
                    {selected && <Check size={14} color="#FFFFFF" strokeWidth={icon.strokeSmall} />}
                  </View>
                  <View style={styles.cardText}>
                    <Text style={[styles.name, { color: theme.text, textAlign }]} maxFontSizeMultiplier={1.3}>{tpl.nom}</Text>
                    {tpl.description ? (
                      <Text style={[styles.desc, { color: theme.textMuted, textAlign }]} maxFontSizeMultiplier={1.3}>{tpl.description}</Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
                {/* The common durations in one tap, any other in the field. */}
                {selected && (
                  <ChipRow>
                    {DURATION_PRESETS.map((v) => (
                      <Chip key={v} label={formatDuration(v, t)} selected={p.duration === String(v)} onPress={() => edit(tpl.id, { duration: String(v) })} />
                    ))}
                  </ChipRow>
                )}
                {selected && (
                  <View style={[styles.fields, { flexDirection: row }]}>
                    <View style={styles.field}>
                      <FieldLabel text={t('booking.catalogue.duration')} />
                      <Input
                        value={p.duration}
                        onChangeText={(duration) => edit(tpl.id, { duration })}
                        keyboardType="number-pad"
                        maxLength={3}
                        placeholder="30"
                      />
                    </View>
                    <View style={styles.field}>
                      <FieldLabel text={t('booking.service.price', { symbol })} />
                      <Input
                        value={p.price}
                        onChangeText={(price) => edit(tpl.id, { price })}
                        keyboardType="decimal-pad"
                        maxLength={10}
                        placeholder={t('booking.optional')}
                      />
                    </View>
                  </View>
                )}
              </View>
            );
          })}

          <Button variant="ghost" label={t('booking.catalogue.notListed')} onPress={() => router.replace('/agenda/service')} />
          {error ? <Notice tone="danger" text={error} /> : null}
          <Button
            label={count ? t('booking.catalogue.submit', { count }) : t('booking.catalogue.pickFirst')}
            onPress={submit}
            loading={saving}
            disabled={!count || saving}
          />
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 4, gap: 10 },
  intro: { fontSize: ms(13), lineHeight: ms(19), fontFamily: font.regular, marginBottom: 4 },
  card: { borderRadius: 18, borderWidth: 1.5, padding: 14, gap: 12 },
  cardHead: { alignItems: 'center', gap: 12 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  cardText: { flex: 1, gap: 2 },
  name: { fontSize: ms(15), fontFamily: font.semibold },
  desc: { fontSize: ms(12), fontFamily: font.regular },
  fields: { gap: 10 },
  field: { flex: 1, gap: 6 },
});
