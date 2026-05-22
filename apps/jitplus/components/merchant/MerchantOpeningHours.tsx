import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import { Clock } from 'lucide-react-native';
import { merchantStyles as styles } from './merchantStyles';
import { getMerchantAccent } from '@/utils/merchantAccent';
import type { Merchant, OpeningHours } from '@/types';

const DAYS: Array<keyof OpeningHours> = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

interface Props {
  merchant: Merchant;
  theme: { bgCard: string; text: string; textSecondary: string; textMuted: string };
  t: (key: string, opts?: Record<string, unknown>) => string;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function MerchantOpeningHours({ merchant, theme, t }: Props) {
  const hours = merchant.openingHours;
  const hasAny = !!hours && DAYS.some((d) => hours[d]);
  const todayKey = useMemo<keyof OpeningHours>(() => {
    // JS Date: 0 = Sunday, 1 = Monday, ...
    const idx = new Date().getDay();
    return (DAYS[(idx + 6) % 7]);
  }, []);

  const todayStatus = useMemo(() => {
    if (!hours) return null;
    const day = hours[todayKey];
    if (!day || day.closed || !day.slots || day.slots.length === 0) {
      return { open: false, label: t('merchant.closedNow') };
    }
    const now = new Date();
    const cur = now.getHours() * 60 + now.getMinutes();
    const isOpen = day.slots.some((s) => cur >= toMinutes(s.open) && cur <= toMinutes(s.close));
    return { open: isOpen, label: isOpen ? t('merchant.openNow') : t('merchant.closedNow') };
  }, [hours, todayKey, t]);

  if (!hasAny) return null;
  const accent = getMerchantAccent(merchant.themeColor);

  return (
    <View style={[styles.hoursCard, { backgroundColor: theme.bgCard }]}>
      <View style={styles.hoursHeader}>
        <View style={[styles.hoursIconBadge, { backgroundColor: `${accent}15` }]}>
          <Clock size={18} color={accent} strokeWidth={2} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>{t('merchant.hoursTitle')}</Text>
          {todayStatus && (
            <Text style={[styles.hoursStatus, { color: todayStatus.open ? '#10b981' : '#ef4444' }]}>
              {todayStatus.label}
            </Text>
          )}
        </View>
      </View>
      <View style={styles.hoursList}>
        {DAYS.map((d) => {
          const day = hours?.[d];
          const isToday = d === todayKey;
          const label = day && !day.closed && day.slots && day.slots.length > 0
            ? day.slots.map((s) => `${s.open} – ${s.close}`).join(', ')
            : t('merchant.dayClosed');
          return (
            <View key={d} style={styles.hoursRow}>
              <Text style={[styles.hoursDay, { color: isToday ? accent : theme.textSecondary, fontWeight: isToday ? '700' : '500' }]}>
                {t(`merchant.days.${d}`)}
              </Text>
              <Text style={[styles.hoursValue, { color: isToday ? accent : theme.text, fontWeight: isToday ? '700' : '500' }]}>
                {label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export default React.memo(MerchantOpeningHours);
