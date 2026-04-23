import React, { useState, useMemo, useCallback, useEffect } from 'react';
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
} from 'react-native';
import {
  ArrowLeft,
  Star,
  Phone,
  Mail,
  Calendar,
  Gift,
  Clock,
  X,
  CheckCircle2,
  Circle,
  PlusCircle,
  MinusCircle,
  RefreshCw,
  FileText,
} from 'lucide-react-native';
import { getTransactionConfig } from '@/constants/transactions';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { ms } from '@/utils/responsive';
import { useLanguage } from '@/contexts/LanguageContext';
import StampGrid from '@/components/StampGrid';
import { formatDate, formatDateTime } from '@/utils/date';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatCurrency, DEFAULT_CURRENCY, getIntlLocale } from '@/config/currency';
import { useClientDetail, useAdjustPoints } from '@/hooks/useQueryHooks';
import { isValidUUID } from '@/utils/validation';

/* ── Memoized transaction row — avoids re-render of every row on parent updates ── */
const TransactionItem = React.memo(function TransactionItem({
  tx,
  isStampsMode,
}: {
  tx: ClientDetailTransaction;
  isStampsMode: boolean;
}) {
  const theme = useTheme();
  const { t, locale } = useLanguage();

  const isEarned = tx.type === 'EARN_POINTS';
  const isAdjust = tx.type === 'ADJUST_POINTS';
  const isProgramChange = tx.type === 'LOYALTY_PROGRAM_CHANGE';
  const isCancelled = tx.status === 'CANCELLED';
  const { icon: IconComp, color } = getTransactionConfig(tx.type, isCancelled, theme);

  return (
    <View style={[styles.txRow, { borderBottomColor: theme.borderLight }]}>
      <View style={[styles.txIcon, { backgroundColor: color + '15' }]}>
        <IconComp size={14} color={color} strokeWidth={1.5} />
      </View>
      <View style={styles.txInfo}>
        <Text style={[styles.txType, { color: theme.text }, isCancelled && styles.cancelled]}>
          {isProgramChange
            ? t('clientDetail.txProgramChange')
            : isAdjust
              ? t('clientDetail.txAdjustment')
              : isEarned
                ? t('clientDetail.txEarned')
                : t('clientDetail.txRedeemed')}
        </Text>
        {isProgramChange && tx.note && (
          <View style={styles.txInlineRow}>
            <RefreshCw size={10} color={theme.primary} strokeWidth={2} />
            <Text style={[styles.txNote, { color: theme.primary, flex: 1 }]} numberOfLines={2}>
              {tx.note}
            </Text>
          </View>
        )}
        {isAdjust && tx.note ? (
          <View style={styles.txInlineRow}>
            <FileText size={10} color={theme.textMuted} strokeWidth={2} />
            <Text style={[styles.txNote, { color: theme.textMuted, flex: 1 }]} numberOfLines={2}>
              {tx.note}
            </Text>
          </View>
        ) : null}
        {!isEarned && !isAdjust && !isProgramChange && tx.reward && (
          <View style={styles.txRewardRow}>
            <Gift size={10} color={theme.primary} strokeWidth={2} />
            <Text style={[styles.txRewardName, { color: theme.primary, flex: 1 }]}>{tx.reward.titre}</Text>
            {tx.type === 'REDEEM_REWARD' && !isCancelled && tx.giftStatus === 'FULFILLED' && (
              <View style={[styles.txGiftBadge, { backgroundColor: theme.accentBg }]}>
                <Text style={[styles.txGiftBadgeText, { color: theme.accent }]}>{t('gift.fulfilled')}</Text>
              </View>
            )}
          </View>
        )}

        <Text style={[styles.txDate, { color: theme.textMuted }]}>{formatDateTime(tx.createdAt, locale)}</Text>
        {isCancelled && <Text style={[styles.txCancelLabel, { color: theme.danger }]}>{t('clientDetail.txCancelled')}</Text>}
      </View>
      {!isProgramChange && (
        <View style={styles.txRight}>
          {tx.amount > 0 && (
            <Text style={[styles.txAmount, { color: theme.textSecondary }, isCancelled && styles.cancelled]}>
              {formatCurrency(tx.amount, DEFAULT_CURRENCY, getIntlLocale(locale))}
            </Text>
          )}
          <Text style={[styles.txPoints, { color }, isCancelled && styles.cancelled]}>
            {isAdjust ? (tx.points >= 0 ? '+' : '') : isEarned ? '+' : '-'}{tx.points} {(tx.loyaltyType ?? (isStampsMode ? 'STAMPS' : 'POINTS')) === 'STAMPS' ? t('common.stampsAbbr') : t('common.pointsAbbr')}
          </Text>
        </View>
      )}
    </View>
  );
});

