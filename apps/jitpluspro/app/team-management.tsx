import React, { useState, useCallback } from 'react';
import { useGuardedCallback } from '@/hooks/useGuardedCallback';
import { MIN_PASSWORD_LENGTH } from '@/constants/app';
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
} from 'react-native';
import {
  Users,
  UserPlus,
  Mail,
  Lock,
  User,
  ArrowLeft,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Edit3,
  Shield,
  Activity,
  Check,
  X,
  MapPin,
} from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getErrorMessage } from '@/utils/error';
import { TeamMember } from '@/types';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTeamMembers, useCreateTeamMember, useUpdateTeamMember, useDeleteTeamMember } from '@/hooks/useQueryHooks';

const MemberCard = React.memo(function MemberCard({
  member,
  onToggle,
  onEdit,
  onDelete,
}: {
  member: TeamMember;
  onToggle: (m: TeamMember) => void;
  onEdit: (m: TeamMember) => void;
  onDelete: (m: TeamMember) => void;
}) {
  const theme = useTheme();
  const { t } = useLanguage();

  return (
    <View
      style={[
        styles.memberCard,
        {
          backgroundColor: theme.bgCard,
          borderColor: theme.borderLight,
          opacity: member.isActive ? 1 : 0.65,
        },
      ]}
    >
      <View style={styles.memberTop}>
        <View style={[styles.memberAvatar, { backgroundColor: theme.primary + '15' }]}>
          <User size={20} color={theme.primary} strokeWidth={1.5} />
        </View>
        <View style={styles.memberInfo}>
          <View style={styles.memberNameRow}>
            <Text style={[styles.memberName, { color: theme.text }]} numberOfLines={1}>
              {member.nom}
            </Text>
            {!member.isActive && (
              <View style={[styles.badge, { backgroundColor: theme.danger + '15' }]}>
                <Text style={[styles.badgeText, { color: theme.danger }]}>{t('team.inactive')}</Text>
              </View>
            )}
          </View>
          <Text style={[styles.memberEmail, { color: theme.textMuted }]} numberOfLines={1}>
            {member.email}
          </Text>
        </View>
      </View>

      <View style={[styles.metaRow, { borderTopColor: theme.borderLight }]}>
        <View style={styles.metaItem}>
          <Shield size={13} color={theme.textMuted} />
          <Text style={[styles.metaText, { color: theme.textMuted }]}>{t('team.restrictedAccess')}</Text>
        </View>
        <View style={styles.metaItem}>
          <Activity size={13} color={theme.textMuted} />
          <Text style={[styles.metaText, { color: theme.textMuted }]}>
            {t('team.transactionsCount', { count: member.transactionsCount || 0 })}
          </Text>
        </View>
      </View>

      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={[styles.actionChip, { backgroundColor: member.isActive ? (theme.success + '12') : (theme.textMuted + '12') }]}
          onPress={() => onToggle(member)}
          activeOpacity={0.7}
        >
          {member.isActive ? (
            <ToggleRight size={16} color={theme.success} />
          ) : (
            <ToggleLeft size={16} color={theme.textMuted} />
          )}
          <Text style={[styles.actionChipText, { color: member.isActive ? theme.success : theme.textMuted }]}>
            {member.isActive ? t('stores.active') : t('stores.inactive')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionChip, { backgroundColor: theme.primary + '12' }]}
          onPress={() => onEdit(member)}
          activeOpacity={0.7}
        >
          <Edit3 size={15} color={theme.primary} />
          <Text style={[styles.actionChipText, { color: theme.primary }]}>{t('stores.editBtn')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionChip, { backgroundColor: theme.danger + '12' }]}
          onPress={() => onDelete(member)}
          activeOpacity={0.7}
        >
          <Trash2 size={15} color={theme.danger} />
          <Text style={[styles.actionChipText, { color: theme.danger }]}>{t('common.delete')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
});

