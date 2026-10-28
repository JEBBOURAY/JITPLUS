import { Stack, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { ActionButton } from '@/components/ui/ActionButton';
import { typography } from '@/constants/design';

export default function NotFoundScreen() {
  const { t } = useLanguage();
  const theme = useTheme();
  const router = useRouter();
  return (
    <>
      <Stack.Screen options={{ title: t('notFound.title') }} />
      <View style={[styles.container, { backgroundColor: theme.bg }]}>
        <Text style={[styles.title, { color: theme.text }]}>{t('notFound.message')}</Text>
        <ActionButton
          label={t('notFound.backHome')}
          onPress={() => router.navigate('/')}
          variant="ghost"
          style={styles.button}
          labelStyle={styles.buttonText}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    ...typography.title,
    textAlign: 'center',
  },
  button: {
    marginTop: 24,
    minWidth: 200,
  },
  buttonText: {
    color: palette.violet,
  },
});
