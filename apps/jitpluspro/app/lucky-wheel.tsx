import React, { useState, useCallback, useReducer, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Modal,
  KeyboardAvoidingView,
  Platform,
  I18nManager,
} from 'react-native';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Play,
  Pause,
  StopCircle,
  Gift,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Ticket,
  Target,
  Package,
  AlertTriangle,
  X,
  Calendar,
  Percent,
  Clock,
  Info,
  Banknote,
  Edit3,
  Send,
} from 'lucide-react-native';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { ms } from '@/utils/responsive';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useAuth } from '@/contexts/AuthContext';
import { getErrorMessage } from '@/utils/error';
import {
  useLuckyWheelCampaigns,
  useCreateLuckyWheelCampaign,
  useUpdateLuckyWheelStatus,
  useUpdateLuckyWheelCampaign,
  useDeleteLuckyWheelCampaign,
  useLuckyWheelPendingPrizes,
  useLuckyWheelFulfilledPrizes,
  useFulfilLuckyWheelPrize,
  useSendPushNotification,
} from '@/hooks/useQueryHooks';

// ── Types ────────────────────────────────────────────────────

interface LuckyWheelPrizeData {
  id: string;
  label: string;
  description?: string | null;
  weight: number;
  totalStock: number;
  remaining: number;
  claimWindowHours?: number | null;
}

interface LuckyWheelCampaignData {
  id: string;
  name: string;
  description?: string | null;
  globalWinRate: number;
  startsAt: string;
  endsAt: string;
  minSpendAmount: number;
  status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ENDED';
  prizes: LuckyWheelPrizeData[];
  _count?: { tickets: number };
}

interface PendingDrawData {
  id: string;
  claimBefore?: string | null;
  prize?: { label: string; description?: string | null };
  ticket?: {
    clientId?: string;
    client?: { prenom: string; nom: string; telephone?: string };
    campaign?: { name: string };
  };
}

interface FulfilledDrawData {
  id: string;
  fulfilledAt: string;
  fulfilledBy?: string;
  fulfilledByName?: string | null;
  prize?: { label: string };
  ticket?: {
    client?: { prenom: string; nom: string };
    campaign?: { name: string };
  };
}

interface PrizeForm {
  id: string;
  dbId?: string; // real database ID for existing prizes
  label: string;
  description: string;
  weight: string;
  totalStock: string;
  claimWindowHours: string;
}

