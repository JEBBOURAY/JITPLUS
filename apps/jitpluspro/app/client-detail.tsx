import { useState, useMemo, useCallback, useEffect } from 'react';
import { useGuardedCallback } from '@/hooks/useGuardedCallback';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Platform,
  Modal,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  RefreshControl,
  Linking,
} from 'react-native';
import {
  ArrowLeft,
  Phone,
  Mail,
  X,
  CheckCircle2,
  Circle,
  PlusCircle,
  MinusCircle,
  MessageCircle,
  type LucideIcon,
} from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useTheme } from '@/contexts/ThemeContext';
import { ActionButton } from '@/components/ui/ActionButton';
import { font, icon } from '@/constants/design';
import { useDir } from '@/hooks/useDir';
import { useLanguage } from '@/contexts/LanguageContext';
import StampGrid from '@/components/StampGrid';
import { formatDate } from '@/utils/date';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useClientDetail, useAdjustStamps } from '@/hooks/useQueryHooks';
import { isValidUUID } from '@/utils/validation';
import api from '@/services/api';
import { getErrorMessage } from '@/utils/error';
import { HistoryListItem, buildHomeRows } from '@/components/TransactionRow';

const HIT_SLOP_LARGE = { top: 12, bottom: 12, left: 12, right: 12 };
// The profile is a ScrollView (no virtualization), so cap the mounted transaction rows.
// The backend returns the most recent first.
const MAX_VISIBLE_TX = 50;