// Type import for transactions
import type { ClientDetailTransaction } from '@/types';

export default function ClientDetailScreen() {
  const shouldWait = useRequireAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { merchant } = useAuth();
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const [adjustModalVisible, setAdjustModalVisible] = useState(false);
  const [adjustMode, setAdjustMode] = useState<'add' | 'remove'>('add');
  const [adjustPoints, setAdjustPoints] = useState('');
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

  const adjustMutation = useAdjustPoints();

  const onRefresh = useGuardedCallback(async () => { await refetch(); }, [refetch]);

  const openAdjustModal = useCallback((mode: 'add' | 'remove') => {
    setAdjustMode(mode);
    setAdjustPoints('');
    setAdjustNote('');
    setAdjustModalVisible(true);
  }, []);

  const isStampsMode = client
    ? (merchant?.loyaltyType === 'STAMPS' || client.loyaltyType === 'STAMPS')
    : false;

  const handleAdjustPoints = useCallback(async () => {
    const pts = parseInt(adjustPoints, 10);
    if (!pts || pts <= 0) {
      Alert.alert(t('common.error'), t('clientDetail.adjustInvalidPts'));
      return;
    }

    const finalPoints = adjustMode === 'remove' ? -pts : pts;
    const unit = isStampsMode ? t('common.stamps') : t('common.points');
    const action = adjustMode === 'add' ? t('clientDetail.adjustActionAdd') : t('clientDetail.adjustActionRemove');
    const direction = adjustMode === 'add' ? t('clientDetail.adjustDirAdd') : t('clientDetail.adjustDirRemove');
    const displayName = [client?.prenom, client?.nom].filter(Boolean).join(' ');

    Alert.alert(
      t('common.confirm'),
      t('clientDetail.adjustConfirmMsg', { action, pts, unit, direction, name: displayName }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.confirm'),
          onPress: async () => {
            try {
              await adjustMutation.mutateAsync({
                clientId: id!,
                points: finalPoints,
                note: adjustNote.trim() || undefined,
              });
              setAdjustModalVisible(false);
              const result = adjustMode === 'add' ? t('clientDetail.adjustResultAdd') : t('clientDetail.adjustResultRemove');
              Alert.alert(t('common.confirm'), t('clientDetail.adjustSuccessMsg', { pts, unit, result }));
            } catch (err: unknown) {
              const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || t('clientDetail.adjustDefaultError');
              Alert.alert(t('common.error'), msg);
            }
          },
        },
      ],
    );
  }, [adjustPoints, adjustMode, adjustNote, adjustMutation, id, client, isStampsMode, t]);

  const stampsForReward = merchant?.stampsForReward || client?.stampsForReward || 10;
  const progressPct = useMemo(
    () => {
      if (!client) return 0;
      return isStampsMode
        ? Math.min((client.points / (stampsForReward || 1)) * 100, 100)
        : Math.min((client.points / (client.rewardThreshold || 1)) * 100, 100);
    },
    [isStampsMode, client, stampsForReward],
  );

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
        <Text style={{ color: theme.textMuted }}>{t('clientDetail.notFound')}</Text>
      </View>
    );
  }

  const displayName = [client.prenom, client.nom].filter(Boolean).join(' ') || '?';
  const initial = (client.prenom || client.nom || '?').charAt(0).toUpperCase();
  // Show phone as-is — the backend stores the normalized full number (e.g. +212612345678)
  const phoneDisplay = client.telephone || null;

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* ── Simple header ── */}
      <View style={[styles.headerBar, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <ArrowLeft size={22} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>{t('clientDetail.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={{ paddingBottom: 40 }}
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
        {/* ── Profile card ── */}
        <View style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.borderLight, shadowColor: theme.shadowColor }]}>
          <View style={styles.profileSection}>
            <View style={[styles.avatarLarge, { backgroundColor: theme.primary + '14' }]}>
              <Text style={[styles.avatarLargeText, { color: theme.primary }]}>{initial}</Text>
            </View>
            <Text style={[styles.profileName, { color: theme.text }]}>{displayName}</Text>
            <Text style={[styles.memberSince, { color: theme.textMuted }]}>
              {t('clientDetail.memberSince', { date: formatDate(client.memberSince, locale) })}
            </Text>

            {/* Points hero */}
            <View style={[styles.pointsHero, { backgroundColor: `${palette.charbon}12` }]}>
              <View style={{ width: ms(36), height: ms(36), borderRadius: ms(12), backgroundColor: `${palette.charbon}12`, justifyContent: 'center', alignItems: 'center' }}>
                <Star size={ms(16)} color={palette.charbon} strokeWidth={1.5} />
              </View>
              <Text style={[styles.pointsHeroValue, { color: theme.text }]}>{client.points}</Text>
              <Text style={[styles.pointsHeroLabel, { color: theme.textMuted }]}>{isStampsMode ? t('common.stamps') : t('common.points')}</Text>
            </View>
          </View>

          {/* Adjust points buttons */}
          <View style={styles.adjustButtons}>
            <TouchableOpacity
              style={[styles.adjustBtn, { backgroundColor: theme.primary }]}
              onPress={() => openAdjustModal('add')}
            >
              <PlusCircle size={16} color="#fff" />
              <Text style={styles.adjustBtnText}>{t('clientDetail.addBtn')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.adjustBtn, { backgroundColor: theme.isDark ? palette.charbon : '#374151' }]}
              onPress={() => openAdjustModal('remove')}
            >
              <MinusCircle size={16} color="#fff" />
              <Text style={styles.adjustBtnText}>{t('clientDetail.removeBtn')}</Text>
            </TouchableOpacity>
          </View>
        </View>
        {/* ── Progress to reward ── */}
        <View style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.borderLight, shadowColor: theme.shadowColor }]}>
          <View style={styles.cardHeader}>
            <View style={{ width: ms(36), height: ms(36), borderRadius: ms(12), backgroundColor: `${palette.charbon}12`, justifyContent: 'center', alignItems: 'center' }}>
              <Gift size={ms(16)} color={palette.charbon} strokeWidth={1.5} />
            </View>
            <Text style={[styles.cardTitle, { color: theme.text }]}>
              {isStampsMode ? t('clientDetail.loyaltyCard') : t('clientDetail.rewardProgress')}
            </Text>
          </View>

          {isStampsMode ? (
            <StampGrid current={client.points} total={stampsForReward} size={38} />
          ) : (
            <>
              <View style={[styles.progressBarBg, { backgroundColor: theme.bgElevated }]}>
                <View style={[styles.progressBarFill, { width: `${progressPct}%`, backgroundColor: theme.primary }]} />
              </View>
              <View style={styles.progressLabels}>
                <Text style={[styles.progressText, { color: theme.textMuted }]}>{client.points} / {client.rewardThreshold} pts</Text>
                {client.hasReward ? (
                  <Text style={[styles.progressBadge, { backgroundColor: theme.primaryBg, color: theme.primary }]}>
                    {t('clientDetail.rewardAvailable')}
                  </Text>
                ) : (
                  <Text style={[styles.progressRemaining, { color: theme.textMuted }]}>
                    {t('clientDetail.pointsRemaining', { count: client.rewardThreshold - client.points })}
                  </Text>
                )}
              </View>
            </>
          )}
        </View>

        {/* ── Contact info ── */}
        <View style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.borderLight, shadowColor: theme.shadowColor }]}>
          <View style={styles.cardHeader}>
            <View style={{ width: ms(36), height: ms(36), borderRadius: ms(12), backgroundColor: `${palette.charbon}12`, justifyContent: 'center', alignItems: 'center' }}>
              <Mail size={ms(16)} color={palette.charbon} strokeWidth={1.5} />
            </View>
            <Text style={[styles.cardTitle, { color: theme.text }]}>{t('clientDetail.contact')}</Text>
          </View>

          {client.email ? (
            <View style={[styles.contactRow, { borderBottomColor: theme.borderLight }]}>
              <Mail size={ms(16)} color={palette.charbon} strokeWidth={1.5} />
              <Text style={[styles.contactText, { color: theme.textSecondary }]}>{client.email}</Text>
            </View>
          ) : (
            <View style={[styles.contactRow, { borderBottomColor: theme.borderLight }]}>
              <Mail size={ms(16)} color={palette.charbon} strokeWidth={1.5} />
              <Text style={[styles.contactText, { color: theme.textMuted, fontStyle: 'italic' }]}>{t('clientDetail.notShared')}</Text>
            </View>
          )}

          {phoneDisplay ? (
            <View style={[styles.contactRow, { borderBottomColor: theme.borderLight }]}>
              <Phone size={ms(16)} color={palette.charbon} strokeWidth={1.5} />
              <Text style={[styles.contactText, { color: theme.textSecondary }]}>{phoneDisplay}</Text>
            </View>
          ) : !client.telephone ? (
            <View style={[styles.contactRow, { borderBottomColor: theme.borderLight }]}>
              <Phone size={ms(16)} color={palette.charbon} strokeWidth={1.5} />
              <Text style={[styles.contactText, { color: theme.textMuted, fontStyle: 'italic' }]}>{t('clientDetail.notShared')}</Text>
            </View>
          ) : null}

          <View style={[styles.contactRow, { borderBottomColor: theme.borderLight }]}>
            <Calendar size={ms(16)} color={palette.charbon} strokeWidth={1.5} />
            <Text style={[styles.contactText, { color: theme.textSecondary }]}>{t('clientDetail.memberSince', { date: formatDate(client.memberSince, locale) })}</Text>
          </View>
        </View>

        {/* ── Status badge ── */}
        <View style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.borderLight, shadowColor: theme.shadowColor }]}>
          <View style={styles.statusBadgeContainer}>
            {client.termsAccepted ? (
              <>
                <View style={[styles.statusBadge, { backgroundColor: theme.primaryBg, borderColor: theme.primary }]}>
                  <CheckCircle2 size={16} color={theme.primary} strokeWidth={1.5} />
                  <Text style={[styles.statusBadgeText, { color: theme.primary }]}>
                    {t('clientDetail.termsAccepted')}
                  </Text>
                </View>
              </>
            ) : (
              <>
                <View style={[styles.statusBadge, { backgroundColor: theme.isDark ? 'rgba(239,68,68,0.12)' : '#fef2f2', borderColor: theme.danger }]}>
                  <Circle size={16} color={theme.danger} strokeWidth={1.5} />
                  <Text style={[styles.statusBadgeText, { color: theme.danger }]}>
                    {t('clientDetail.termsNotAccepted')}
                  </Text>
                </View>
              </>
            )}
          </View>
        </View>

        {/* ── Transactions ── */}
        <View style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.borderLight, shadowColor: theme.shadowColor }]}>
          <View style={styles.cardHeader}>
            <View style={{ width: ms(36), height: ms(36), borderRadius: ms(12), backgroundColor: `${palette.charbon}12`, justifyContent: 'center', alignItems: 'center' }}>
              <Clock size={ms(16)} color={palette.charbon} strokeWidth={1.5} />
            </View>
            <Text style={[styles.cardTitle, { color: theme.text }]}>{t('clientDetail.lastTransactions')}</Text>
            <Text style={[styles.cardCount, { color: theme.primary, backgroundColor: theme.primaryBg }]}>{client.transactions.length}</Text>
          </View>

          {client.transactions.length === 0 ? (
            <Text style={[styles.noTx, { color: theme.textMuted }]}>{t('clientDetail.noTransactions')}</Text>
          ) : (
            client.transactions.map((tx) => (
              <TransactionItem key={tx.id} tx={tx} isStampsMode={isStampsMode} />
            ))
          )}
        </View>
      </ScrollView>

      {/* ── Adjust Points Modal ── */}
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
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                {t(adjustMode === 'add' ? 'clientDetail.adjustAddTitle' : 'clientDetail.adjustRemoveTitle', { unit: isStampsMode ? t('common.stamps') : t('common.points') })}
              </Text>
              <TouchableOpacity onPress={() => setAdjustModalVisible(false)}>
                <X size={22} color={theme.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalLabel, { color: theme.textSecondary }]}>
              {t('clientDetail.adjustCountLabel', { unit: isStampsMode ? t('common.stamps') : t('common.points') })}
            </Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: theme.bgElevated, color: theme.text, borderColor: theme.borderLight }]}
              keyboardType="number-pad"
              placeholder="Ex: 50"
              placeholderTextColor={theme.textMuted}
              value={adjustPoints}
              onChangeText={(t) => setAdjustPoints(t.replace(/[^0-9]/g, ''))}
              autoFocus
            />

            <Text style={[styles.modalLabel, { color: theme.textSecondary }]}>
              {t('clientDetail.adjustReasonLabel')}
            </Text>
            <TextInput
              style={[styles.modalInput, styles.modalInputMultiline, { backgroundColor: theme.bgElevated, color: theme.text, borderColor: theme.borderLight }]}
              placeholder={t('clientDetail.adjustReasonPlaceholder')}
              placeholderTextColor={theme.textMuted}
              value={adjustNote}
              onChangeText={setAdjustNote}
              multiline
              maxLength={255}
            />

            <TouchableOpacity
              style={[
                styles.modalConfirmBtn,
                { backgroundColor: adjustMode === 'add' ? palette.violet : palette.charbon },
                adjustMutation.isPending && { opacity: 0.6 },
              ]}
              onPress={handleAdjustPoints}
              disabled={adjustMutation.isPending}
            >
              {adjustMutation.isPending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.modalConfirmText}>
                  {t(adjustMode === 'add' ? 'clientDetail.adjustAddTitle' : 'clientDetail.adjustRemoveTitle', { unit: isStampsMode ? t('common.stamps') : t('common.points') })}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // ── Header bar ──
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    fontFamily: 'Lexend_700Bold',
    letterSpacing: -0.5,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileSection: {
    alignItems: 'center',
    paddingBottom: 8,
  },
  avatarLarge: {
    width: 72,
    height: 72,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatarLargeText: { fontSize: 28, fontWeight: '700', fontFamily: 'Lexend_700Bold' },
  profileName: { fontSize: 22, fontWeight: '700', fontFamily: 'Lexend_700Bold', letterSpacing: -0.3 },
  memberSince: { fontSize: 13, marginTop: 4, fontFamily: 'Lexend_400Regular' },
  pointsHero: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginTop: 14,
    gap: 6,
  },
  pointsHeroValue: { fontSize: 20, fontWeight: '700', fontFamily: 'Lexend_700Bold' },
  pointsHeroLabel: { fontSize: 13, fontWeight: '600', fontFamily: 'Lexend_600SemiBold' },

  // ── Body ──
  body: { flex: 1, paddingHorizontal: 16, paddingTop: 20 },

  // ── Card ──
  card: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', flex: 1, fontFamily: 'Lexend_700Bold' },
  cardCount: {
    fontSize: 13,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    overflow: 'hidden',
    fontFamily: 'Lexend_700Bold',
  },

  // ── Progress ──
  progressBarBg: {
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 5,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  progressText: { fontSize: 13, fontWeight: '600', fontFamily: 'Lexend_600SemiBold' },
  progressRemaining: { fontSize: 12, fontFamily: 'Lexend_400Regular' },
  progressBadge: {
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
    overflow: 'hidden',
    fontFamily: 'Lexend_700Bold',
  },

  // ── Contact ──
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  contactText: { fontSize: 14, flex: 1, fontFamily: 'Lexend_400Regular' },

  // ── Status Badge ──
  statusBadgeContainer: {
    paddingVertical: 8,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    gap: 8,
  },
  statusBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'Lexend_600SemiBold',
  },

  // ── Transactions ──
  noTx: { fontSize: 14, textAlign: 'center', paddingVertical: 20, fontFamily: 'Lexend_400Regular' },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  txIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  txInfo: { flex: 1 },
  txType: { fontSize: 14, fontWeight: '600', fontFamily: 'Lexend_600SemiBold' },
  txRewardName: { fontSize: 12, fontWeight: '600', marginTop: 1, fontFamily: 'Lexend_600SemiBold' },
  txRewardRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  txInlineRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  txGiftBadge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 },
  txGiftBadgeText: { fontSize: 9, fontWeight: '700', fontFamily: 'Lexend_700Bold' },
  txDate: { fontSize: 12, marginTop: 2, fontFamily: 'Lexend_400Regular' },
  txCancelLabel: { fontSize: 11, fontWeight: '600', marginTop: 1, fontFamily: 'Lexend_600SemiBold' },
  cancelled: { textDecorationLine: 'line-through', opacity: 0.5 },
  txRight: { alignItems: 'flex-end' },
  txAmount: { fontSize: 13, fontWeight: '600', fontFamily: 'Lexend_600SemiBold' },
  txPoints: { fontSize: 14, fontWeight: '700', marginTop: 2, fontFamily: 'Lexend_700Bold' },
  txNote: { fontSize: 12, marginTop: 2, fontStyle: 'italic', fontFamily: 'Lexend_400Regular' },

  // ── Adjust Buttons ──
  adjustButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  adjustBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    gap: 6,
  },
  adjustBtnText: { color: '#fff', fontSize: 14, fontWeight: '700', fontFamily: 'Lexend_700Bold' },

  // ── Modal ──
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: { fontSize: 20, fontWeight: '700', fontFamily: 'Lexend_700Bold' },
  modalLabel: { fontSize: 14, fontWeight: '600', marginBottom: 6, marginTop: 12, fontFamily: 'Lexend_600SemiBold' },
  modalInput: {
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    fontFamily: 'Lexend_500Medium',
  },
  modalInputMultiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  modalConfirmBtn: {
    marginTop: 24,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalConfirmText: { color: '#fff', fontSize: 16, fontWeight: '700', fontFamily: 'Lexend_700Bold' },
});