const emptyPrize = (): PrizeForm => ({
  id: `prize_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
  label: '',
  description: '',
  weight: '1',
  totalStock: '10',
  claimWindowHours: '72',
});

interface FormState {
  name: string;
  description: string;
  globalWinRate: string;
  startsAt: string;
  endsAt: string;
  minSpendAmount: string;
  prizes: PrizeForm[];
}

const today = () => new Date().toISOString().slice(0, 10);
const in30Days = () => new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

const initialForm: FormState = {
  name: '',
  description: '',
  globalWinRate: '50',
  startsAt: today(),
  endsAt: in30Days(),
  minSpendAmount: '0',
  prizes: [emptyPrize()],
};

type FormAction =
  | { type: 'SET_FIELD'; field: keyof FormState; value: string }
  | { type: 'SET_PRIZE_FIELD'; index: number; field: keyof PrizeForm; value: string }
  | { type: 'ADD_PRIZE' }
  | { type: 'REMOVE_PRIZE'; index: number }
  | { type: 'LOAD'; payload: FormState }
  | { type: 'RESET' };

function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case 'SET_FIELD':
      return { ...state, [action.field]: action.value };
    case 'SET_PRIZE_FIELD': {
      const prizes = [...state.prizes];
      prizes[action.index] = { ...prizes[action.index], [action.field]: action.value };
      return { ...state, prizes };
    }
    case 'ADD_PRIZE':
      return { ...state, prizes: [...state.prizes, emptyPrize()] };
    case 'REMOVE_PRIZE':
      return { ...state, prizes: state.prizes.filter((_, i) => i !== action.index) };
    case 'LOAD':
      return { ...action.payload };
    case 'RESET':
      return {
        name: '',
        description: '',
        globalWinRate: '50',
        startsAt: today(),
        endsAt: in30Days(),
        minSpendAmount: '0',
        prizes: [emptyPrize()],
      };
    default:
      return state;
  }
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: '#78716C',
  ACTIVE: '#16A34A',
  PAUSED: '#F59E0B',
  ENDED: '#EF4444',
};

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const isValidDateStr = (s: string) => DATE_REGEX.test(s) && !isNaN(new Date(s).getTime());

const formatDate = (d: string) => new Date(d).toLocaleDateString();

const TOTAL_STEPS = 3;

// Semantic tone colors (used for status badges & action buttons)
const TONE = {
  success: '#16A34A',
  warning: '#F59E0B',
  danger: '#EF4444',
} as const;
const TONE_BG = {
  success: `${TONE.success}18`,
  warning: `${TONE.warning}18`,
  danger: `${TONE.danger}18`,
} as const;

// Static preset values (no i18n) — kept at module scope to avoid recreating on every render.
const DURATION_DAYS = [7, 30, 90] as const;
const WIN_RATE_VALUES = ['25', '40', '50', '70'] as const;
const MIN_SPEND_VALUES = ['0', '50', '100', '200'] as const;

// ── Main Screen ──────────────────────────────────────────────

export default function LuckyWheelScreen() {
  useRequireAuth();
  const { isTeamMember } = useAuth();
  const theme = useTheme();
  const { t } = useLanguage();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { data: campaigns = [], isLoading, refetch, isRefetching } = useLuckyWheelCampaigns();
  const { data: pendingPrizes = [] } = useLuckyWheelPendingPrizes();
  const { data: fulfilledPrizes = [] } = useLuckyWheelFulfilledPrizes();
  const createMutation = useCreateLuckyWheelCampaign();
  const statusMutation = useUpdateLuckyWheelStatus();
  const updateMutation = useUpdateLuckyWheelCampaign();
  const deleteMutation = useDeleteLuckyWheelCampaign();
  const pushMutation = useSendPushNotification();
  const fulfilMutation = useFulfilLuckyWheelPrize();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<LuckyWheelCampaignData | null>(null);
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null);
  const [form, dispatch] = useReducer(formReducer, initialForm);
  const [step, setStep] = useState(0);
  const [campaignsExpanded, setCampaignsExpanded] = useState(true);
  const [pendingExpanded, setPendingExpanded] = useState(true);
  const [fulfilledExpanded, setFulfilledExpanded] = useState(false);
  const [fulfillingDrawId, setFulfillingDrawId] = useState<string | null>(null);
  const [fulfilledLimit, setFulfilledLimit] = useState(20);
  const [formSnapshot, setFormSnapshot] = useState('');

  const totalSteps = TOTAL_STEPS;

  // ── Step navigation helpers ──
  const canGoNext = useMemo(() => {
    if (step === 0) return form.name.trim().length > 0;
    if (step === 1) {
      const rate = parseInt(form.globalWinRate, 10);
      const dateValid = form.endsAt > form.startsAt && (editingCampaign ? true : form.startsAt >= today());
      return !isNaN(rate) && rate >= 1 && rate <= 100 && dateValid;
    }
    return true;
  }, [step, form, editingCampaign]);

  const goNext = useCallback(() => {
    if (step < totalSteps - 1 && canGoNext) setStep(s => s + 1);
  }, [step, canGoNext, totalSteps]);

  const goBack = useCallback(() => {
    if (step > 0) setStep(s => s - 1);
  }, [step]);

  const statusLabel = useCallback((status: string) => {
    const map: Record<string, string> = {
      DRAFT: t('luckyWheel.statusDraft'),
      ACTIVE: t('luckyWheel.statusActive'),
      PAUSED: t('luckyWheel.statusPaused'),
      ENDED: t('luckyWheel.statusEnded'),
    };
    return map[status] ?? status;
  }, [t]);

  const handleCreate = useCallback(async () => {
    if (!form.name.trim()) {
      Alert.alert(t('common.error'), t('luckyWheel.nameRequired'));
      return;
    }
    const start = new Date(form.startsAt);
    const end = new Date(form.endsAt);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
      Alert.alert(t('common.error'), t('luckyWheel.dateError'));
      return;
    }
    if (!editingCampaign && form.startsAt < today()) {
      Alert.alert(t('common.error'), t('luckyWheel.startDatePastError'));
      return;
    }
    const rate = parseInt(form.globalWinRate, 10);
    if (isNaN(rate) || rate < 1 || rate > 100) {
      Alert.alert(t('common.error'), t('luckyWheel.winRateError'));
      return;
    }
    if (form.prizes.length === 0 || form.prizes.some((p) => !p.label.trim())) {
      Alert.alert(t('common.error'), t('luckyWheel.prizeRequired'));
      return;
    }
    if (form.prizes.some((p) => parseInt(p.totalStock, 10) < 1)) {
      Alert.alert(t('common.error'), t('luckyWheel.stockRequired'));
      return;
    }

    // Edit mode — update campaign metadata + prizes
    if (editingCampaign) {
      try {
        await updateMutation.mutateAsync({
          id: editingCampaign.id,
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          globalWinRate: Math.min(100, Math.max(1, rate)) / 100,
          startsAt: start.toISOString(),
          endsAt: end.toISOString(),
          minSpendAmount: parseInt(form.minSpendAmount, 10) || 0,
          prizes: form.prizes.map((p) => ({
            ...(p.dbId ? { id: p.dbId } : {}),
            label: p.label.trim(),
            description: p.description.trim() || undefined,
            weight: Math.max(1, parseInt(p.weight, 10) || 1),
            totalStock: Math.max(1, parseInt(p.totalStock, 10) || 1),
            claimWindowHours: p.claimWindowHours ? parseInt(p.claimWindowHours, 10) || undefined : undefined,
          })),
        });
        Alert.alert('', t('luckyWheel.editSuccess'));
        setShowCreateModal(false);
        setEditingCampaign(null);
        dispatch({ type: 'RESET' });
        setStep(0);
      } catch (err) {
        Alert.alert(t('common.error'), getErrorMessage(err, t('luckyWheel.editError')));
      }
      return;
    }

    // Create mode
    try {
      await createMutation.mutateAsync({
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        globalWinRate: Math.min(100, Math.max(1, parseInt(form.globalWinRate, 10) || 50)) / 100,
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        minSpendAmount: parseInt(form.minSpendAmount, 10) || 0,
        prizes: form.prizes.map((p) => ({
          label: p.label.trim(),
          description: p.description.trim() || undefined,
          weight: Math.max(1, parseInt(p.weight, 10) || 1),
          totalStock: Math.max(1, parseInt(p.totalStock, 10) || 1),
          claimWindowHours: p.claimWindowHours ? parseInt(p.claimWindowHours, 10) || undefined : undefined,
        })),
      });
      Alert.alert('', t('luckyWheel.createSuccess'));
      setShowCreateModal(false);
      dispatch({ type: 'RESET' });
      setStep(0);
    } catch (err) {
      Alert.alert(t('common.error'), getErrorMessage(err, t('luckyWheel.createError')));
    }
  }, [form, editingCampaign, createMutation, updateMutation, t]);

  const handleStatusChange = useCallback((id: string, status: string) => {
    if (status === 'ENDED') {
      Alert.alert(t('luckyWheel.end'), t('luckyWheel.endConfirm'), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.confirm'),
          style: 'destructive',
          onPress: async () => {
            try {
              await statusMutation.mutateAsync({ id, status });
              Alert.alert('', t('luckyWheel.statusUpdateSuccess'));
            } catch (err) {
              Alert.alert(t('common.error'), getErrorMessage(err, t('luckyWheel.statusUpdateError')));
            }
          },
        },
      ]);
    } else {
      statusMutation.mutate({ id, status }, {
        onSuccess: () => Alert.alert('', t('luckyWheel.statusUpdateSuccess')),
        onError: (err) => Alert.alert(t('common.error'), getErrorMessage(err, t('luckyWheel.statusUpdateError'))),
      });
    }
  }, [statusMutation, t]);

  const handleFulfil = useCallback((drawId: string, prizeLabel: string) => {
    Alert.alert(t('luckyWheel.fulfilBtn'), t('luckyWheel.fulfilConfirm', { prize: prizeLabel }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.confirm'),
        onPress: async () => {
          setFulfillingDrawId(drawId);
          try {
            await fulfilMutation.mutateAsync(drawId);
            Alert.alert('', t('luckyWheel.fulfilSuccess'));
          } catch (err) {
            Alert.alert(t('common.error'), getErrorMessage(err, t('luckyWheel.fulfilError')));
          } finally {
            setFulfillingDrawId(null);
          }
        },
      },
    ]);
  }, [fulfilMutation, t]);

  const handleEdit = useCallback((campaign: LuckyWheelCampaignData) => {
    setEditingCampaign(campaign);
    const existingPrizes: PrizeForm[] = (campaign.prizes ?? []).map((p: LuckyWheelPrizeData) => ({
      id: `prize_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      dbId: p.id,
      label: p.label || '',
      description: p.description || '',
      weight: String(p.weight ?? 1),
      totalStock: String(p.totalStock ?? 1),
      claimWindowHours: p.claimWindowHours ? String(p.claimWindowHours) : '',
    }));
    const loadedPayload: FormState = {
        name: campaign.name,
        description: campaign.description || '',
        globalWinRate: String(Math.round(campaign.globalWinRate * 100)),
        startsAt: new Date(campaign.startsAt).toISOString().slice(0, 10),
        endsAt: new Date(campaign.endsAt).toISOString().slice(0, 10),
        minSpendAmount: String(campaign.minSpendAmount ?? 0),
        prizes: existingPrizes.length > 0 ? existingPrizes : [emptyPrize()],
      };
    dispatch({ type: 'LOAD', payload: loadedPayload });
    setFormSnapshot(JSON.stringify(loadedPayload));
    setStep(0);
    setShowCreateModal(true);
  }, []);

  const handleDelete = useCallback((campaign: LuckyWheelCampaignData) => {
    if (campaign.status === 'ACTIVE') {
      Alert.alert(t('common.error'), t('luckyWheel.deleteActiveError'));
      return;
    }
    Alert.alert(t('luckyWheel.deleteBtn'), t('luckyWheel.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('luckyWheel.deleteBtn'),
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteMutation.mutateAsync(campaign.id);
            Alert.alert('', t('luckyWheel.deleteSuccess'));
          } catch (err) {
            Alert.alert(t('common.error'), getErrorMessage(err, t('luckyWheel.deleteError')));
          }
        },
      },
    ]);
  }, [deleteMutation, t]);

  const handlePush = useCallback((campaign: LuckyWheelCampaignData) => {
    const prizeNames = (campaign.prizes ?? []).map((p: LuckyWheelPrizeData) => p.label).join(', ');
    const startStr = formatDate(campaign.startsAt);
    const endStr = formatDate(campaign.endsAt);
    const conditions = campaign.minSpendAmount > 0
      ? t('luckyWheel.pushConditionMinSpend', { amount: String(campaign.minSpendAmount) })
      : '';

    const title = t('luckyWheel.pushTitle', { name: campaign.name });
    const body = t('luckyWheel.pushBody', { prizes: prizeNames, start: startStr, end: endStr, conditions });

    Alert.alert(t('luckyWheel.pushPreviewTitle'), `${title}\n\n${body}`, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('luckyWheel.pushBtn'),
        onPress: async () => {
          try {
            const result = await pushMutation.mutateAsync({ title, body });
            Alert.alert('', t('luckyWheel.pushSuccess', { count: String(result.successCount) }));
          } catch (err) {
            Alert.alert(t('common.error'), getErrorMessage(err, t('luckyWheel.pushError')));
          }
        },
      },
    ]);
  }, [pushMutation, t]);

  const openCreateModal = useCallback(() => {
    dispatch({ type: 'RESET' });
    setStep(0);
    setFormSnapshot(JSON.stringify(initialForm));
    setShowCreateModal(true);
  }, []);

  const formIsDirty = useMemo(() => {
    if (!formSnapshot) return false;
    return JSON.stringify(form) !== formSnapshot;
  }, [form, formSnapshot]);

  const closeCreateModal = useCallback(() => {
    // Prevent dismissing modal while a create/update mutation is in flight to avoid state inconsistency.
    if (createMutation.isPending || updateMutation.isPending) return;
    if (formIsDirty) {
      Alert.alert(t('luckyWheel.discardTitle'), t('luckyWheel.discardMessage'), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('luckyWheel.discardConfirm'),
          style: 'destructive',
          onPress: () => {
            setShowCreateModal(false);
            setEditingCampaign(null);
            dispatch({ type: 'RESET' });
            setStep(0);
          },
        },
      ]);
    } else {
      setShowCreateModal(false);
      setEditingCampaign(null);
      dispatch({ type: 'RESET' });
      setStep(0);
    }
  }, [formIsDirty, t, createMutation.isPending, updateMutation.isPending]);

  const durationDays = useMemo(() => {
    const diff = new Date(form.endsAt).getTime() - new Date(form.startsAt).getTime();
    return Math.max(0, Math.round(diff / 86400000));
  }, [form.startsAt, form.endsAt]);

  // total prize weight for probability display
  const totalWeight = useMemo(() =>
    form.prizes.reduce((sum, p) => sum + (parseInt(p.weight, 10) || 1), 0),
    [form.prizes],
  );

  const setDuration = useCallback((days: number) => {
    const startDate = editingCampaign ? form.startsAt : today();
    const startMs = new Date(startDate).getTime();
    if (!editingCampaign) {
      dispatch({ type: 'SET_FIELD', field: 'startsAt', value: startDate });
    }
    dispatch({ type: 'SET_FIELD', field: 'endsAt', value: new Date(startMs + days * 86400000).toISOString().slice(0, 10) });
  }, [editingCampaign, form.startsAt]);

  // ── Render ─────────────────────────────────────────────────

  if (isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.bg }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* ── Header ── */}
      <View style={[styles.headerBar, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <ArrowLeft
            size={22}
            color={theme.text}
            style={I18nManager.isRTL ? { transform: [{ scaleX: -1 }] } : undefined}
          />
        </TouchableOpacity>
        <Text
          style={[styles.headerTitle, { color: theme.text }]}
          numberOfLines={1}
          maxFontSizeMultiplier={1.3}
          accessibilityRole="header"
        >
          {t('luckyWheel.title')}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.primary} />}
      >
        {/* ── Guide text ── */}
        <View style={[styles.guideContainer, { backgroundColor: theme.primaryBg || (theme.primary + '10'), borderLeftColor: theme.primary }]}>
          <Text style={[styles.guideText, { color: theme.textSecondary }]}>
            {t('luckyWheel.subtitle')}
          </Text>
        </View>

        {/* ── Create Button (owner only) ── */}
        {!isTeamMember && (
          <TouchableOpacity
            onPress={openCreateModal}
            style={[styles.createBtn, { backgroundColor: theme.primary }]}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={t('luckyWheel.createBtn')}
          >
            <Plus size={18} color="#FFF" strokeWidth={2} />
            <Text style={styles.createBtnText} maxFontSizeMultiplier={1.3}>{t('luckyWheel.createBtn')}</Text>
          </TouchableOpacity>
        )}

        {/* ── Section: Pending Prizes ── */}
        {pendingPrizes.length > 0 && (
          <>
            <TouchableOpacity
              style={styles.sectionHeader}
              onPress={() => setPendingExpanded(v => !v)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t('luckyWheel.pendingTitle')}
              accessibilityState={{ expanded: pendingExpanded }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <View style={styles.sectionHeaderContent}>
                <View style={styles.sectionHeaderIconWarning}>
                  <AlertTriangle size={ms(16)} color="#F59E0B" strokeWidth={2} />
                </View>
                <Text style={[styles.sectionTitle, { color: theme.text }]} maxFontSizeMultiplier={1.3} accessibilityRole="header">
                  {t('luckyWheel.pendingTitle')} ({pendingPrizes.length})
                </Text>
              </View>
              {pendingExpanded
                ? <ChevronUp size={20} color={theme.textMuted} />
                : <ChevronDown size={20} color={theme.textMuted} />}
            </TouchableOpacity>

            {pendingExpanded && (
              <View style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}>
                {pendingPrizes.map((draw: PendingDrawData) => (
                  <View key={draw.id} style={styles.pendingRow}>
                    <View style={styles.flexOne}>
                      <Text style={[styles.pendingPrize, { color: theme.text }]} maxFontSizeMultiplier={1.3}>{draw.prize?.label}</Text>
                      <Text style={[styles.pendingClient, { color: theme.textMuted }]} maxFontSizeMultiplier={1.3}>
                        {draw.ticket?.client?.prenom} {draw.ticket?.client?.nom}
                      </Text>
                      {draw.claimBefore && (
                        <Text style={[styles.pendingExpiry, { color: TONE.warning }]} maxFontSizeMultiplier={1.4}>
                          {t('luckyWheel.claimExpires', { date: formatDate(draw.claimBefore) })}
                        </Text>
                      )}
                    </View>
                    <TouchableOpacity
                      onPress={() => handleFulfil(draw.id, draw.prize?.label ?? '')}
                      style={[styles.fulfilBtn, { backgroundColor: theme.primary + '10' }]}
                      activeOpacity={0.7}
                      disabled={fulfillingDrawId === draw.id}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityRole="button"
                      accessibilityLabel={t('luckyWheel.fulfilBtn')}
                      accessibilityState={{ disabled: fulfillingDrawId === draw.id, busy: fulfillingDrawId === draw.id }}
                    >
                      {fulfillingDrawId === draw.id ? (
                        <ActivityIndicator size="small" color={theme.primary} />
                      ) : (
                        <Check size={16} color={TONE.success} strokeWidth={2} />
                      )}
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </>
        )}

        {/* ── Section: Fulfilled Prizes ── */}
        {fulfilledPrizes.length > 0 && (
          <>
            <TouchableOpacity
              style={styles.sectionHeader}
              onPress={() => setFulfilledExpanded(v => !v)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t('luckyWheel.fulfilledTitle')}
              accessibilityState={{ expanded: fulfilledExpanded }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <View style={styles.sectionHeaderContent}>
                <View style={styles.sectionHeaderIconSuccess}>
                  <CheckCircle size={ms(16)} color="#16A34A" strokeWidth={2} />
                </View>
                <Text style={[styles.sectionTitle, { color: theme.text }]} maxFontSizeMultiplier={1.3} accessibilityRole="header">
                  {t('luckyWheel.fulfilledTitle')} ({fulfilledPrizes.length})
                </Text>
              </View>
              {fulfilledExpanded
                ? <ChevronUp size={20} color={theme.textMuted} />
                : <ChevronDown size={20} color={theme.textMuted} />}
            </TouchableOpacity>

            {fulfilledExpanded && (
              <View style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}>
                {fulfilledPrizes.slice(0, fulfilledLimit).map((draw: FulfilledDrawData) => (
                  <View key={draw.id} style={styles.pendingRow}>
                    <View style={styles.flexOne}>
                      <Text style={[styles.pendingPrize, { color: theme.text }]} maxFontSizeMultiplier={1.3}>{draw.prize?.label}</Text>
                      <Text style={[styles.pendingClient, { color: theme.textMuted }]} maxFontSizeMultiplier={1.3}>
                        {draw.ticket?.client?.prenom} {draw.ticket?.client?.nom}
                      </Text>
                      <Text style={[styles.pendingExpiry, { color: theme.textMuted }]} maxFontSizeMultiplier={1.4}>
                        {draw.fulfilledByName
                          ? t('luckyWheel.fulfilledByMember', { name: draw.fulfilledByName })
                          : t('luckyWheel.fulfilledByOwner')}
                        {' · '}
                        {formatDate(draw.fulfilledAt)}
                      </Text>
                    </View>
                  </View>
                ))}
                {fulfilledPrizes.length > fulfilledLimit && (
                  <TouchableOpacity
                    onPress={() => setFulfilledLimit(l => l + 20)}
                    style={styles.showMoreBtn}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={t('luckyWheel.fulfilledShowMore')}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={[styles.showMoreText, { color: theme.primary }]} maxFontSizeMultiplier={1.3}>
                      {t('luckyWheel.fulfilledShowMore')} ({fulfilledPrizes.length - fulfilledLimit})
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </>
        )}

        {/* ── Section: Campaigns ── */}
        <TouchableOpacity
          style={styles.sectionHeader}
          onPress={() => setCampaignsExpanded(v => !v)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t('luckyWheel.campaignsSection')}
          accessibilityState={{ expanded: campaignsExpanded }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <View style={styles.sectionHeaderContent}>
            <View style={styles.sectionHeaderIcon}>
              <Gift size={ms(16)} color={palette.violet} strokeWidth={2} />
            </View>
            <Text style={[styles.sectionTitle, { color: theme.text }]} maxFontSizeMultiplier={1.3} accessibilityRole="header">
              {t('luckyWheel.campaignsSection')} ({campaigns.length})
            </Text>
          </View>
          {campaignsExpanded
            ? <ChevronUp size={20} color={theme.textMuted} />
            : <ChevronDown size={20} color={theme.textMuted} />}
        </TouchableOpacity>

        {campaignsExpanded && (
          <>
            {campaigns.length === 0 && (
              <View style={styles.emptyState}>
                <View style={styles.emptyIconWrap}>
                  <Gift size={ms(36)} color={palette.violet} strokeWidth={1.5} />
                </View>
                <Text style={[styles.emptyTitle, { color: theme.text }]} maxFontSizeMultiplier={1.3}>{t('luckyWheel.noCampaigns')}</Text>
                <Text style={[styles.emptyHint, { color: theme.textMuted }]} maxFontSizeMultiplier={1.4}>{t('luckyWheel.noCampaignsHint')}</Text>
              </View>
            )}

            {campaigns.map((campaign: LuckyWheelCampaignData) => {
              const isExpanded = expandedCampaign === campaign.id;
              const canActivate = campaign.status === 'DRAFT' || campaign.status === 'PAUSED';
              const canPause = campaign.status === 'ACTIVE';
              const canEnd = campaign.status !== 'ENDED';

              return (
                <View key={campaign.id} style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}>
                  <TouchableOpacity
                    onPress={() => setExpandedCampaign(isExpanded ? null : campaign.id)}
                    activeOpacity={0.7}
                    style={styles.campaignHeader}
                  >
                    <View style={styles.flexOne}>
                      <Text style={[styles.campaignName, { color: theme.text }]}>{campaign.name}</Text>
                      <Text style={[styles.campaignDates, { color: theme.textMuted }]}>
                        {formatDate(campaign.startsAt)} — {formatDate(campaign.endsAt)}
                      </Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: `${STATUS_COLORS[campaign.status] ?? '#78716C'}18` }]}>
                      <Text style={[styles.statusText, { color: STATUS_COLORS[campaign.status] ?? '#78716C' }]}>
                        {statusLabel(campaign.status)}
                      </Text>
                    </View>
                    {isExpanded
                      ? <ChevronUp size={16} color={theme.textMuted} style={{ marginLeft: 8 }} />
                      : <ChevronDown size={16} color={theme.textMuted} style={{ marginLeft: 8 }} />}
                  </TouchableOpacity>

                  {isExpanded && (
                    <View style={styles.campaignBody}>
                      {campaign.description ? (
                        <Text style={[styles.campaignDesc, { color: theme.textMuted }]}>{campaign.description}</Text>
                      ) : null}

                      <View style={styles.statsRow}>
                        <View style={[styles.statPill, { backgroundColor: theme.primary + '08' }]}>
                          <Target size={12} color={theme.primary} />
                          <View style={styles.statPillContent}>
                            <Text style={[styles.statValue, { color: theme.text }]}>{Math.round(campaign.globalWinRate * 100)}%</Text>
                            <Text style={[styles.statLabel, { color: theme.textMuted }]}>{t('luckyWheel.winRateLabel')}</Text>
                          </View>
                        </View>
                        <View style={[styles.statPill, { backgroundColor: theme.primary + '08' }]}>
                          <Ticket size={12} color={theme.primary} />
                          <View style={styles.statPillContent}>
                            <Text style={[styles.statValue, { color: theme.text }]}>{campaign._count?.tickets ?? 0}</Text>
                            <Text style={[styles.statLabel, { color: theme.textMuted }]}>{t('luckyWheel.ticketsUsed')}</Text>
                          </View>
                        </View>
                      </View>

                      <Text style={[styles.prizesSectionTitle, { color: theme.text }]}>{t('luckyWheel.prizesTitle')}</Text>
                      {campaign.prizes?.map((prize: LuckyWheelPrizeData) => (
                        <View key={prize.id} style={[styles.prizeRow, { borderColor: theme.borderLight }]}>
                          <Package size={ms(16)} color={palette.charbon} strokeWidth={1.5} />
                          <View style={styles.prizeItemContent}>
                            <Text style={[styles.prizeName, { color: theme.text }]}>{prize.label}</Text>
                            <Text style={[styles.prizeStock, { color: theme.textMuted }]}>
                              {t('luckyWheel.prizeRemaining', { remaining: prize.remaining, total: prize.totalStock })}
                            </Text>
                          </View>
                        </View>
                      ))}

                      {!isTeamMember && (
                      <View style={styles.actionRow}>
                        {canActivate && (
                          <TouchableOpacity
                            onPress={() => handleStatusChange(campaign.id, 'ACTIVE')}
                            style={[styles.actionBtn, { backgroundColor: TONE_BG.success }]}
                            activeOpacity={0.7}
                            disabled={statusMutation.isPending}
                            accessibilityRole="button"
                            accessibilityLabel={t('luckyWheel.activate')}
                            accessibilityState={{ disabled: statusMutation.isPending, busy: statusMutation.isPending }}
                          >
                            <Play size={14} color={TONE.success} strokeWidth={2} />
                            <Text style={[styles.actionText, { color: TONE.success }]} maxFontSizeMultiplier={1.3}>{t('luckyWheel.activate')}</Text>
                          </TouchableOpacity>
                        )}
                        {canPause && (
                          <TouchableOpacity
                            onPress={() => handleStatusChange(campaign.id, 'PAUSED')}
                            style={[styles.actionBtn, { backgroundColor: TONE_BG.warning }]}
                            activeOpacity={0.7}
                            disabled={statusMutation.isPending}
                            accessibilityRole="button"
                            accessibilityLabel={t('luckyWheel.pause')}
                            accessibilityState={{ disabled: statusMutation.isPending, busy: statusMutation.isPending }}
                          >
                            <Pause size={14} color={TONE.warning} strokeWidth={2} />
                            <Text style={[styles.actionText, { color: TONE.warning }]} maxFontSizeMultiplier={1.3}>{t('luckyWheel.pause')}</Text>
                          </TouchableOpacity>
                        )}
                        {canEnd && (
                          <TouchableOpacity
                            onPress={() => handleStatusChange(campaign.id, 'ENDED')}
                            style={[styles.actionBtn, { backgroundColor: TONE_BG.danger }]}
                            activeOpacity={0.7}
                            disabled={statusMutation.isPending}
                            accessibilityRole="button"
                            accessibilityLabel={t('luckyWheel.end')}
                            accessibilityState={{ disabled: statusMutation.isPending, busy: statusMutation.isPending }}
                          >
                            <StopCircle size={14} color={TONE.danger} strokeWidth={2} />
                            <Text style={[styles.actionText, { color: TONE.danger }]} maxFontSizeMultiplier={1.3}>{t('luckyWheel.end')}</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                      )}

                      {!isTeamMember && (
                      <View style={[styles.actionRow, { marginTop: 6 }]}>
                        {campaign.status === 'ACTIVE' && (
                          <TouchableOpacity
                            onPress={() => handlePush(campaign)}
                            style={[styles.actionBtn, { backgroundColor: theme.primary + '18' }]}
                            activeOpacity={0.7}
                            disabled={pushMutation.isPending}
                            accessibilityRole="button"
                            accessibilityLabel={t('luckyWheel.pushBtn')}
                            accessibilityState={{ disabled: pushMutation.isPending, busy: pushMutation.isPending }}
                          >
                            {pushMutation.isPending ? (
                              <ActivityIndicator size="small" color={theme.primary} />
                            ) : (
                              <Send size={14} color={theme.primary} strokeWidth={2} />
                            )}
                            <Text style={[styles.actionText, { color: theme.primary }]} maxFontSizeMultiplier={1.3}>{t('luckyWheel.pushBtn')}</Text>
                          </TouchableOpacity>
                        )}
                        {campaign.status !== 'ENDED' && (
                          <TouchableOpacity
                            onPress={() => handleEdit(campaign)}
                            style={[styles.actionBtn, { backgroundColor: theme.primary + '18' }]}
                            activeOpacity={0.7}
                            accessibilityRole="button"
                            accessibilityLabel={t('luckyWheel.editBtn')}
                          >
                            <Edit3 size={14} color={theme.primary} strokeWidth={2} />
                            <Text style={[styles.actionText, { color: theme.primary }]} maxFontSizeMultiplier={1.3}>{t('luckyWheel.editBtn')}</Text>
                          </TouchableOpacity>
                        )}
                        {campaign.status !== 'ACTIVE' && (
                          <TouchableOpacity
                            onPress={() => handleDelete(campaign)}
                            style={[styles.actionBtn, { backgroundColor: TONE_BG.danger }]}
                            activeOpacity={0.7}
                            disabled={deleteMutation.isPending}
                            accessibilityRole="button"
                            accessibilityLabel={t('luckyWheel.deleteBtn')}
                            accessibilityState={{ disabled: deleteMutation.isPending, busy: deleteMutation.isPending }}
                          >
                            {deleteMutation.isPending ? (
                              <ActivityIndicator size="small" color={TONE.danger} />
                            ) : (
                              <Trash2 size={14} color={TONE.danger} strokeWidth={2} />
                            )}
                            <Text style={[styles.actionText, { color: TONE.danger }]} maxFontSizeMultiplier={1.3}>{t('luckyWheel.deleteBtn')}</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
          </>
        )}
      </ScrollView>

      {/* ══════════════════════════════════════════════════════════
          ── Create Modal — 3-Step Wizard (like stores)
          ══════════════════════════════════════════════════════════ */}
      <Modal visible={showCreateModal} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
          style={{ flex: 1 }}
        >
          <View style={[styles.modalOverlay]}>
            <View style={[styles.modalContent, { backgroundColor: theme.bg, paddingTop: Math.max(insets.top, 16) }]}>

              {/* ── Modal Header with step indicator ── */}
              <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
                <TouchableOpacity
                  onPress={() => { if (step > 0) goBack(); else closeCreateModal(); }}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityRole="button"
                  accessibilityLabel={step > 0 ? t('common.back') : t('common.close')}
                >
                  {step > 0
                    ? <ArrowLeft
                        size={22}
                        color={theme.text}
                        style={I18nManager.isRTL ? { transform: [{ scaleX: -1 }] } : undefined}
                      />
                    : <X size={22} color={theme.text} />}
                </TouchableOpacity>
                <View style={styles.stepHeaderCenter}>
                  <Text style={[styles.modalTitle, { color: theme.text }]}>{editingCampaign ? t('luckyWheel.editTitle') : t('luckyWheel.createBtn')}</Text>
                  <Text style={[styles.stepLabel, { color: theme.textMuted }]}>
                    {t('luckyWheel.wizStepOf', { current: step + 1, total: totalSteps })}
                  </Text>
                </View>
                <View style={{ width: 22 }} />
              </View>

              {/* ── Progress Bar ── */}
              <View style={[styles.progressTrack, { backgroundColor: theme.border }]}>
                <View style={[styles.progressFill, { width: `${((step + 1) / totalSteps) * 100}%`, backgroundColor: theme.primary }]} />
              </View>

              {/* ── Step Icon + Title + Description ── */}
              <View style={styles.stepTitleRow}>
                <View style={[styles.stepIconCircle, { backgroundColor: theme.primary + '14' }]}>
                  {step === 0 && <Gift size={18} color={theme.primary} strokeWidth={1.5} />}
                  {step === 1 && <Target size={18} color={theme.primary} strokeWidth={1.5} />}
                  {step === 2 && <Package size={18} color={theme.primary} strokeWidth={1.5} />}
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={[styles.stepTitleText, { color: theme.text }]}>
                    {step === 0 ? t('luckyWheel.wizStep1Title') : step === 1 ? t('luckyWheel.wizStep2Title') : t('luckyWheel.wizStep3Title')}
                  </Text>
                  <Text style={[styles.stepDesc, { color: theme.textMuted }]}>
                    {step === 0 ? t('luckyWheel.wizStep1Desc') : step === 1 ? t('luckyWheel.wizStep2Desc') : t('luckyWheel.wizStep3Desc')}
                  </Text>
                </View>
              </View>

              {/* ── Form Content ── */}
              <ScrollView
                contentContainerStyle={styles.formContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {/* ═══════════════════════════════════════════
                    STEP 1: Informations de base
                    ═══════════════════════════════════════════ */}
                {step === 0 && (
                  <>
                    {/* Name */}
                    <Text style={[styles.fieldLabel, { color: theme.text }]}>
                      {t('luckyWheel.nameLabel')} <Text style={{ color: theme.primary }}>*</Text>
                    </Text>
                    <Text style={[styles.fieldHint, { color: theme.textMuted }]}>
                      {t('luckyWheel.nameHint')}
                    </Text>
                    <View style={[styles.inputWrapper, { backgroundColor: theme.bgInput, borderColor: form.name.trim() ? theme.primary : theme.border }]}>
                      <Gift size={18} color={form.name.trim() ? theme.primary : theme.textMuted} strokeWidth={1.5} />
                      <TextInput
                        style={[styles.wizInput, { color: theme.text }]}
                        value={form.name}
                        onChangeText={(v) => dispatch({ type: 'SET_FIELD', field: 'name', value: v })}
                        placeholder={t('luckyWheel.namePlaceholder')}
                        placeholderTextColor={theme.textMuted}
                        maxLength={255}
                        autoFocus
                      />
                      {form.name.trim().length > 0 && <Check size={16} color={theme.primary} strokeWidth={2.5} />}
                    </View>
                    <Text style={[styles.fieldExamples, { color: theme.textMuted }]}>
                      {t('luckyWheel.nameExamples')}
                    </Text>

                    {/* Description */}
                    <Text style={[styles.fieldLabel, { color: theme.text, marginTop: 20 }]}>
                      {t('luckyWheel.descLabel')}
                    </Text>
                    <Text style={[styles.fieldHint, { color: theme.textMuted }]}>
                      {t('luckyWheel.descHint')}
                    </Text>
                    <View style={[styles.inputWrapper, styles.inputMultiWrap, { backgroundColor: theme.bgInput, borderColor: theme.border }]}>
                      <TextInput
                        style={[styles.wizInput, styles.wizInputMulti, { color: theme.text }]}
                        value={form.description}
                        onChangeText={(v) => dispatch({ type: 'SET_FIELD', field: 'description', value: v })}
                        placeholder={t('luckyWheel.descPlaceholder')}
                        placeholderTextColor={theme.textMuted}
                        multiline
                        maxLength={2000}
                      />
                    </View>
                    <Text style={[styles.fieldExamples, { color: theme.textMuted }]}>
                      {t('luckyWheel.descExamples')}
                    </Text>

                    {/* Tip */}
                    <View style={[styles.tipBox, { backgroundColor: theme.primary + '08' }]}>
                      <Info size={14} color={theme.primary} strokeWidth={1.5} />
                      <Text style={[styles.tipText, { color: theme.textSecondary }]}>
                        {t('luckyWheel.wizStep1Tip')}
                      </Text>
                    </View>
                  </>
                )}

                {/* ═══════════════════════════════════════════
                    STEP 2: Règle du jeu
                    ═══════════════════════════════════════════ */}
                {step === 1 && (
                  <>
                    {/* Win Rate */}
                    <Text style={[styles.fieldLabel, { color: theme.text }]}>
                      {t('luckyWheel.winRateLabel')}
                    </Text>
                    <Text style={[styles.fieldHint, { color: theme.textMuted }]}>
                      {t('luckyWheel.wizWinRateExplain')}
                    </Text>
                    <View style={[styles.tipBox, { backgroundColor: theme.primary + '08', marginBottom: 12 }]}>
                      <Info size={14} color={theme.primary} strokeWidth={1.5} />
                      <Text style={[styles.tipText, { color: theme.textSecondary }]}>
                        {t('luckyWheel.wizWinRateTip')}
                      </Text>
                    </View>

                    {/* Win rate visual preview */}
                    <View style={[styles.previewCard, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}>
                      <View style={styles.previewRow}>
                        <View style={[styles.previewCircle, { backgroundColor: theme.primary + '18' }]}>
                          <Percent size={16} color={theme.primary} strokeWidth={2} />
                        </View>
                        <View style={{ flex: 1, marginLeft: 12 }}>
                          <Text style={[styles.previewTitle, { color: theme.text }]}>
                            {t('luckyWheel.wizWinPreview', { pct: String(Math.min(100, parseInt(form.globalWinRate, 10) || 0)) })}
                          </Text>
                          <Text style={[styles.previewSubtitle, { color: theme.textMuted }]}>
                            {t('luckyWheel.wizWinPreviewDetail', { winners: String(Math.min(100, parseInt(form.globalWinRate, 10) || 0)), losers: String(100 - Math.min(100, parseInt(form.globalWinRate, 10) || 0)) })}
                          </Text>
                        </View>
                      </View>

                      {/* Visual bar */}
                      <View style={styles.winBarContainer}>
                        <View style={[styles.winBarFill, { width: `${Math.min(100, parseInt(form.globalWinRate, 10) || 0)}%`, backgroundColor: theme.primary }]} />
                      </View>
                    </View>

                    {/* Win Rate Selector */}
                    <View style={styles.chipRow}>
                      {[
                        { val: '25', label: '25%', desc: t('luckyWheel.wizRate25') },
                        { val: '40', label: '40%', desc: t('luckyWheel.wizRate40') },
                        { val: '50', label: '50%', desc: t('luckyWheel.wizRate50') },
                        { val: '70', label: '70%', desc: t('luckyWheel.wizRate70') },
                      ].map(({ val, label, desc }) => {
                        const selected = form.globalWinRate === val;
                        return (
                          <TouchableOpacity
                            key={val}
                            onPress={() => dispatch({ type: 'SET_FIELD', field: 'globalWinRate', value: val })}
                            activeOpacity={0.7}
                            style={[
                              styles.rateChip,
                              { borderColor: selected ? theme.primary : theme.borderLight,
                                backgroundColor: selected ? theme.primary + '10' : theme.bgCard },
                            ]}
                          >
                            <Text style={[styles.rateChipValue, { color: selected ? theme.primary : theme.text }]}>{label}</Text>
                            <Text style={[styles.rateChipDesc, { color: selected ? theme.primary : theme.textMuted }]}>{desc}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {/* Custom rate input */}
                    <View style={styles.customRateRow}>
                      <Text style={[styles.customRateLabel, { color: theme.textMuted }]}>{t('luckyWheel.wizCustomRate')}</Text>
                      <View style={[styles.customRateInput, { backgroundColor: theme.bgInput, borderColor: theme.border }]}>
                        <TextInput
                          style={[styles.customRateText, { color: theme.text }]}
                          value={form.globalWinRate}
                          onChangeText={(v) => dispatch({ type: 'SET_FIELD', field: 'globalWinRate', value: v.replace(/[^0-9]/g, '') })}
                          keyboardType="number-pad"
                          maxLength={3}
                        />
                        <Text style={[styles.customRatePct, { color: theme.textMuted }]}>%</Text>
                      </View>
                    </View>

                    {/* Divider */}
                    <View style={[styles.divider, { backgroundColor: theme.borderLight }]} />

                    {/* Duration */}
                    <Text style={[styles.fieldLabel, { color: theme.text }]}>
                      {t('luckyWheel.durationLabel')}
                    </Text>
                    <Text style={[styles.fieldHint, { color: theme.textMuted }]}>
                      {t('luckyWheel.wizDurationExplain')}
                    </Text>
                    <View style={[styles.tipBox, { backgroundColor: theme.primary + '08', marginBottom: 12 }]}>
                      <Info size={14} color={theme.primary} strokeWidth={1.5} />
                      <Text style={[styles.tipText, { color: theme.textSecondary }]}>
                        {t('luckyWheel.wizDurationTip')}
                      </Text>
                    </View>

                    <View style={styles.durationChipRow}>
                      {[
                        { label: t('luckyWheel.dur7'), days: 7 },
                        { label: t('luckyWheel.dur30'), days: 30 },
                        { label: t('luckyWheel.dur90'), days: 90 },
                      ].map(({ label, days }) => {
                        const isActive = durationDays === days;
                        return (
                          <TouchableOpacity
                            key={days}
                            onPress={() => setDuration(days)}
                            activeOpacity={0.7}
                            style={[
                              styles.durChip,
                              { borderColor: isActive ? theme.primary : theme.borderLight,
                                backgroundColor: isActive ? theme.primary : theme.bgCard },
                            ]}
                          >
                            <Calendar size={14} color={isActive ? '#fff' : theme.textMuted} strokeWidth={1.5} />
                            <Text style={[styles.durChipText, { color: isActive ? '#fff' : theme.text }]}>{label}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {/* Custom dates */}
                    <View style={styles.dateRow}>
                      <View style={styles.dateCol}>
                        <Text style={[styles.miniLabel, { color: theme.textMuted }]}>{t('luckyWheel.startDateLabel')}</Text>
                        <View style={[styles.inputWrapper, { backgroundColor: theme.bgInput, borderColor: isValidDateStr(form.startsAt) ? theme.primary : (form.startsAt.length >= 10 ? '#EF4444' : theme.border) }]}>
                          <Calendar size={16} color={theme.textMuted} strokeWidth={1.5} />
                          <TextInput
                            style={[styles.wizInput, { color: theme.text }]}
                            value={form.startsAt}
                            onChangeText={(v) => dispatch({ type: 'SET_FIELD', field: 'startsAt', value: v })}
                            placeholder="YYYY-MM-DD"
                            placeholderTextColor={theme.textMuted}
                            maxLength={10}
                          />
                        </View>
                        {form.startsAt.length >= 10 && !isValidDateStr(form.startsAt) && (
                          <Text style={styles.dateError}>{t('luckyWheel.dateFormatError')}</Text>
                        )}
                      </View>
                      <View style={styles.dateSpacer} />
                      <View style={styles.dateCol}>
                        <Text style={[styles.miniLabel, { color: theme.textMuted }]}>{t('luckyWheel.endDateLabel')}</Text>
                        <View style={[styles.inputWrapper, { backgroundColor: theme.bgInput, borderColor: isValidDateStr(form.endsAt) ? theme.primary : (form.endsAt.length >= 10 ? '#EF4444' : theme.border) }]}>
                          <Calendar size={16} color={theme.textMuted} strokeWidth={1.5} />
                          <TextInput
                            style={[styles.wizInput, { color: theme.text }]}
                            value={form.endsAt}
                            onChangeText={(v) => dispatch({ type: 'SET_FIELD', field: 'endsAt', value: v })}
                            placeholder="YYYY-MM-DD"
                            placeholderTextColor={theme.textMuted}
                            maxLength={10}
                          />
                        </View>
                        {form.endsAt.length >= 10 && !isValidDateStr(form.endsAt) && (
                          <Text style={styles.dateError}>{t('luckyWheel.dateFormatError')}</Text>
                        )}
                      </View>
                    </View>

                    {/* Divider */}
                    <View style={[styles.divider, { backgroundColor: theme.borderLight }]} />

                    {/* Minimum Spend Amount */}
                    <Text style={[styles.fieldLabel, { color: theme.text }]}>
                      {t('luckyWheel.minSpendLabel')}
                    </Text>
                    <Text style={[styles.fieldHint, { color: theme.textMuted }]}>
                      {t('luckyWheel.minSpendExplain')}
                    </Text>
                    <View style={[styles.tipBox, { backgroundColor: theme.primary + '08', marginBottom: 12 }]}>
                      <Info size={14} color={theme.primary} strokeWidth={1.5} />
                      <Text style={[styles.tipText, { color: theme.textSecondary }]}>
                        {t('luckyWheel.minSpendTip')}
                      </Text>
                    </View>

                    {/* Min spend presets */}
                    <View style={styles.durationChipRow}>
                      {[
                        { label: t('luckyWheel.minSpendNone'), val: '0' },
                        { label: '50 MAD', val: '50' },
                        { label: '100 MAD', val: '100' },
                        { label: '200 MAD', val: '200' },
                      ].map(({ label, val }) => {
                        const isActive = form.minSpendAmount === val;
                        return (
                          <TouchableOpacity
                            key={val}
                            onPress={() => dispatch({ type: 'SET_FIELD', field: 'minSpendAmount', value: val })}
                            activeOpacity={0.7}
                            style={[
                              styles.durChip,
                              { borderColor: isActive ? theme.primary : theme.borderLight,
                                backgroundColor: isActive ? theme.primary : theme.bgCard },
                            ]}
                          >
                            <Banknote size={14} color={isActive ? '#fff' : theme.textMuted} strokeWidth={1.5} />
                            <Text style={[styles.durChipText, { color: isActive ? '#fff' : theme.text }]}>{label}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {/* Custom min spend input */}
                    <View style={styles.customRateRow}>
                      <Text style={[styles.customRateLabel, { color: theme.textMuted }]}>{t('luckyWheel.minSpendCustom')}</Text>
                      <View style={[styles.customRateInput, { backgroundColor: theme.bgInput, borderColor: theme.border }]}>
                        <TextInput
                          style={[styles.customRateText, { color: theme.text }]}
                          value={form.minSpendAmount}
                          onChangeText={(v) => dispatch({ type: 'SET_FIELD', field: 'minSpendAmount', value: v.replace(/[^0-9]/g, '') })}
                          keyboardType="number-pad"
                          maxLength={6}
                        />
                        <Text style={[styles.customRatePct, { color: theme.textMuted }]}>MAD</Text>
                      </View>
                    </View>

                    {parseInt(form.minSpendAmount, 10) > 0 && (
                      <View style={[styles.tipBox, { backgroundColor: '#F59E0B14', marginTop: 10 }]}>
                        <Info size={14} color="#F59E0B" strokeWidth={1.5} />
                        <Text style={[styles.tipText, { color: '#92400E' }]}>
                          {t('luckyWheel.minSpendWarning', { amount: form.minSpendAmount })}
                        </Text>
                      </View>
                    )}
                  </>
                )}

                {/* ═══════════════════════════════════════════
                    STEP 3: Lots à gagner
                    ═══════════════════════════════════════════ */}
                {step === 2 && (
                  <>
                    {/* Tip box */}
                    <View style={[styles.tipBox, { backgroundColor: theme.primary + '08' }]}>
                      <Info size={14} color={theme.primary} strokeWidth={1.5} />
                      <Text style={[styles.tipText, { color: theme.textSecondary }]}>
                        {t('luckyWheel.wizPrizesTip')}
                      </Text>
                    </View>

                    {/* Prize Cards */}
                    {form.prizes.map((prize, idx) => (
                      <View key={prize.id} style={[styles.prizeCard, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}>
                        {/* Prize header */}
                        <View style={styles.prizeCardHeader}>
                          <View style={[styles.prizeNum, { backgroundColor: theme.primary + '14' }]}>
                            <Text style={[styles.prizeNumText, { color: theme.primary }]}>{idx + 1}</Text>
                          </View>
                          <Text style={[styles.prizeCardTitle, { color: theme.text }]}>
                            {t('luckyWheel.wizPrizeNum', { num: idx + 1 })}
                          </Text>
                          {form.prizes.length > 1 && (
                            <TouchableOpacity
                              onPress={() => dispatch({ type: 'REMOVE_PRIZE', index: idx })}
                              activeOpacity={0.7}
                              style={styles.prizeDeleteBtn}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                              accessibilityRole="button"
                              accessibilityLabel={t('luckyWheel.wizPrizeNum', { num: idx + 1 })}
                            >
                              <Trash2 size={15} color={TONE.danger} strokeWidth={1.5} />
                            </TouchableOpacity>
                          )}
                        </View>

                        {/* Prize name */}
                        <Text style={[styles.miniLabel, { color: theme.textMuted }]}>
                          {t('luckyWheel.prizeLabel')} <Text style={{ color: theme.primary }}>*</Text>
                        </Text>
                        <View style={[styles.inputWrapper, { backgroundColor: theme.bgInput, borderColor: prize.label.trim() ? theme.primary : theme.border }]}>
                          <Gift size={16} color={prize.label.trim() ? theme.primary : theme.textMuted} strokeWidth={1.5} />
                          <TextInput
                            style={[styles.wizInput, { color: theme.text }]}
                            value={prize.label}
                            onChangeText={(v) => dispatch({ type: 'SET_PRIZE_FIELD', index: idx, field: 'label', value: v })}
                            placeholder={t('luckyWheel.prizePlaceholder')}
                            placeholderTextColor={theme.textMuted}
                            maxLength={255}
                          />
                          {prize.label.trim().length > 0 && <Check size={14} color={theme.primary} strokeWidth={2.5} />}
                        </View>

                        {/* Prize description */}
                        <Text style={[styles.miniLabel, { color: theme.textMuted, marginTop: 12 }]}>
                          {t('luckyWheel.prizeDescLabel')}
                        </Text>
                        <View style={[styles.inputWrapper, { backgroundColor: theme.bgInput, borderColor: theme.border }]}>
                          <TextInput
                            style={[styles.wizInput, { color: theme.text }]}
                            value={prize.description}
                            onChangeText={(v) => dispatch({ type: 'SET_PRIZE_FIELD', index: idx, field: 'description', value: v })}
                            placeholder={t('luckyWheel.prizeDescPlaceholder')}
                            placeholderTextColor={theme.textMuted}
                            maxLength={1000}
                          />
                        </View>

                        {/* Stock + Weight + Claim in a row */}
                        <View style={styles.prizeMetaRow}>
                          <View style={styles.flexOne}>
                            <Text style={[styles.miniLabel, { color: theme.textMuted }]}>{t('luckyWheel.prizeStockLabel')}</Text>
                            <Text style={[styles.miniHint, { color: theme.textMuted }]}>{t('luckyWheel.prizeStockHint')}</Text>
                            <View style={[styles.inputWrapper, { backgroundColor: theme.bgInput, borderColor: theme.border }]}>
                              <Package size={14} color={theme.textMuted} strokeWidth={1.5} />
                              <TextInput
                                style={[styles.wizInput, { color: theme.text, textAlign: 'center' }]}
                                value={prize.totalStock}
                                onChangeText={(v) => dispatch({ type: 'SET_PRIZE_FIELD', index: idx, field: 'totalStock', value: v.replace(/[^0-9]/g, '') })}
                                keyboardType="number-pad"
                              />
                            </View>
                            <Text style={[styles.fieldExamples, { color: theme.textMuted }]}>
                              {t('luckyWheel.prizeStockTip')}
                            </Text>
                          </View>
                          <View style={styles.metaSpacer} />
                          <View style={styles.flexOne}>
                            <Text style={[styles.miniLabel, { color: theme.textMuted }]}>{t('luckyWheel.prizeWeightLabel')}</Text>
                            <Text style={[styles.miniHint, { color: theme.textMuted }]}>{t('luckyWheel.prizeWeightHint')}</Text>
                            <View style={[styles.inputWrapper, { backgroundColor: theme.bgInput, borderColor: theme.border }]}>
                              <Target size={14} color={theme.textMuted} strokeWidth={1.5} />
                              <TextInput
                                style={[styles.wizInput, { color: theme.text, textAlign: 'center' }]}
                                value={prize.weight}
                                onChangeText={(v) => dispatch({ type: 'SET_PRIZE_FIELD', index: idx, field: 'weight', value: v.replace(/[^0-9]/g, '') })}
                                keyboardType="number-pad"
                              />
                            </View>
                            <Text style={[styles.fieldExamples, { color: theme.textMuted }]}>
                              {t('luckyWheel.prizeWeightTip')}
                            </Text>
                          </View>
                        </View>

                        {/* Prize probability indicator */}
                        {form.prizes.length > 1 && (
                          <View style={[styles.prizeChanceRow, { backgroundColor: theme.primary + '08' }]}>
                            <Target size={13} color={theme.primary} strokeWidth={1.5} />
                            <Text style={[styles.prizeChanceText, { color: theme.primary }]}>
                              {t('luckyWheel.prizeChance', { pct: String(Math.round(((parseInt(prize.weight, 10) || 1) / totalWeight) * 100)) })}
                            </Text>
                            <View style={styles.prizeChanceBarBg}>
                              <View style={[styles.prizeChanceBarFill, { width: `${Math.round(((parseInt(prize.weight, 10) || 1) / totalWeight) * 100)}%`, backgroundColor: theme.primary }]} />
                            </View>
                          </View>
                        )}

                        {/* Claim Window */}
                        <View style={{ marginTop: 12 }}>
                          <Text style={[styles.miniLabel, { color: theme.textMuted }]}>{t('luckyWheel.prizeClaimLabel')}</Text>
                          <Text style={[styles.miniHint, { color: theme.textMuted }]}>{t('luckyWheel.prizeClaimHint')}</Text>

                          {/* Claim window presets */}
                          <View style={[styles.durationChipRow, { marginBottom: 8 }]}>
                            {[
                              { label: '24h', val: '24' },
                              { label: '48h', val: '48' },
                              { label: '72h', val: '72' },
                              { label: t('luckyWheel.claim1Week'), val: '168' },
                            ].map(({ label, val }) => {
                              const isActive = prize.claimWindowHours === val;
                              return (
                                <TouchableOpacity
                                  key={val}
                                  onPress={() => dispatch({ type: 'SET_PRIZE_FIELD', index: idx, field: 'claimWindowHours', value: val })}
                                  activeOpacity={0.7}
                                  style={[
                                    styles.claimChip,
                                    { borderColor: isActive ? theme.primary : theme.borderLight,
                                      backgroundColor: isActive ? theme.primary : theme.bgCard },
                                  ]}
                                >
                                  <Text style={[styles.claimChipText, { color: isActive ? '#fff' : theme.text }]}>{label}</Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>

                          <View style={[styles.inputWrapper, { backgroundColor: theme.bgInput, borderColor: theme.border }]}>
                            <Clock size={14} color={theme.textMuted} strokeWidth={1.5} />
                            <TextInput
                              style={[styles.wizInput, { color: theme.text }]}
                              value={prize.claimWindowHours}
                              onChangeText={(v) => dispatch({ type: 'SET_PRIZE_FIELD', index: idx, field: 'claimWindowHours', value: v.replace(/[^0-9]/g, '') })}
                              keyboardType="number-pad"
                              placeholder="72"
                              placeholderTextColor={theme.textMuted}
                            />
                            <Text style={[styles.unitLabel, { color: theme.textMuted }]}>h</Text>
                          </View>
                          <Text style={[styles.fieldExamples, { color: theme.textMuted }]}>
                            {t('luckyWheel.prizeClaimTip')}
                          </Text>
                        </View>
                      </View>
                    ))}

                    {/* Add prize */}
                    <TouchableOpacity
                      onPress={() => dispatch({ type: 'ADD_PRIZE' })}
                      style={[styles.addPrizeBtn, { borderColor: theme.primary + '40' }]}
                      activeOpacity={0.7}
                    >
                      <Plus size={16} color={theme.primary} strokeWidth={2} />
                      <Text style={[styles.addPrizeText, { color: theme.primary }]}>{t('luckyWheel.addPrize')}</Text>
                    </TouchableOpacity>

                    {/* Summary before launch */}
                    <View style={[styles.summaryCard, { backgroundColor: theme.primary + '08', borderColor: theme.primary + '20' }]}>
                      <Text style={[styles.summaryTitle, { color: theme.primary }]}>{t('luckyWheel.wizSummaryTitle')}</Text>
                      <View style={styles.summaryRow}>
                        <Text style={[styles.summaryLabel, { color: theme.textMuted }]}>{t('luckyWheel.nameLabel')}</Text>
                        <Text style={[styles.summaryValue, { color: theme.text }]}>{form.name || '—'}</Text>
                      </View>
                      <View style={styles.summaryRow}>
                        <Text style={[styles.summaryLabel, { color: theme.textMuted }]}>{t('luckyWheel.winRateLabel')}</Text>
                        <Text style={[styles.summaryValue, { color: theme.text }]}>{form.globalWinRate}%</Text>
                      </View>
                      <View style={styles.summaryRow}>
                        <Text style={[styles.summaryLabel, { color: theme.textMuted }]}>{t('luckyWheel.durationLabel')}</Text>
                        <Text style={[styles.summaryValue, { color: theme.text }]}>{durationDays} {t('luckyWheel.wizDays')}</Text>
                      </View>
                      <View style={styles.summaryRow}>
                        <Text style={[styles.summaryLabel, { color: theme.textMuted }]}>{t('luckyWheel.wizSummaryDates')}</Text>
                        <Text style={[styles.summaryValue, { color: theme.text }]}>{form.startsAt} → {form.endsAt}</Text>
                      </View>
                      {parseInt(form.minSpendAmount, 10) > 0 && (
                        <View style={styles.summaryRow}>
                          <Text style={[styles.summaryLabel, { color: theme.textMuted }]}>{t('luckyWheel.minSpendLabel')}</Text>
                          <Text style={[styles.summaryValue, { color: theme.text }]}>{form.minSpendAmount} MAD</Text>
                        </View>
                      )}
                      <View style={[styles.summaryDivider, { backgroundColor: theme.primary + '18' }]} />
                      <Text style={[styles.summarySubtitle, { color: theme.primary }]}>
                        {t('luckyWheel.prizesTitle')} ({form.prizes.length})
                      </Text>
                      {form.prizes.map((p, i) => {
                        const pct = Math.round(((parseInt(p.weight, 10) || 1) / totalWeight) * 100);
                        const stock = parseInt(p.totalStock, 10) || 0;
                        return (
                          <View key={p.id} style={styles.summaryPrizeRow}>
                            <View style={[styles.summaryPrizeDot, { backgroundColor: theme.primary }]} />
                            <Text style={[styles.summaryPrizeName, { color: theme.text }]} numberOfLines={1}>
                              {p.label || `${t('luckyWheel.wizPrizeNum', { num: i + 1 })}`}
                            </Text>
                            <Text style={[styles.summaryPrizeMeta, { color: theme.textMuted }]}>
                              ×{stock}  ·  {pct}%
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  </>
                )}

                <View style={{ height: 100 }} />
              </ScrollView>

              {/* ── Bottom Action Bar ── */}
              <View style={[styles.bottomBar, { backgroundColor: theme.bg, borderTopColor: theme.border, paddingBottom: Math.max(insets.bottom, 16) }]}>
                {step === totalSteps - 1 ? (
                  <TouchableOpacity
                    style={[styles.primaryBtn, { backgroundColor: (createMutation.isPending || updateMutation.isPending) ? theme.primary + '80' : theme.primary }]}
                    onPress={handleCreate}
                    disabled={createMutation.isPending || updateMutation.isPending}
                    activeOpacity={0.8}
                  >
                    {(createMutation.isPending || updateMutation.isPending) ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        {editingCampaign
                          ? <Edit3 size={18} color="#fff" strokeWidth={2} />
                          : <Gift size={18} color="#fff" strokeWidth={2} />}
                        <Text style={styles.primaryBtnText}>{editingCampaign ? t('luckyWheel.editBtn') : t('luckyWheel.launchBtn')}</Text>
                      </>
                    )}
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[styles.primaryBtn, { backgroundColor: canGoNext ? theme.primary : theme.primary + '40' }]}
                    onPress={goNext}
                    disabled={!canGoNext}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.primaryBtnText}>{t('luckyWheel.wizNext')}</Text>
                    <ArrowLeft size={16} color="#fff" strokeWidth={2} style={{ transform: [{ rotate: '180deg' }] }} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Header
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 10,
  },
  backBtn: { marginRight: 2 },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    fontFamily: 'Lexend_700Bold',
    letterSpacing: -0.5,
    flex: 1,
  },

  // Sections
  guideContainer: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderLeftWidth: 3,
  },
  guideText: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: 'Lexend_400Regular',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginTop: 20,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    fontFamily: 'Lexend_700Bold',
    letterSpacing: -0.2,
  },
  card: {
    marginHorizontal: 16,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: 'transparent',
    marginBottom: 10,
  },

  // ── Create ──
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 20,
    marginTop: 20,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  createBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'Lexend_700Bold',
  },

  // ── Empty ──
  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyTitle: { fontSize: 16, fontWeight: '600', marginTop: 16, fontFamily: 'Lexend_600SemiBold' },
  emptyHint: { fontSize: 14, marginTop: 8, textAlign: 'center', paddingHorizontal: 32, fontFamily: 'Lexend_400Regular' },

  // ── Pending ──
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  pendingPrize: { fontSize: 14, fontWeight: '500', fontFamily: 'Lexend_500Medium' },
  pendingClient: { fontSize: 12, fontFamily: 'Lexend_400Regular' },
  pendingExpiry: { fontSize: 12, marginTop: 2, fontFamily: 'Lexend_400Regular' },
  fulfilBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },

  // ── Campaign Card ──
  campaignHeader: { flexDirection: 'row', alignItems: 'center' },
  campaignName: { fontSize: 15, fontWeight: '600', fontFamily: 'Lexend_600SemiBold' },
  campaignDates: { fontSize: 12, marginTop: 2, fontFamily: 'Lexend_400Regular' },
  statusBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginLeft: 8,
  },
  statusText: { fontSize: 11, fontWeight: '600', fontFamily: 'Lexend_600SemiBold' },
  campaignBody: { marginTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(0,0,0,0.06)', paddingTop: 14 },
  campaignDesc: { fontSize: 13, marginBottom: 12, lineHeight: 18, fontFamily: 'Lexend_400Regular' },

  // ── Stats ──
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  statPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 10,
  },
  statValue: { fontSize: 14, fontWeight: '700', fontFamily: 'Lexend_700Bold' },
  statLabel: { fontSize: 11, fontFamily: 'Lexend_400Regular' },

  // ── Prize list ──
  prizesSectionTitle: { fontSize: 14, fontWeight: '600', marginBottom: 8, fontFamily: 'Lexend_600SemiBold' },
  prizeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  prizeName: { fontSize: 14, fontWeight: '500', fontFamily: 'Lexend_500Medium' },
  prizeStock: { fontSize: 12, marginTop: 2, fontFamily: 'Lexend_400Regular' },

  // ── Actions ──
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  actionText: { fontSize: 12, fontWeight: '600', fontFamily: 'Lexend_600SemiBold' },

  // ══════════════════════════════════════
  // ── Wizard Modal (matches stores.tsx) ──
  // ══════════════════════════════════════
  modalOverlay: { flex: 1 },
  modalContent: { flex: 1 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  stepHeaderCenter: { flex: 1, alignItems: 'center' },
  modalTitle: { fontSize: 16, fontWeight: '700', fontFamily: 'Lexend_700Bold' },
  stepLabel: { fontSize: 12, marginTop: 2, fontFamily: 'Lexend_400Regular' },

  // ── Progress ──
  progressTrack: {
    height: 3,
    marginHorizontal: 20,
    marginTop: 8,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },

  // ── Step Title ──
  stepTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
  },
  stepIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepTitleText: {
    fontSize: 17,
    fontWeight: '700',
    fontFamily: 'Lexend_700Bold',
    letterSpacing: -0.3,
  },
  stepDesc: {
    fontSize: 13,
    marginTop: 2,
    lineHeight: 18,
    fontFamily: 'Lexend_400Regular',
  },

  // ── Form Content ──
  formContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },

  // ── Fields ──
  fieldLabel: { fontSize: 14, fontWeight: '600', marginBottom: 6, fontFamily: 'Lexend_600SemiBold' },
  fieldHint: { fontSize: 13, marginBottom: 12, lineHeight: 18, fontFamily: 'Lexend_400Regular' },
  fieldExamples: { fontSize: 12, marginTop: 6, marginBottom: 2, lineHeight: 16, fontFamily: 'Lexend_400Regular', fontStyle: 'italic' as const, opacity: 0.7 },
  miniLabel: { fontSize: 12, marginBottom: 4, fontFamily: 'Lexend_400Regular' },
  miniHint: { fontSize: 11, marginBottom: 6, fontFamily: 'Lexend_400Regular', opacity: 0.7 },

  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  inputMultiWrap: {
    alignItems: 'flex-start',
    minHeight: 80,
  },
  wizInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Lexend_500Medium',
    paddingVertical: 0,
  },
  wizInputMulti: {
    textAlignVertical: 'top',
    minHeight: 60,
  },
  unitLabel: { fontSize: 13, fontWeight: '600', fontFamily: 'Lexend_600SemiBold' },

  // ── Tip box ──
  tipBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 20,
    padding: 14,
    borderRadius: 12,
  },
  tipText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Lexend_400Regular',
  },

  // ── Win Rate Chips ──
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  rateChip: {
    width: '47%',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  rateChipValue: { fontSize: 18, fontWeight: '700', fontFamily: 'Lexend_700Bold' },
  rateChipDesc: { fontSize: 11, marginTop: 2, fontFamily: 'Lexend_400Regular' },

  // ── Custom rate ──
  customRateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  customRateLabel: { fontSize: 13, fontFamily: 'Lexend_400Regular' },
  customRateInput: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 4,
  },
  customRateText: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'Lexend_700Bold',
    textAlign: 'center',
    minWidth: 40,
  },
  customRatePct: { fontSize: 14, fontWeight: '600', fontFamily: 'Lexend_600SemiBold' },

  // ── Preview card ──
  previewCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  previewCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewTitle: { fontSize: 14, fontWeight: '600', fontFamily: 'Lexend_600SemiBold' },
  previewSubtitle: { fontSize: 12, marginTop: 2, fontFamily: 'Lexend_400Regular' },
  winBarContainer: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(0,0,0,0.06)',
    marginTop: 14,
    overflow: 'hidden',
  },
  winBarFill: {
    height: '100%',
    borderRadius: 3,
  },

  // ── Divider ──
  divider: { height: 1, marginVertical: 24 },

  // ── Duration chips ──
  durationChipRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  durChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    gap: 6,
  },
  durChipText: { fontSize: 13, fontWeight: '600', fontFamily: 'Lexend_600SemiBold' },
  dateRow: { flexDirection: 'row', marginTop: 4 },

  // ── Prize cards ──
  prizeCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  prizeCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  prizeNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prizeNumText: { fontSize: 13, fontWeight: '700', fontFamily: 'Lexend_700Bold' },
  prizeCardTitle: { fontSize: 15, fontWeight: '600', fontFamily: 'Lexend_600SemiBold', flex: 1, marginLeft: 10 },
  prizeDeleteBtn: {
    padding: 6,
  },
  prizeMetaRow: {
    flexDirection: 'row',
    marginTop: 12,
  },

  // ── Add prize ──
  addPrizeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 12,
    gap: 6,
    marginTop: 4,
    marginBottom: 16,
  },
  addPrizeText: { fontSize: 14, fontWeight: '500', fontFamily: 'Lexend_500Medium' },

  // ── Summary ──
  summaryCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    marginTop: 8,
  },
  summaryTitle: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'Lexend_700Bold',
    marginBottom: 12,
  },
  summarySubtitle: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'Lexend_600SemiBold',
    marginBottom: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  summaryLabel: { fontSize: 13, fontFamily: 'Lexend_400Regular' },
  summaryValue: { fontSize: 13, fontWeight: '600', fontFamily: 'Lexend_600SemiBold', maxWidth: '55%', textAlign: 'right' as const },
  summaryDivider: { height: 1, marginVertical: 10 },
  summaryPrizeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    gap: 8,
  },
  summaryPrizeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  summaryPrizeName: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Lexend_500Medium',
  },
  summaryPrizeMeta: {
    fontSize: 12,
    fontFamily: 'Lexend_400Regular',
  },

  // ── Prize probability ──
  prizeChanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    padding: 10,
    borderRadius: 10,
  },
  prizeChanceText: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'Lexend_600SemiBold',
  },
  prizeChanceBarBg: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(0,0,0,0.06)',
    overflow: 'hidden',
  },
  prizeChanceBarFill: {
    height: '100%',
    borderRadius: 3,
  },

  // ── Claim window chips ──
  claimChip: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1.5,
  },
  claimChipText: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'Lexend_600SemiBold',
  },

  // ── Bottom Bar ──
  bottomBar: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    borderRadius: 12,
    gap: 8,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'Lexend_700Bold',
  },

  // Extracted from inline styles
  sectionHeaderContent: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    flex: 1,
  },
  sectionHeaderIcon: {
    width: ms(32),
    height: ms(32),
    borderRadius: ms(10),
    backgroundColor: `${palette.violet}18`,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  sectionHeaderIconWarning: {
    width: ms(32),
    height: ms(32),
    borderRadius: ms(10),
    backgroundColor: '#F59E0B22',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  sectionHeaderIconSuccess: {
    width: ms(32),
    height: ms(32),
    borderRadius: ms(10),
    backgroundColor: '#16A34A22',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  emptyIconWrap: {
    width: ms(88),
    height: ms(88),
    borderRadius: ms(24),
    backgroundColor: `${palette.violet}18`,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  statPillContent: {
    marginLeft: 6,
  },
  prizeItemContent: {
    flex: 1,
    marginLeft: 8,
  },
  flexOne: {
    flex: 1,
  },
  dateCol: {
    flex: 1,
  },
  dateSpacer: {
    width: 12,
  },
  metaSpacer: {
    width: 10,
  },
  dateError: {
    color: '#EF4444',
    fontSize: 11,
    marginTop: 4,
    fontFamily: 'Lexend_400Regular',
  },
  showMoreBtn: {
    alignItems: 'center' as const,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.06)',
    marginTop: 4,
  },
  showMoreText: {
    fontSize: 13,
    fontWeight: '600' as const,
    fontFamily: 'Lexend_600SemiBold',
  },
});
