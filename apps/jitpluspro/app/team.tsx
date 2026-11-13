import { useState, useCallback, useMemo } from 'react';
import { useGuardedCallback } from '@/hooks/useGuardedCallback';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { JitLock, JitPersonAdd } from '@/components/icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuthStore } from '@/stores/authStore';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getErrorMessage } from '@/utils/error';
import type { TeamMember } from '@/types';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  useTeamMembers,
  useCreateTeamMember,
  useUpdateTeamMember,
  useDeleteTeamMember,
} from '@/hooks/useQueryHooks';
import { ActionButton } from '@/components/ui/ActionButton';
import { DemoVideoButton } from '@/components/demo/DemoVideoButton';
import { ScreenHeader } from '@/components/scratch/ScratchUI';
import { SummaryCard } from '@/components/ui/SummaryCard';
import MemberCard from '@/components/team/MemberCard';
import AddEditMemberModal, { type MemberFormPayload } from '@/components/team/MemberFormModal';
import { font, icon } from '@/constants/design';
import { useDir } from '@/hooks/useDir';

// Same artwork as the "Mon équipe" card of Accueil.
const TEAM_IMAGE = require('@/assets/images/tools/equipe.png');

export default function TeamScreen() {
  const theme = useTheme();
  const dir = useDir();
  const isTeamMember = useAuthStore((s) => s.isTeamMember);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();

  const {
    data: members = [],
    isLoading: loading,
    isRefetching: refreshing,
    refetch,
    error: teamError,
  } = useTeamMembers(!isTeamMember);

  // Detect 403 (Premium required) — backend PremiumGuard rejects non-Pro merchants.
  // We render a neutral "Pro feature" screen WITHOUT any external payment CTA
  // (no WhatsApp / web link) to comply with Apple Guideline 3.1.1 / 3.1.3.
  const teamErrorStatus = teamError as { response?: { status?: number }; status?: number } | null;
  const isPremiumRequired = (teamErrorStatus?.response?.status ?? teamErrorStatus?.status) === 403;

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);

  const createMember = useCreateTeamMember();
  const updateMember = useUpdateTeamMember();
  const deleteMemberMutation = useDeleteTeamMember();
  const formLoading = createMember.isPending || updateMember.isPending;

  const onRefresh = useGuardedCallback(async () => {
    await refetch();
  }, [refetch]);

  const existingEmails = useMemo(
    () => members.map((m) => m.email.toLowerCase()),
    [members],
  );

  const stats = useMemo(() => {
    let active = 0;
    let scans = 0;
    for (const m of members) {
      if (m.isActive) active++;
      scans += m.transactionsCount || 0;
    }
    return { active, inactive: members.length - active, scans, total: members.length };
  }, [members]);

  const closeModal = useCallback(() => {
    setShowAddModal(false);
    setEditingMember(null);
  }, []);

  const openAddModal = useCallback(() => {
    setEditingMember(null);
    setShowAddModal(true);
  }, []);

  const openEditModal = useCallback((member: TeamMember) => {
    setEditingMember(member);
    setShowAddModal(true);
  }, []);

  const handleFormSubmit = useCallback(
    async (payload: MemberFormPayload) => {
      try {
        if (payload.isEdit && payload.memberId) {
          const data: Record<string, string> = { nom: payload.nom, email: payload.email };
          if (payload.password) data.password = payload.password;
          await updateMember.mutateAsync({ id: payload.memberId, payload: data });
        } else {
          await createMember.mutateAsync({
            nom: payload.nom,
            email: payload.email,
            password: payload.password,
          });
        }
        closeModal();
      } catch (error: unknown) {
        // Special-case 429 (throttler) for friendlier message
        const err = error as { response?: { status?: number } };
        if (err?.response?.status === 429) {
          Alert.alert(t('team.limitReachedTitle'), t('team.limitReachedMsg'));
          return;
        }
        Alert.alert(t('common.error'), getErrorMessage(error, t('team.operationError')));
      }
    },
    [createMember, updateMember, closeModal, t],
  );

  const toggleActive = useGuardedCallback(
    async (member: TeamMember) => {
      try {
        await updateMember.mutateAsync({
          id: member.id,
          payload: { isActive: !member.isActive },
        });
      } catch {
        Alert.alert(t('common.error'), t('team.statusToggleError'));
      }
    },
    [updateMember, t],
  );

  const deleteMember = useCallback(
    (member: TeamMember) => {
      Alert.alert(t('team.deleteTitle'), t('team.deleteMsg', { name: member.nom }), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMemberMutation.mutateAsync(member.id);
            } catch {
              Alert.alert(t('common.error'), t('team.deleteMemberError'));
            }
          },
        },
      ]);
    },
    [deleteMemberMutation, t],
  );

  const keyExtractor = useCallback((m: TeamMember) => m.id, []);
  const goToPlan = useCallback(() => router.push('/plan'), [router]);

  const renderItem = useCallback(
    ({ item }: { item: TeamMember }) => (
      <MemberCard
        member={item}
        onToggle={toggleActive}
        onEdit={openEditModal}
        onDelete={deleteMember}
      />
    ),
    [toggleActive, openEditModal, deleteMember],
  );

  const listHeader = useMemo(
    () => (
      <SummaryCard
        style={styles.summary}
        label={t('team.summaryMembers')}
        value={stats.total}
        stats={[
          { label: t('team.summaryActive'), value: stats.active },
          { label: t('team.summaryInactive'), value: stats.inactive },
          { label: t('team.summaryScans'), value: stats.scans },
        ]}
      />
    ),
    [stats, t],
  );

  const listFooter = useMemo(() => {
    if (members.length === 0) return null;
    return (
      <>
        <ActionButton label={t('team.addMember')} icon={JitPersonAdd} onPress={openAddModal} />
        <View
          style={[
            styles.infoBox,
            { backgroundColor: theme.bgCard, borderColor: theme.border },
          ]}
        >
          <Text
            style={[styles.infoText, { color: theme.textSecondary, textAlign: dir.textAlign }]}
            maxFontSizeMultiplier={1.4}
          >
            {t('team.infoHint')}
          </Text>
        </View>
      </>
    );
  }, [members.length, t, theme.bgCard, theme.border, theme.textSecondary, dir.textAlign, openAddModal]);

  const listEmpty = useMemo(
    () => (
      <View style={styles.emptyContainer}>
        <Image source={TEAM_IMAGE} style={styles.emptyImage} contentFit="contain" accessible={false} />
        <Text style={[styles.emptyTitle, { color: theme.text }]} maxFontSizeMultiplier={1.4}>
          {t('team.noMembers')}
        </Text>
        <Text
          style={[styles.emptyText, { color: theme.textMuted }]}
          maxFontSizeMultiplier={1.4}
        >
          {t('team.noMembersHint')}
        </Text>
        <ActionButton
          label={t('team.addMember')}
          icon={JitPersonAdd}
          onPress={openAddModal}
          style={styles.emptyAddBtn}
        />
      </View>
    ),
    [t, theme.text, theme.textMuted, openAddModal],
  );

  const header = (
    <ScreenHeader title={t('team.title')} right={<DemoVideoButton id="equipe" variant="header" />} />
  );

  if (isTeamMember) {
    return (
      <View style={[styles.container, { backgroundColor: theme.bg }]}>
        {header}
        <View style={styles.centered}>
          <JitLock size={48} color={theme.textMuted} strokeWidth={icon.stroke} />
          <Text style={[styles.emptyTitle, { color: theme.text }]} maxFontSizeMultiplier={1.4}>
            {t('team.accessDenied')}
          </Text>
          <Text
            style={[styles.emptyText, { color: theme.textMuted }]}
            maxFontSizeMultiplier={1.4}
          >
            {t('team.accessDeniedMsg')}
          </Text>
        </View>
      </View>
    );
  }

  // Premium-required fallback (non-Pro merchant). Neutral UI — no external
  // payment link / CTA to stay compliant with Apple 3.1.1 / 3.1.3.
  if (isPremiumRequired) {
    return (
      <View style={[styles.container, { backgroundColor: theme.bg }]}>
        {header}
        <View style={styles.centered}>
          <JitLock size={48} color={theme.primary} strokeWidth={icon.stroke} />
          <Text
            style={[styles.emptyTitle, { color: theme.text }]}
            maxFontSizeMultiplier={1.4}
          >
            {t('team.proRequiredTitle')}
          </Text>
          <Text
            style={[styles.emptyText, { color: theme.textMuted }]}
            maxFontSizeMultiplier={1.4}
          >
            {t('team.proRequiredMsg')}
          </Text>
          <ActionButton
            label={t('team.viewMyPlan')}
            onPress={goToPlan}
            style={styles.emptyAddBtn}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {header}

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : (
        <FlatList
          data={members}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          ListHeaderComponent={members.length > 0 ? listHeader : null}
          ListFooterComponent={listFooter}
          ListEmptyComponent={listEmpty}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={Platform.OS === 'android'}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={7}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[theme.primary]}
              tintColor={theme.primary}
            />
          }
        />
      )}

      <AddEditMemberModal
        visible={showAddModal}
        editingMember={editingMember}
        existingEmails={existingEmails}
        onClose={closeModal}
        onSubmit={handleFormSubmit}
        submitting={formLoading}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },

  listContent: { paddingHorizontal: 16, paddingTop: 16 },


  summary: { marginBottom: 16 },

  emptyContainer: { alignItems: 'center', paddingTop: 40, paddingHorizontal: 24 },
  emptyImage: { width: 112, height: 112, marginBottom: 12 },
  emptyTitle: { fontSize: 18, marginBottom: 6, fontFamily: font.semibold },
  emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 20, fontFamily: font.regular },
  emptyAddBtn: { marginTop: 20 },

  infoBox: {
    marginTop: 12,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
  },
  infoText: { fontSize: 13, lineHeight: 20, fontFamily: font.regular },
});