export default function TeamManagementScreen() {
  const shouldWait = useRequireAuth();
  const theme = useTheme();
  const { isTeamMember } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();

  const { data: members = [], isLoading: loading, isRefetching: refreshing, refetch } = useTeamMembers(!isTeamMember);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);

  const createMember = useCreateTeamMember();
  const updateMember = useUpdateTeamMember();
  const deleteMemberMutation = useDeleteTeamMember();
  const formLoading = createMember.isPending || updateMember.isPending;

  // Form state
  const [formNom, setFormNom] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');

  const onRefresh = useGuardedCallback(async () => {
    await refetch();
  }, [refetch]);

  const resetForm = () => {
    setFormNom('');
    setFormEmail('');
    setFormPassword('');
    setEditingMember(null);
  };

  const openAddModal = () => {
    resetForm();
    setShowAddModal(true);
  };

  const openEditModal = (member: TeamMember) => {
    setEditingMember(member);
    setFormNom(member.nom);
    setFormEmail(member.email);
    setFormPassword('');
    setShowAddModal(true);
  };

  const handleSubmit = async () => {
    if (!formNom.trim() || !formEmail.trim()) {
      Alert.alert(t('common.error'), t('team.nameEmailRequired'));
      return;
    }

    if (!editingMember && members.some(m => m.email.toLowerCase() === formEmail.trim().toLowerCase())) {
      Alert.alert(t('common.error'), t('team.emailAlreadyExists'));
      return;
    }

    if (!editingMember && !formPassword.trim()) {
      Alert.alert(t('common.error'), t('team.passwordRequired'));
      return;
    }

    if (formPassword && formPassword.length < MIN_PASSWORD_LENGTH) {
      Alert.alert(t('common.error'), t('team.passwordMinLength', { min: MIN_PASSWORD_LENGTH }));
      return;
    }

    try {
      if (editingMember) {
        const data: Record<string, string> = { nom: formNom.trim(), email: formEmail.trim() };
        if (formPassword.trim()) data.password = formPassword.trim();
        await updateMember.mutateAsync({ id: editingMember.id, payload: data });
      } else {
        await createMember.mutateAsync({
          nom: formNom.trim(),
          email: formEmail.trim(),
          password: formPassword.trim(),
        });
      }
      setShowAddModal(false);
      resetForm();
    } catch (error: unknown) {
      Alert.alert(t('common.error'), getErrorMessage(error, t('team.operationError')));
    }
  };

  const toggleActive = async (member: TeamMember) => {
    try {
      await updateMember.mutateAsync({ id: member.id, payload: { isActive: !member.isActive } });
    } catch (error: unknown) {
      Alert.alert(t('common.error'), t('team.statusToggleError'));
    }
  };

  const deleteMember = (member: TeamMember) => {
    Alert.alert(
      t('team.deleteTitle'),
      t('team.deleteMsg', { name: member.nom }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMemberMutation.mutateAsync(member.id);
            } catch (error: unknown) {
              Alert.alert(t('common.error'), t('team.deleteMemberError'));
            }
          },
        },
      ],
    );
  };

  // Team members should not see this screen
  if (shouldWait) return null;

  if (isTeamMember) {
    return (
      <View style={[styles.container, { backgroundColor: theme.bg }]}>
        <View style={[styles.headerBar, { paddingTop: insets.top + 8, backgroundColor: theme.bgCard, borderBottomColor: theme.borderLight, borderBottomWidth: StyleSheet.hairlineWidth }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <ArrowLeft size={24} color={theme.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.text }]}>{t('team.title')}</Text>
        </View>
        <View style={styles.centered}>
          <Shield size={48} color={theme.textMuted} strokeWidth={1.5} />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>{t('team.accessDenied')}</Text>
          <Text style={[styles.emptyText, { color: theme.textMuted }]}>
            {t('team.accessDeniedMsg')}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* ── Simple header — matches activity style ── */}
      <View style={[styles.headerBar, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={22} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>{t('team.title')}</Text>
        <TouchableOpacity
          onPress={openAddModal}
          style={[styles.addBtn, { backgroundColor: theme.primary + '18' }]}
          activeOpacity={0.7}
        >
          <UserPlus size={20} color={theme.primary} strokeWidth={1.5} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: 100, paddingHorizontal: 16, paddingTop: 16 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[theme.primary]}
              tintColor={theme.primary}
            />
          }
        >
          {/* â”€â”€ Compteur â”€â”€â”€ */}
          <View style={[styles.countBanner, { backgroundColor: theme.primary + '10', borderColor: theme.primary + '25' }]}>
            <Users size={18} color={theme.primary} />
            <Text style={[styles.countText, { color: theme.primary }]}>
              {t('team.memberCount', { count: members.length })}
            </Text>
          </View>

          {members.length === 0 ? (
            /* â”€â”€ Empty state â”€â”€â”€ */
            <View style={styles.emptyContainer}>
              <View style={[styles.emptyIllustration, { backgroundColor: theme.primary + '10' }]}>
                <Users size={40} color={theme.primary} strokeWidth={1.5} />
              </View>
              <Text style={[styles.emptyTitle, { color: theme.text }]}>{t('team.noMembers')}</Text>
              <Text style={[styles.emptyText, { color: theme.textMuted }]}>
                {t('team.noMembersHint')}
              </Text>
              <TouchableOpacity
                style={[styles.emptyAddBtn, { backgroundColor: theme.primary }]}
                onPress={openAddModal}
                activeOpacity={0.7}
              >
                <UserPlus size={18} color="#fff" />
                <Text style={styles.emptyAddBtnText}>{t('team.addMember')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            /* â”€â”€ Members list â”€â”€â”€ */
            members.map((member) => (
              <MemberCard
                key={member.id}
                member={member}
                onToggle={toggleActive}
                onEdit={openEditModal}
                onDelete={deleteMember}
              />
            ))
          )}

          {/* â”€â”€ Info box (mÃªme style que edit-profile) â”€â”€â”€ */}
          {members.length > 0 && (
            <View style={[styles.infoBox, { backgroundColor: theme.primary + '10', borderColor: theme.primary + '25' }]}>
              <Text style={[styles.infoText, { color: theme.primary }]}>
                {t('team.infoHint')}
              </Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* â”€â”€ Add/Edit Modal â”€â”€â”€ */}
      <Modal
        visible={showAddModal}
        animationType="slide"
        transparent={false}
        onRequestClose={() => {
          setShowAddModal(false);
          resetForm();
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={[styles.modalOverlay, { backgroundColor: theme.bg, paddingTop: insets.top }]}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
            {/* Modal header (mÃªme style que edit-profile header) */}
            <View style={[styles.modalHeader, { backgroundColor: theme.bgCard, borderBottomColor: theme.borderLight }]}>
              <TouchableOpacity
                onPress={() => { setShowAddModal(false); resetForm(); }}
                style={styles.backBtn}
              >
                <ArrowLeft size={24} color={theme.text} />
              </TouchableOpacity>
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                {editingMember ? t('team.editMember') : t('team.addMember')}
              </Text>
              <TouchableOpacity
                onPress={handleSubmit}
                disabled={formLoading}
                style={[styles.addBtn, { backgroundColor: theme.primary }, formLoading && { opacity: 0.5 }]}
                activeOpacity={0.7}
              >
                {formLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Check size={20} color="#fff" strokeWidth={1.5} />
                )}
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16 }}>
              {/* Nom */}
              <Text style={[styles.label, { color: theme.text }]}>{t('team.nameLabel')} *</Text>
              <View style={[styles.inputWrapper, { backgroundColor: theme.bgInput, borderColor: theme.border }]}>
                <User size={18} color={theme.textMuted} />
                <TextInput
                  style={[styles.input, { color: theme.text }]}
                  placeholder={t('teamPlaceholders.namePlaceholder')}
                  placeholderTextColor={theme.textMuted}
                  value={formNom}
                  onChangeText={setFormNom}
                  autoCapitalize="words"
                />
              </View>

              {/* Email */}
              <Text style={[styles.label, { color: theme.text }]}>{t('team.emailLabel')} *</Text>
              <View style={[styles.inputWrapper, { backgroundColor: theme.bgInput, borderColor: theme.border }]}>
                <Mail size={18} color={theme.textMuted} />
                <TextInput
                  style={[styles.input, { color: theme.text }]}
                  placeholder={t('teamPlaceholders.emailPlaceholder')}
                  placeholderTextColor={theme.textMuted}
                  value={formEmail}
                  onChangeText={setFormEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
              </View>

              {/* Password */}
              <Text style={[styles.label, { color: theme.text }]}>
                {editingMember ? t('team.passwordOptional') : `${t('team.passwordLabel')} *`}
              </Text>
              <View style={[styles.inputWrapper, { backgroundColor: theme.bgInput, borderColor: theme.border }]}>
                <Lock size={18} color={theme.textMuted} />
                <TextInput
                  style={[styles.input, { color: theme.text }]}
                  placeholder={t('teamPlaceholders.passwordPlaceholder')}
                  placeholderTextColor={theme.textMuted}
                  value={formPassword}
                  onChangeText={setFormPassword}
                  secureTextEntry
                />
              </View>

              {/* Permissions info (mÃªme style que infoBox) */}
              <View style={[styles.permBox, { backgroundColor: theme.primary + '10', borderColor: theme.primary + '25' }]}>
                <Text style={[styles.permBoxTitle, { color: theme.primary }]}>{t('team.permissionsTitle')}</Text>
                <View style={styles.permList}>
                    <View style={styles.permRow}>
                      <Check size={14} color={theme.primary} />
                      <Text style={[styles.permItem, { color: theme.text }]}>{t('team.permScanQR')}</Text>
                    </View>
                    <View style={styles.permRow}>
                      <Check size={14} color={theme.primary} />
                      <Text style={[styles.permItem, { color: theme.text }]}>{t('team.permAwardPoints')}</Text>
                    </View>
                    <View style={styles.permRow}>
                      <Check size={14} color={theme.primary} />
                      <Text style={[styles.permItem, { color: theme.text }]}>{t('team.permViewClients')}</Text>
                    </View>
                    
                    <View style={[styles.permDivider, { backgroundColor: theme.borderLight }]} />
                    
                    <View style={styles.permRow}>
                      <X size={14} color={theme.danger} />
                      <Text style={[styles.permItem, { color: theme.danger }]}>{t('team.permNoProfile')}</Text>
                    </View>
                    <View style={styles.permRow}>
                      <X size={14} color={theme.danger} />
                      <Text style={[styles.permItem, { color: theme.danger }]}>{t('team.permNoSettings')}</Text>
                    </View>
                    <View style={styles.permRow}>
                      <X size={14} color={theme.danger} />
                      <Text style={[styles.permItem, { color: theme.danger }]}>{t('team.permNoTeam')}</Text>
                    </View>
                  </View>
                </View>
              </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  guideContainer: {
    marginBottom: 16,
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
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },

  // ── Header — simple bar (activity style) ──
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 12,
    gap: 10,
  },
  backBtn: { padding: 4 },
  headerTitle: {
    flex: 1,
    fontSize: 28,
    fontWeight: '700',
    marginLeft: 12,
    fontFamily: 'Lexend_700Bold',
    letterSpacing: -0.5,
  },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // â”€â”€ Count banner â”€â”€
  countBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  countText: { fontSize: 14, fontWeight: '600', fontFamily: 'Lexend_600SemiBold' },

  // â”€â”€ Member card â”€â”€
  memberCard: {
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
    overflow: 'hidden',
  },
  memberTop: {
    flexDirection: 'row',
    padding: 14,
    alignItems: 'center',
  },
  memberAvatar: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberInfo: { flex: 1, marginLeft: 12 },
  memberNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  memberName: { fontSize: 15, fontWeight: '600', fontFamily: 'Lexend_600SemiBold' },
  memberEmail: { fontSize: 13, marginTop: 2, fontFamily: 'Lexend_400Regular' },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  badgeText: { fontSize: 11, fontWeight: '600', fontFamily: 'Lexend_600SemiBold' },

  // â”€â”€ Meta row â”€â”€
  metaRow: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderTopWidth: 1,
    gap: 16,
  },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: { fontSize: 12, fontFamily: 'Lexend_400Regular' },

  // â”€â”€ Action chips â”€â”€
  actionsRow: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    paddingBottom: 10,
    gap: 6,
  },
  actionChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    borderRadius: 10,
  },
  actionChipText: { fontSize: 12, fontWeight: '600', fontFamily: 'Lexend_600SemiBold' },

  // â”€â”€ Empty state â”€â”€
  emptyContainer: { alignItems: 'center', paddingTop: 40, paddingHorizontal: 24 },
  emptyIllustration: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginBottom: 6, fontFamily: 'Lexend_700Bold' },
  emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 20, fontFamily: 'Lexend_400Regular' },
  emptyAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 20,
  },
  emptyAddBtnText: { fontSize: 14, fontWeight: '700', color: '#fff', fontFamily: 'Lexend_700Bold' },

  // â”€â”€ Info box (identique Ã  edit-profile) â”€â”€
  infoBox: {
    marginTop: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  infoText: { fontSize: 13, lineHeight: 20, fontFamily: 'Lexend_400Regular' },

  // â”€â”€ Modal â”€â”€
  modalOverlay: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  modalTitle: { flex: 1, fontSize: 18, fontWeight: '700', marginLeft: 12, fontFamily: 'Lexend_700Bold' },

  // â”€â”€ Form (identique Ã  edit-profile) â”€â”€
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 18,
    marginBottom: 6,
    fontFamily: 'Lexend_600SemiBold',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    gap: 10,
  },
  input: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 13,
    fontFamily: 'Lexend_500Medium',
  },

  // â”€â”€ Permissions box â”€â”€
  permBox: {
    marginTop: 24,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  permBoxTitle: { fontSize: 14, fontWeight: '700', marginBottom: 10, fontFamily: 'Lexend_700Bold' },
  permList: { gap: 4 },
  permItem: { fontSize: 13, lineHeight: 20, fontFamily: 'Lexend_400Regular' },
    permRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  permDivider: { height: 1, marginVertical: 6 },
});
