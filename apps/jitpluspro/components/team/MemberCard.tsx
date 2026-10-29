import React, { useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Shield, Activity, Trash2, Edit3, Power } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDir } from '@/hooks/useDir';
import { initials as initialsOf } from '@/utils/stampTransaction';
import { font, icon } from '@/constants/design';
import type { TeamMember } from '@/types';

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return initialsOf(parts[0], parts.length > 1 ? parts[parts.length - 1] : null);
}

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
  const dir = useDir();
  const { t } = useLanguage();

  const handleToggle = useCallback(() => onToggle(member), [onToggle, member]);
  const handleEdit = useCallback(() => onEdit(member), [onEdit, member]);
  const handleDelete = useCallback(() => onDelete(member), [onDelete, member]);

  const initials = useMemo(() => getInitials(member.nom), [member.nom]);

  return (
    <View
      style={[
        styles.memberCard,
        {
          backgroundColor: theme.bgCard,
          borderColor: theme.borderLight,
          opacity: member.isActive ? 1 : 0.7,
        },
      ]}
    >
      <View style={[styles.memberTop, { flexDirection: dir.row }]}>
        <View style={[styles.memberAvatar, { backgroundColor: theme.primary + '18' }]}>
          <Text style={[styles.memberAvatarText, { color: theme.primary }]} maxFontSizeMultiplier={1.2}>
            {initials}
          </Text>
        </View>
        <View style={[styles.memberInfo, dir.isRTL ? styles.startGapRtl : styles.startGapLtr]}>
          <View style={[styles.memberNameRow, { flexDirection: dir.row }]}>
            <Text
              style={[styles.memberName, { color: theme.text, textAlign: dir.textAlign }]}
              numberOfLines={1}
              maxFontSizeMultiplier={1.4}
            >
              {member.nom}
            </Text>
            {member.isActive ? (
              <View style={[styles.statusDot, { backgroundColor: theme.success }]} />
            ) : (
              <View style={[styles.badge, { backgroundColor: theme.danger + '15' }]}>
                <Text
                  style={[styles.badgeText, { color: theme.danger }]}
                  maxFontSizeMultiplier={1.3}
                >
                  {t('team.inactive')}
                </Text>
              </View>
            )}
          </View>
          <Text
            style={[styles.memberEmail, { color: theme.textMuted, textAlign: dir.textAlign }]}
            numberOfLines={1}
            maxFontSizeMultiplier={1.4}
          >
            {member.email}
          </Text>
        </View>
      </View>

      <View style={[styles.metaRow, { flexDirection: dir.row, borderTopColor: theme.borderLight }]}>
        <View style={[styles.metaItem, { flexDirection: dir.row }]}>
          <Shield size={13} color={theme.textMuted} strokeWidth={icon.strokeSmall} />
          <Text
            style={[styles.metaText, { color: theme.textMuted }]}
            maxFontSizeMultiplier={1.3}
          >
            {t('team.restrictedAccess')}
          </Text>
        </View>
        <View style={[styles.metaItem, { flexDirection: dir.row }]}>
          <Activity size={13} color={theme.textMuted} strokeWidth={icon.strokeSmall} />
          <Text
            style={[styles.metaText, { color: theme.textMuted }]}
            maxFontSizeMultiplier={1.3}
          >
            {t(member.transactionsCount === 1 ? 'team.transactionsCount_one' : 'team.transactionsCount_other', { count: member.transactionsCount || 0 })}
          </Text>
        </View>
      </View>

      <View style={[styles.actionsRow, { flexDirection: dir.row }]}>
        <TouchableOpacity
          style={[
            styles.actionChip,
            {
              flexDirection: dir.row,
              backgroundColor: member.isActive ? theme.success + '12' : theme.textMuted + '12',
            },
          ]}
          onPress={handleToggle}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={
            member.isActive
              ? t('team.deactivateA11y', { name: member.nom })
              : t('team.activateA11y', { name: member.nom })
          }
        >
          <Power size={15} color={member.isActive ? theme.success : theme.textMuted} strokeWidth={icon.stroke} />
          <Text
            style={[
              styles.actionChipText,
              { color: member.isActive ? theme.success : theme.textMuted },
            ]}
            maxFontSizeMultiplier={1.3}
          >
            {member.isActive ? t('stores.active') : t('stores.inactive')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionChip, { flexDirection: dir.row, backgroundColor: theme.primary + '12' }]}
          onPress={handleEdit}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t('team.editMemberA11y', { name: member.nom })}
        >
          <Edit3 size={15} color={theme.primary} strokeWidth={icon.stroke} />
          <Text
            style={[styles.actionChipText, { color: theme.primary }]}
            maxFontSizeMultiplier={1.3}
          >
            {t('stores.editBtn')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionChip, { flexDirection: dir.row, backgroundColor: theme.danger + '12' }]}
          onPress={handleDelete}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t('team.deleteMemberA11y', { name: member.nom })}
        >
          <Trash2 size={15} color={theme.danger} strokeWidth={icon.stroke} />
          <Text
            style={[styles.actionChipText, { color: theme.danger }]}
            maxFontSizeMultiplier={1.3}
          >
            {t('common.delete')}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
});

export default MemberCard;

const styles = StyleSheet.create({
  startGapLtr: { marginLeft: 12 },
  startGapRtl: { marginRight: 12 },

  memberCard: {
    borderRadius: 16,
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
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberAvatarText: {
    fontSize: 15,
    fontFamily: font.bold,
  },
  memberInfo: { flex: 1 },
  memberNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  memberName: {
    fontSize: 15,
    fontFamily: font.semibold,
    flexShrink: 1,
  },
  memberEmail: { fontSize: 13, marginTop: 2, fontFamily: font.regular },
  statusDot: { width: 8, height: 8, borderRadius: 999 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  badgeText: { fontSize: 11, fontFamily: font.semibold },

  metaRow: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderTopWidth: 1,
    gap: 16,
  },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { fontSize: 12, fontFamily: font.regular },

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
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    minHeight: 40,
  },
  actionChipText: { fontSize: 12, fontFamily: font.semibold },
});
