import { memo, useCallback, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDir } from '@/hooks/useDir';
import { font } from '@/constants/design';
import { radius } from '@/utils/responsive';

// Must match backend DTO validation.
export const MESSAGE_LIMITS = {
  title: 100,
  body: 500,
} as const;
// A phone shows about this much of a notification title before cutting it.
const TITLE_VISIBLE_CHARS = 40;

export type MessageField = keyof typeof MESSAGE_LIMITS;

const charCountColor = (len: number, max: number, muted: string, warn: string, danger: string) =>
  len >= max ? danger : len >= max * 0.85 ? warn : muted;

// Focus state stays local so typing does not re-render the whole screen.
const Field = memo(function Field({
  name,
  label,
  value,
  onChangeField,
  placeholder,
  multiline,
  warning,
  inputRef,
  onSubmitEditing,
}: {
  name: MessageField;
  label: string;
  value: string;
  onChangeField: (name: MessageField, value: string) => void;
  placeholder: string;
  multiline?: boolean;
  /** Advice shown under the field, e.g. a title long enough to be cut. */
  warning?: string;
  inputRef: Ref<TextInput>;
  /** Single-line only: keeps the keyboard open and runs this on "Next". */
  onSubmitEditing?: () => void;
}) {
  const theme = useTheme();
  const { row, textAlign } = useDir();
  const [focused, setFocused] = useState(false);
  const maxLength = MESSAGE_LIMITS[name];
  return (
    <View style={styles.field}>
      <View style={[styles.fieldLabelRow, { flexDirection: row }]}>
        <Text style={[styles.fieldLabel, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.4}>
          {label}
        </Text>
        <Text
          style={[styles.charCount, { color: charCountColor(value.length, maxLength, theme.textMuted, theme.warning, theme.danger) }]}
          maxFontSizeMultiplier={1.4}
          accessibilityLiveRegion="polite"
        >
          {value.length}/{maxLength}
        </Text>
      </View>
      <View
        style={[
          styles.inputWrapper,
          { backgroundColor: theme.bgInput, borderColor: focused ? theme.primary : theme.border },
          focused && styles.inputFocused,
        ]}
      >
        <TextInput
          ref={inputRef}
          style={[styles.input, { color: theme.text, textAlign }, multiline && styles.inputMultiline]}
          value={value}
          onChangeText={(v) => onChangeField(name, v)}
          placeholder={placeholder}
          placeholderTextColor={theme.textMuted}
          multiline={multiline}
          maxLength={maxLength}
          returnKeyType={multiline ? 'default' : 'next'}
          submitBehavior={onSubmitEditing && !multiline ? 'submit' : undefined}
          onSubmitEditing={onSubmitEditing}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          accessibilityLabel={label}
          maxFontSizeMultiplier={1.4}
        />
      </View>
      {warning ? (
        <Text style={[styles.fieldWarning, { color: theme.warning, textAlign }]} maxFontSizeMultiplier={1.4} accessibilityLiveRegion="polite">
          {warning}
        </Text>
      ) : null}
    </View>
  );
});

export interface ComposeFieldsHandle {
  /** Puts the cursor in the first field still empty. */
  focusMissing: () => void;
}

interface ComposeFieldsProps {
  title: string;
  body: string;
  onChangeField: (name: MessageField, value: string) => void;
  ref?: Ref<ComposeFieldsHandle>;
}

/** Title and content of a notification, edited in place on the screen. */
function ComposeFields({ title, body, onChangeField, ref }: ComposeFieldsProps) {
  const { t } = useLanguage();
  const titleRef = useRef<TextInput>(null);
  const bodyRef = useRef<TextInput>(null);
  const hasTitle = !!title.trim();

  const focusBody = useCallback(() => bodyRef.current?.focus(), []);
  useImperativeHandle(ref, () => ({
    focusMissing: () => (hasTitle ? bodyRef : titleRef).current?.focus(),
  }), [hasTitle]);

  return (
    <View style={styles.fields}>
      <Field
        name="title"
        label={t('messages.messageTitle')}
        value={title}
        onChangeField={onChangeField}
        placeholder={t('messages.messageTitlePlaceholder')}
        warning={title.length > TITLE_VISIBLE_CHARS ? t('messages.titleTooLong', { max: TITLE_VISIBLE_CHARS }) : undefined}
        inputRef={titleRef}
        onSubmitEditing={focusBody}
      />
      <Field
        name="body"
        label={t('messages.messageBody')}
        value={body}
        onChangeField={onChangeField}
        placeholder={t('messages.messageBodyPlaceholder')}
        multiline
        inputRef={bodyRef}
      />
    </View>
  );
}

export default memo(ComposeFields);

const styles = StyleSheet.create({
  fields: { marginTop: 12 },

  field: { marginBottom: 12 },
  fieldLabelRow: { alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  fieldLabel: { fontSize: 13, fontFamily: font.semibold },
  charCount: { fontSize: 11, fontFamily: font.medium },
  inputWrapper: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 14 },
  fieldWarning: { fontSize: 12, lineHeight: 16, marginTop: 6, fontFamily: font.medium },
  inputFocused: { borderWidth: 1.5 },
  input: { fontSize: 15, paddingVertical: 12, fontFamily: font.medium },
  // Capped so a long message scrolls inside the field instead of stretching the page.
  inputMultiline: { textAlignVertical: 'top', minHeight: 64, maxHeight: 96 },
});
