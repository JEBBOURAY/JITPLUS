import { StyleSheet, ScrollView, Modal, Pressable } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { ms } from '@/utils/responsive';
import { font } from '@/constants/design';

/**
 * Centered card over a dimmed backdrop, closed by a tap outside or Android Back.
 * Long copy at large text sizes scrolls instead of pushing the buttons off-screen.
 */
export function GameModal({ visible = true, onClose, children }: {
  visible?: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const theme = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.modal, { backgroundColor: theme.bgCard }]} onPress={(e) => e.stopPropagation()} accessibilityViewIsModal>
          <ScrollView contentContainerStyle={styles.content} bounces={false} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Title and body text styles of a GameModal. */
export const gameModalText = StyleSheet.create({
  title: { fontSize: ms(17), fontFamily: font.semibold, textAlign: 'center' },
  body: { fontSize: ms(14), lineHeight: ms(20), fontFamily: font.regular, textAlign: 'center' },
});

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 20 },
  modal: { borderRadius: 24, maxHeight: '85%', overflow: 'hidden' },
  content: { padding: 20, gap: 12 },
});
