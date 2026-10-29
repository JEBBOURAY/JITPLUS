import React from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '@/components/AppText';
import { palette } from '@/contexts/ThemeContext';
import type { LuckyWheelTicket } from '@/types';
import type { TicketGroup } from '@/utils/luckyWheel';
import { hp, ms, wp, fontSize as FS } from '@/utils/responsive';
import MerchantLogo from '../MerchantLogo';

interface AppFonts { regular: string; medium: string; semibold: string; bold: string }

interface Props {
  groups: TicketGroup<LuckyWheelTicket>[];
  selectedId: string | undefined;
  disabled: boolean;
  fonts: AppFonts;
  t: (key: string, options?: Record<string, unknown>) => string;
  onSelect: (campaignId: string) => void;
}

/** One chip per wheel when the client holds tickets for several merchants or campaigns. */
export default React.memo(function CampaignPicker({ groups, selectedId, disabled, fonts, t, onSelect }: Props) {
  return (
    <View style={styles.root}>
      <Text style={[styles.label, { fontFamily: fonts.medium }]}>{t('luckyWheel.chooseWheel')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {groups.map((g) => {
          const campaign = g.tickets[0].campaign;
          const active = g.campaignId === selectedId;
          const name = campaign.merchant?.nom || campaign.name;
          return (
            <TouchableOpacity
              key={g.campaignId}
              onPress={() => onSelect(g.campaignId)}
              disabled={disabled}
              activeOpacity={0.8}
              style={[styles.chip, active && styles.chipActive, disabled && !active && styles.chipDisabled]}
              accessibilityRole="button"
              accessibilityState={{ selected: active, disabled }}
              accessibilityLabel={`${name}, ${campaign.name}, ${g.tickets.length}`}
            >
              <MerchantLogo logoUrl={campaign.merchant?.logoUrl} merchantName={name} style={styles.logo} />
              <Text style={[styles.name, { fontFamily: active ? fonts.semibold : fonts.medium }]} numberOfLines={1}>
                {name}
              </Text>
              <View style={[styles.count, active && styles.countActive]}>
                <Text style={[styles.countText, active && styles.countTextActive, { fontFamily: fonts.bold }]}>
                  {g.tickets.length}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
});

const styles = StyleSheet.create({
  root: { alignSelf: 'stretch', marginBottom: hp(14) },
  label: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: FS.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: wp(20),
    marginBottom: hp(8),
  },
  row: { paddingHorizontal: wp(20), gap: ms(8) },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ms(8),
    paddingLeft: ms(5),
    paddingRight: ms(6),
    paddingVertical: ms(5),
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    maxWidth: wp(210),
  },
  chipActive: { backgroundColor: 'rgba(251,191,36,0.14)', borderColor: 'rgba(251,191,36,0.6)' },
  chipDisabled: { opacity: 0.45 },
  logo: { width: ms(26), height: ms(26), borderRadius: ms(13), backgroundColor: '#fff' },
  name: { color: '#fff', fontSize: FS.sm, flexShrink: 1 },
  count: {
    minWidth: ms(22),
    height: ms(22),
    borderRadius: ms(11),
    paddingHorizontal: ms(6),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  countActive: { backgroundColor: palette.goldLight },
  countText: { color: '#fff', fontSize: FS.xs },
  countTextActive: { color: '#3B1D06' },
});
