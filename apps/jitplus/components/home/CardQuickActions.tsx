import { memo, useMemo } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { CalendarPlus, MessageCircle, Navigation, Phone, Store, type LucideIcon } from 'lucide-react-native';
import { getFicheContacts, type FicheContact } from '@jitplus/shared';
import { openDirections, openFirst } from '@jitplus/shared/src/openLinks';
import ActionSheet, { type ActionSheetOption } from '@/components/ActionSheet';
import { Text } from '@/components/AppText';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAppFonts } from '@/utils/fonts';
import { haptic } from '@/utils/haptics';
import { wp, hp, ms, fontSize, radius } from '@/utils/responsive';
import type { LoyaltyCard } from '@/types';

type ContactKey = 'call' | 'whatsapp' | 'directions';
type CardContact = FicheContact & { key: ContactKey };

/** Display order: reaching the shop comes before going there. */
const CONTACT_ORDER: readonly ContactKey[] = ['call', 'whatsapp', 'directions'];
const CONTACT_UI: Record<ContactKey, { Icon: LucideIcon; labelKey: string }> = {
  call: { Icon: Phone, labelKey: 'merchant.call' },
  whatsapp: { Icon: MessageCircle, labelKey: 'merchant.whatsapp' },
  directions: { Icon: Navigation, labelKey: 'merchant.directions' },
};

const SQUARE = ms(48);
/** Height of the row of squares, for callers that keep its place while it is empty. */
export const CARD_ACTIONS_HEIGHT = SQUARE + hp(6) + ms(16);

/** Ways to reach the merchant of a card; empty when the merchant is gone or gave none. */
function getCardContacts(card: LoyaltyCard | null): CardContact[] {
  const merchant = card?.merchant;
  if (!merchant?.id || !merchant.nomBoutique) return [];
  const all = getFicheContacts({
    name: merchant.nomBoutique,
    latitude: merchant.latitude,
    longitude: merchant.longitude,
    socialLinks: merchant.whatsapp ? { whatsapp: merchant.whatsapp } : null,
    stores: merchant.stores ?? [],
  });
  return CONTACT_ORDER.flatMap((key) => {
    const contact = all.find((c) => c.key === key);
    return contact ? [contact as CardContact] : [];
  });
}

function openContact(contact: FicheContact) {
  if (contact.key === 'directions') void openDirections(contact.latitude, contact.longitude, contact.label);
  else void openFirst([contact.url]);
}

/**
 * "Contact" tapped: a single way to reach the merchant opens at once.
 * Returns true when there are several and the caller must show the choice.
 */
export function openCardContact(card: LoyaltyCard): boolean {
  const contacts = getCardContacts(card);
  if (contacts.length === 1) openContact(contacts[0]);
  return contacts.length > 1;
}

interface Props {
  card: LoyaltyCard;
  onBook: (merchantId: string) => void;
  /** Opens the merchant page. */
  onOpen: (merchantId: string) => void;
  onContact: (card: LoyaltyCard) => void;
}

/** Shortcuts under the focused wallet card, as in a banking app: book, merchant page, contact. */
function CardQuickActions({ card, onBook, onOpen, onContact }: Props) {
  const theme = useTheme();
  const { t } = useLanguage();
  const fonts = useAppFonts();
  const hasContact = useMemo(() => getCardContacts(card).length > 0, [card]);

  const merchant = card.merchant;
  if (!merchant?.id || !merchant.nomBoutique) return null;

  const actions: { key: string; Icon: LucideIcon; label: string; onPress: () => void }[] = [
    ...(merchant.canBook
      ? [{ key: 'book', Icon: CalendarPlus, label: t('booking.bookCta'), onPress: () => onBook(card.merchantId) }]
      : []),
    { key: 'open', Icon: Store, label: t('home.cardActionShop'), onPress: () => onOpen(card.merchantId) },
    ...(hasContact
      ? [{ key: 'contact', Icon: Phone, label: t('home.cardActionContact'), onPress: () => onContact(card) }]
      : []),
  ];
  // Every shortcut shares the same neutral surface: none outranks the others.
  const surface = { backgroundColor: theme.bgCard, borderColor: theme.border };

  return (
    <View style={styles.squares}>
      {actions.map(({ key, Icon, label, onPress }) => (
        <Pressable
          key={key}
          onPress={() => { haptic(); onPress(); }}
          style={({ pressed }) => [styles.squareAction, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={`${label}, ${merchant.nomBoutique}`}
        >
          <View style={[styles.square, surface]}>
            <Icon size={ms(20)} color={theme.text} strokeWidth={1.75} />
          </View>
          <Text
            style={[styles.squareLabel, { color: theme.textSecondary, fontFamily: fonts.medium }]}
            numberOfLines={1}
          >
            {label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export default memo(CardQuickActions);

interface SheetProps {
  /** Card whose merchant is being contacted; kept while the sheet slides away. */
  card: LoyaltyCard | null;
  visible: boolean;
  onClose: () => void;
}

/** Choice between calling, WhatsApp and directions, shared by every card of the screen. */
export const CardContactSheet = memo(function CardContactSheet({ card, visible, onClose }: SheetProps) {
  const { t } = useLanguage();
  const options = useMemo<ActionSheetOption[]>(() => getCardContacts(card).map((contact) => {
    const { Icon, labelKey } = CONTACT_UI[contact.key];
    return { key: contact.key, label: t(labelKey), icon: Icon, onPress: () => openContact(contact) };
  }), [card, t]);

  return (
    <ActionSheet
      visible={visible}
      title={card?.merchant?.nomBoutique}
      options={options}
      cancelLabel={t('common.cancel')}
      onClose={onClose}
    />
  );
});

const styles = StyleSheet.create({
  pressed: { opacity: 0.6 },

  squares: { flexDirection: 'row', justifyContent: 'center', gap: wp(8) },
  squareAction: { flex: 1, maxWidth: wp(112), alignItems: 'center', gap: hp(6) },
  square: {
    width: SQUARE, height: SQUARE, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center', justifyContent: 'center',
  },
  squareLabel: { fontSize: fontSize.xs, lineHeight: ms(16), textAlign: 'center' },

});