function ContactRow({
  Icon,
  text,
  muted = false,
  iconColor,
  isFirst = false,
}: {
  Icon: LucideIcon;
  text: string;
  muted?: boolean;
  iconColor?: string;
  isFirst?: boolean;
}) {
  const theme = useTheme();
  const dir = useDir();
  return (
    <View
      style={[
        styles.contactRow,
        { flexDirection: dir.row },
        !isFirst && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.borderLight },
      ]}
    >
      <Icon size={16} color={iconColor ?? theme.textMuted} strokeWidth={icon.stroke} />
      <Text
        style={[styles.contactText, { color: muted ? theme.textMuted : theme.textSecondary, textAlign: dir.textAlign }]}
        numberOfLines={1}
      >
        {text}
      </Text>
    </View>
  );
}
export default function ClientDetailScreen() {
  const shouldWait = useRequireAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const merchant = useAuthStore((s) => s.merchant);
  // Manual stamp adjustments are owner-only on the server.
  const isTeamMember = useAuthStore((s) => s.isTeamMember);
  const theme = useTheme();
  const dir = useDir();
  const insets = useSafeAreaInsets();

  const [adjustModalVisible, setAdjustModalVisible] = useState(false);
  const [adjustMode, setAdjustMode] = useState<'add' | 'remove'>('add');
  const [adjustStamps, setAdjustStamps] = useState('');
  const [adjustNote, setAdjustNote] = useState('');
  const { t, locale } = useLanguage();

  const validId = id && isValidUUID(id);

  useEffect(() => {
    if (!validId) {
      Alert.alert(t('common.error'), t('clientDetail.invalidClient'), [
        { text: 'OK', onPress: () => router.back() },
      ]);
    }
  }, [validId, t, router]);

  const {
    data: client,
    isLoading: loading,
    refetch,
    isRefetching: refreshing,
  } = useClientDetail(validId ? id : '');

  const adjustMutation = useAdjustStamps();

  const onRefresh = useGuardedCallback(async () => { await refetch(); }, [refetch]);

  const openAdjustModal = useCallback((mode: 'add' | 'remove') => {
    setAdjustMode(mode);
    setAdjustStamps('');
    setAdjustNote('');
    setAdjustModalVisible(true);
  }, []);

  const txRows = useMemo(
    () => buildHomeRows((client?.transactions ?? []).slice(0, MAX_VISIBLE_TX), t, locale),
    [client?.transactions, t, locale],
  );
  const hiddenTxCount = Math.max(0, (client?.transactions?.length ?? 0) - MAX_VISIBLE_TX);

  const handleAdjustStamps = useCallback(async () => {
    const count = parseInt(adjustStamps, 10);
    if (!count || count <= 0) {
      Alert.alert(t('common.error'), t('clientDetail.adjustInvalidCount'));
      return;
    }

    const signedStamps = adjustMode === 'remove' ? -count : count;
    const unit = count === 1 ? t('common.stamp') : t('common.stamps');
    const displayName = [client?.prenom, client?.nom].filter(Boolean).join(' ');

    Alert.alert(
      t('common.confirm'),
      t(adjustMode === 'add' ? 'clientDetail.adjustConfirmAdd' : 'clientDetail.adjustConfirmRemove', { count, unit, name: displayName }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.confirm'),
          onPress: async () => {
            try {
              await adjustMutation.mutateAsync({
                clientId: id!,
                stamps: signedStamps,
                note: adjustNote.trim() || undefined,
              });
              setAdjustModalVisible(false);
              Alert.alert(
                t('common.success'),
                t(adjustMode === 'add' ? 'clientDetail.adjustSuccessAdd' : 'clientDetail.adjustSuccessRemove', { count }),
              );
            } catch (err: unknown) {
              const msg = getErrorMessage(err, t('clientDetail.adjustDefaultError'));
              Alert.alert(t('common.error'), msg);
            }
          },
        },
      ],
    );
  }, [adjustStamps, adjustMode, adjustNote, adjustMutation, id, client, t]);

  // Reshare the WhatsApp claim link (anonymous Quick-Add clients only).
  const [resharing, setResharing] = useState(false);
  const clientId = client?.id;
  const isAnonymous = client?.isAnonymous;
  const merchantName = merchant?.nom;
  const handleReshareClaim = useCallback(async () => {
    if (!clientId || !isAnonymous || resharing) return;
    setResharing(true);
    try {
      const res = await api.post(`/merchant/clients/${clientId}/reshare-claim`);
      const data = res.data as {
        claim: { url: string; expiresAt: string };
        client: { telephone: string | null; prenom: string | null };
      };
      const phoneDigits = (data.client.telephone || '').replace(/[^\d]/g, '');
      const namePart = data.client.prenom?.trim()
        ? t('quickAdd.waMessageHello', { name: data.client.prenom.trim() })
        : '';
      const message = t('quickAdd.reshareWaMessage', {
        name: namePart,
        merchant: merchantName ?? 'JitPlus',
        url: data.claim.url,
      });
      const waUrl = phoneDigits
        ? `https://wa.me/${phoneDigits}?text=${encodeURIComponent(message)}`
        : `whatsapp://send?text=${encodeURIComponent(message)}`;
      try {
        const can = await Linking.canOpenURL(waUrl);
        if (can) {
          await Linking.openURL(waUrl);
        } else {
          // Fallback: copy the link so the merchant can paste it manually
          Alert.alert(t('quickAdd.waNotInstalled'), data.claim.url);
        }
      } catch {
        Alert.alert(t('quickAdd.waNotInstalled'), data.claim.url);
      }
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } } | null)?.response?.status;
      if (status === 409) {
        Alert.alert(t('common.error'), t('clientDetail.reshareAlreadyRegistered'));
      } else {
        Alert.alert(t('common.error'), getErrorMessage(err, t('clientDetail.reshareError')));
      }
    } finally {
      setResharing(false);
    }
  }, [clientId, isAnonymous, resharing, merchantName, t]);

  // Prefer the per-client threshold computed by the backend (custom rewards) over the merchant's static field.
  const stampsForReward = client?.stampsForReward || merchant?.stampsForReward || 10;

  // Guard: auth not ready
  if (shouldWait) return null;

  // Guard: invalid or missing UUID — after all hooks
  if (!validId) {
    router.back();
    return null;
  }

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.bg }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  if (!client) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.bg }]}>
        <Text style={[styles.notFound, { color: theme.textMuted }]}>{t('clientDetail.notFound')}</Text>
      </View>
    );
  }

  const displayName = [client.prenom, client.nom].filter(Boolean).join(' ') || '?';
  const initial = (client.prenom || client.nom || '?').charAt(0).toUpperCase();
  const adjustTitle = t(adjustMode === 'add' ? 'clientDetail.adjustAddTitle' : 'clientDetail.adjustRemoveTitle', { unit: t('common.stamps') });
  const cardStyle = [styles.card, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }];
  const sectionTitleStyle = [styles.sectionTitle, { color: theme.text, textAlign: dir.textAlign }];

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={[styles.headerBar, { flexDirection: dir.row, paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={HIT_SLOP_LARGE}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <ArrowLeft size={22} color={theme.text} strokeWidth={icon.stroke} style={dir.flip} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]} maxFontSizeMultiplier={1.4}>
          {t('clientDetail.title')}
        </Text>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.primary}
            colors={[theme.primary]}
          />
        }
      >
        <View style={[cardStyle, styles.profileCard]}>
          <View style={[styles.avatar, { backgroundColor: `${theme.primary}1A` }]} importantForAccessibility="no">
            <Text style={[styles.avatarText, { color: theme.primary }]}>{initial}</Text>
          </View>
          <Text style={[styles.profileName, { color: theme.text }]} numberOfLines={1}>{displayName}</Text>
          <Text style={[styles.memberSince, { color: theme.textMuted }]}>
            {t('clientDetail.memberSince', { date: formatDate(client.memberSince, locale) })}
          </Text>
          <View style={[styles.stampsRow, { flexDirection: dir.row }]}>
            <Text style={[styles.stampsValue, { color: theme.text }]}>{client.stamps}</Text>
            <Text style={[styles.stampsLabel, { color: theme.textMuted }]}>
              {client.stamps === 1 ? t('common.stamp') : t('common.stamps')}
            </Text>
          </View>

          {!isTeamMember && (
            <View style={[styles.adjustButtons, { flexDirection: dir.row }]}>
              <ActionButton
                label={t('clientDetail.addBtn')}
                icon={PlusCircle}
                onPress={() => openAdjustModal('add')}
                style={styles.flex1}
              />
              <ActionButton
                label={t('clientDetail.removeBtn')}
                icon={MinusCircle}
                variant="secondary"
                onPress={() => openAdjustModal('remove')}
                style={styles.flex1}
              />
            </View>
          )}
        </View>

        {client.isAnonymous && (
          <View style={[cardStyle, styles.cardSpaced]}>
            <Text style={[styles.anonText, { color: theme.textMuted }]}>
              {t('clientDetail.anonymousBadge')}
            </Text>
            <ActionButton
              label={resharing ? t('clientDetail.reshareSending') : t('clientDetail.reshareBtn')}
              icon={MessageCircle}
              variant="secondary"
              loading={resharing}
              onPress={handleReshareClaim}
            />
          </View>
        )}

        <Text style={sectionTitleStyle}>{t('clientDetail.loyaltyCard')}</Text>
        <View style={cardStyle}>
          <StampGrid current={client.stamps} total={stampsForReward} size={38} />
        </View>

        <Text style={sectionTitleStyle}>{t('clientDetail.contact')}</Text>
        <View style={[cardStyle, styles.listCard]}>
          <ContactRow
            isFirst
            Icon={Mail}
            text={client.email || t('clientDetail.notShared')}
            muted={!client.email}
          />
          {/* The backend stores the normalized full number (e.g. +212612345678), so it is shown as-is. */}
          <ContactRow
            Icon={Phone}
            text={client.telephone || t('clientDetail.notShared')}
            muted={!client.telephone}
          />
          <ContactRow
            Icon={client.termsAccepted ? CheckCircle2 : Circle}
            iconColor={client.termsAccepted ? theme.primary : undefined}
            text={t(client.termsAccepted ? 'clientDetail.termsAccepted' : 'clientDetail.termsNotAccepted')}
            muted={!client.termsAccepted}
          />
        </View>

        <Text style={sectionTitleStyle}>
          {t('clientDetail.lastTransactions')}
          <Text style={{ color: theme.textMuted }}>{`  ${client.transactions.length}`}</Text>
        </Text>
        {txRows.length === 0 ? (
          <Text style={[styles.noTx, { color: theme.textMuted }]}>{t('clientDetail.noTransactions')}</Text>
        ) : (
          txRows.map((row) => <HistoryListItem key={row.id} row={row} showType />)
        )}
        {hiddenTxCount > 0 && (
          <Text style={[styles.noTx, { color: theme.textMuted }]}>
            + {hiddenTxCount} {t('common.older')}
          </Text>
        )}
      </ScrollView>

      <Modal
        visible={adjustModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setAdjustModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
          <View style={[styles.modalContent, { backgroundColor: theme.bgCard }]}>
            <View style={[styles.modalHeader, { flexDirection: dir.row }]}>
              <Text style={[styles.modalTitle, { color: theme.text, textAlign: dir.textAlign }]}>
                {adjustTitle}
              </Text>
              <TouchableOpacity
                onPress={() => setAdjustModalVisible(false)}
                hitSlop={HIT_SLOP_LARGE}
                accessibilityRole="button"
                accessibilityLabel={t('common.close')}
              >
                <X size={22} color={theme.textMuted} strokeWidth={icon.stroke} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalLabel, { color: theme.textSecondary, textAlign: dir.textAlign }]}>
              {t('clientDetail.adjustCountLabel', { unit: t('common.stamps') })}
            </Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: theme.bgElevated, color: theme.text, borderColor: theme.borderLight, textAlign: dir.textAlign }]}
              keyboardType="number-pad"
              placeholder={t('clientDetail.adjustCountPlaceholder')}
              placeholderTextColor={theme.textMuted}
              value={adjustStamps}
              onChangeText={(v) => setAdjustStamps(v.replace(/[^0-9]/g, ''))}
              autoFocus
            />

            <Text style={[styles.modalLabel, { color: theme.textSecondary, textAlign: dir.textAlign }]}>
              {t('clientDetail.adjustReasonLabel')}
            </Text>
            <TextInput
              style={[styles.modalInput, styles.modalInputMultiline, { backgroundColor: theme.bgElevated, color: theme.text, borderColor: theme.borderLight, textAlign: dir.textAlign }]}
              placeholder={t('clientDetail.adjustReasonPlaceholder')}
              placeholderTextColor={theme.textMuted}
              value={adjustNote}
              onChangeText={setAdjustNote}
              multiline
              maxLength={255}
            />

            <ActionButton
              label={adjustTitle}
              size="lg"
              loading={adjustMutation.isPending}
              onPress={handleAdjustStamps}
              style={styles.modalConfirmBtn}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  notFound: { fontSize: 14, fontFamily: font.regular },
  flex1: { flex: 1 },

  headerBar: {
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 18,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: font.bold,
    letterSpacing: -0.3,
  },

  body: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 8 },

  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  cardSpaced: { marginTop: 12 },
  listCard: { paddingVertical: 0 },
  sectionTitle: {
    fontSize: 16,
    fontFamily: font.bold,
    letterSpacing: -0.3,
    marginTop: 20,
    marginBottom: 10,
  },

  profileCard: { alignItems: 'center' },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatarText: { fontSize: 24, fontFamily: font.bold },
  profileName: { fontSize: 20, fontFamily: font.bold, letterSpacing: -0.3 },
  memberSince: { fontSize: 13, marginTop: 4, fontFamily: font.regular },
  stampsRow: { alignItems: 'baseline', gap: 6, marginTop: 12 },
  stampsValue: { fontSize: 22, fontFamily: font.bold, letterSpacing: -0.4 },
  stampsLabel: { fontSize: 13, fontFamily: font.medium },
  adjustButtons: { alignSelf: 'stretch', gap: 10, marginTop: 16 },

  anonText: {
    fontSize: 13,
    fontFamily: font.medium,
    marginBottom: 12,
    textAlign: 'center',
  },

  contactRow: {
    alignItems: 'center',
    gap: 10,
    minHeight: 48,
  },
  contactText: { flex: 1, fontSize: 14, fontFamily: font.regular },

  noTx: { fontSize: 14, textAlign: 'center', paddingVertical: 16, fontFamily: font.regular },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  modalHeader: {
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: { fontSize: 20, fontFamily: font.bold },
  modalLabel: { fontSize: 14, marginBottom: 6, marginTop: 12, fontFamily: font.semibold },
  modalInput: {
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    fontFamily: font.medium,
  },
  modalInputMultiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  modalConfirmBtn: { marginTop: 24 },
});
