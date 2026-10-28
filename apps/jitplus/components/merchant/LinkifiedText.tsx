import { memo, useMemo } from 'react';
import type { StyleProp, TextStyle } from 'react-native';
import { Text } from '@/components/AppText';
import { linkifyText } from '@jitplus/shared';
import { haptic } from '@/utils/haptics';
import { openFirst } from '@jitplus/shared/src/openLinks';

interface Props {
  text: string;
  style?: StyleProp<TextStyle>;
  linkColor: string;
  numberOfLines?: number;
}

/** Merchant text where web links, e-mails and phone numbers can be tapped. */
function LinkifiedText({ text, style, linkColor, numberOfLines }: Props) {
  const parts = useMemo(() => linkifyText(text), [text]);
  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {parts.map((part, i) => (part.url ? (
        <Text
          key={i}
          style={{ color: linkColor, textDecorationLine: 'underline' }}
          onPress={() => { haptic(); void openFirst([part.url!]); }}
          accessibilityRole="link"
        >
          {part.text}
        </Text>
      ) : part.text))}
    </Text>
  );
}

export default memo(LinkifiedText);
