import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useLanguage } from '@/contexts/LanguageContext';

export default function NotFoundScreen() {
  const { t } = useLanguage();
  return (
    <>
      <Stack.Screen options={{ title: t('notFound.title') }} />
      <View style={styles.container}>
        <Text style={styles.title}>{t('notFound.message')}</Text>

        <Link href="/" style={styles.link}>
          <Text style={styles.linkText}>{t('notFound.backHome')}</Text>
        </Link>
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
    fontSize: 20,
    fontWeight: 'bold',
    fontFamily: 'Lexend_700Bold',
  },
  link: {
    marginTop: 15,
    paddingVertical: 15,
  },
  linkText: {
    fontSize: 14,
    color: '#7C3AED',
    fontFamily: 'Lexend_400Regular',
  },
});
