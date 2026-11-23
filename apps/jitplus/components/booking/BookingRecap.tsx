import type { ComponentProps } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '@/components/AppText';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAppFonts } from '@/utils/fonts';
import { BOOKING_NOTE_MAX } from '@/utils/booking';
import { hp, ms, wp } from '@/utils/responsive';
import BookingRecapCard from './BookingRecapCard';
import { BookingBottomBar, BookingPrimaryButton, BookingSectionTitle, bookingStyles } from './BookingParts';

interface Props {
  booking: ComponentProps<typeof BookingRecapCard>;
  note: string;
  onChangeNote: (note: string) => void;
  /** Hours before the start when the client can still cancel; 0 = any time. */
  cancelDeadlineHours: number;
  /** The shop accepts each request: the button sends a request, not a booking. */
  needsApproval: boolean;
  submitting: boolean;
  onConfirm: () => void;
}

/** Step 2 of the booking: the recap, a note for the shop, the cancel policy and the confirm button. */
export default function BookingRecap({
  booking, note, onChangeNote, cancelDeadlineHours, needsApproval, submitting, onConfirm,
}: Props) {
  const theme = useTheme();
  const fonts = useAppFonts();
  const { t } = useLanguage();
  return (
    <KeyboardAvoidingView style={bookingStyles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={bookingStyles.scrollBody} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <BookingRecapCard {...booking} />

        <BookingSectionTitle label={t('booking.noteLabel')} />
        <TextInput
          style={[styles.noteInput, { color: theme.text, backgroundColor: theme.bgInput, borderColor: theme.border, fontFamily: fonts.regular, textAlign: 'left' }]}
          value={note}
          onChangeText={onChangeNote}
          placeholder={t('booking.notePlaceholder')}
          placeholderTextColor={theme.textMuted}
          maxLength={BOOKING_NOTE_MAX}
          multiline
          textAlignVertical="top"
        />
        <View style={styles.noteFooter}>
          <Text style={[styles.noteHint, { color: theme.textMuted, fontFamily: fonts.regular }]}>{t('booking.noteHint')}</Text>
          <Text style={[styles.noteCount, { color: theme.textMuted, fontFamily: fonts.medium }]}>{note.length}/{BOOKING_NOTE_MAX}</Text>
        </View>

        <Text style={[styles.policy, { color: theme.textSecondary, fontFamily: fonts.regular }]}>
          {cancelDeadlineHours > 0 ? t('booking.cancelPolicy', { hours: cancelDeadlineHours }) : t('booking.cancelPolicyAnytime')}
        </Text>
        {needsApproval && (
          <Text style={[styles.policy, { color: theme.textSecondary, fontFamily: fonts.regular }]}>{t('booking.requestHint')}</Text>
        )}
      </ScrollView>

      <BookingBottomBar>
        <BookingPrimaryButton
          label={t(needsApproval ? 'booking.sendRequest' : 'booking.confirm')}
          onPress={onConfirm}
          busy={submitting}
        />
      </BookingBottomBar>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  noteInput: { minHeight: hp(90), borderWidth: 1, borderRadius: 14, padding: wp(12), fontSize: ms(14) },
  noteFooter: { flexDirection: 'row', gap: wp(10), alignItems: 'flex-start' },
  noteHint: { flex: 1, fontSize: ms(12), lineHeight: ms(17), textAlign: 'left' },
  noteCount: { fontSize: ms(12), fontVariant: ['tabular-nums'] },
  policy: { fontSize: ms(13), lineHeight: ms(19), marginTop: hp(8), textAlign: 'left' },
});
