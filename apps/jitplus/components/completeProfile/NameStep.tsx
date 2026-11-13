import { memo } from 'react';
import type { RefObject } from 'react';
import { View } from 'react-native';
import { User, CheckCircle2, Info } from 'lucide-react-native';
import { Text, TextInput } from '@/components/AppText';
import { palette } from '@/contexts/ThemeContext';
import type { ThemeColors } from '@/contexts/ThemeContext';
import { s, ICON_16, ICON_18 } from './styles';
import type { TranslateFn } from './types';
import { firstChar } from '@/utils/profileCompletion';

interface NameStepProps {
  theme: ThemeColors;
  t: TranslateFn;
  prenom: string;
  nom: string;
  prenomTrimmed: string;
  nomTrimmed: string;
  prenomOk: boolean;
  nomOk: boolean;
  canNext: boolean;
  nomRef: RefObject<TextInput | null>;
  onPrenomChange: (v: string) => void;
  onNomChange: (v: string) => void;
  onNext: () => void;
}

export const NameStep = memo(function NameStep({
  theme, t, prenom, nom, prenomTrimmed, nomTrimmed, prenomOk, nomOk, canNext,
  nomRef, onPrenomChange, onNomChange, onNext,
}: NameStepProps) {
  return (
    <View>
      {prenomTrimmed.length > 0 && (
        <View style={s.avatarRow}>
          <View style={[s.avatar, { backgroundColor: palette.violet }]}>
            <Text style={s.initials}>
              {(firstChar(prenomTrimmed) + firstChar(nomTrimmed)).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.avatarName, { color: theme.text }]} numberOfLines={1}>
              {prenomTrimmed} {nomTrimmed}
            </Text>
            <Text style={[s.avatarLabel, { color: theme.textMuted }]}>
              {t('completeProfile.profilePreview')}
            </Text>
          </View>
        </View>
      )}

      <View style={s.field}>
        <Text style={[s.label, { color: theme.textSecondary }]}>{t('completeProfile.firstName')}</Text>
        <View style={[s.inputWrap, {
          backgroundColor: theme.bgInput,
          borderColor: prenomOk ? palette.violet : theme.border,
        }]}>
          <User size={ICON_18} color={prenomOk ? palette.violet : theme.textMuted} strokeWidth={2} />
          <TextInput
            style={[s.input, { color: theme.text }]}
            placeholder={t('completeProfile.firstNamePlaceholder')}
            placeholderTextColor={theme.textMuted}
            value={prenom}
            onChangeText={onPrenomChange}
            autoFocus
            autoCapitalize="words"
            maxLength={50}
            returnKeyType="next"
            onSubmitEditing={() => nomRef.current?.focus()}
          />
          {prenomOk && <CheckCircle2 size={ICON_16} color={palette.violet} strokeWidth={2} />}
        </View>
      </View>

      <View style={s.field}>
        <Text style={[s.label, { color: theme.textSecondary }]}>{t('completeProfile.lastName')}</Text>
        <View style={[s.inputWrap, {
          backgroundColor: theme.bgInput,
          borderColor: nomOk ? palette.violet : theme.border,
        }]}>
          <User size={ICON_18} color={nomOk ? palette.violet : theme.textMuted} strokeWidth={2} />
          <TextInput
            ref={nomRef}
            style={[s.input, { color: theme.text }]}
            placeholder={t('completeProfile.lastNamePlaceholder')}
            placeholderTextColor={theme.textMuted}
            value={nom}
            onChangeText={onNomChange}
            autoCapitalize="words"
            maxLength={50}
            returnKeyType="done"
            onSubmitEditing={canNext ? onNext : undefined}
          />
          {nomOk && <CheckCircle2 size={ICON_16} color={palette.violet} strokeWidth={2} />}
        </View>
      </View>

      <View style={[s.infoBox, { backgroundColor: theme.bgInput }]}>
        <Info size={ICON_16} color={theme.textSecondary} strokeWidth={1.5} />
        <Text style={[s.infoText, { color: theme.textMuted }]}>
          {t('completeProfile.namePrivacyHint')}
        </Text>
      </View>
    </View>
  );
});
