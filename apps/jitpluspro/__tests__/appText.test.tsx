import { render } from '@testing-library/react-native';
import { StyleSheet, type StyleProp, type TextStyle } from 'react-native';
import { Text, TextInput } from '@/components/AppText';
import { font } from '@/constants/design';

let mockLocale = 'fr';
jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({ locale: mockLocale, t: (key: string) => key }),
}));

function familyOf(node: { props: { style?: StyleProp<TextStyle> } }) {
  return StyleSheet.flatten(node.props.style)?.fontFamily;
}

describe('AppText (Pro)', () => {
  it('keeps Lexend in French', () => {
    mockLocale = 'fr';
    const { getByText } = render(<Text style={{ fontFamily: font.semibold }}>Bonjour</Text>);
    expect(familyOf(getByText('Bonjour'))).toBe('Lexend_600SemiBold');
  });

  it('swaps each Lexend weight for the same Cairo weight in Arabic', () => {
    mockLocale = 'ar';
    const { getByText } = render(
      <>
        <Text style={{ fontFamily: font.bold }}>عنوان</Text>
        <Text style={{ fontFamily: font.regular }}>نص</Text>
      </>,
    );
    expect(familyOf(getByText('عنوان'))).toBe('Cairo_700Bold');
    expect(familyOf(getByText('نص'))).toBe('Cairo_400Regular');
  });

  it('leaves non-app families (monospace codes) untouched', () => {
    mockLocale = 'ar';
    const { getByText } = render(<Text style={{ fontFamily: 'monospace' }}>AB12</Text>);
    expect(familyOf(getByText('AB12'))).toBe('monospace');
  });

  it('applies the Arabic font to inputs too', () => {
    mockLocale = 'ar';
    const { getByTestId } = render(<TextInput testID="field" style={{ fontFamily: font.medium }} />);
    expect(familyOf(getByTestId('field'))).toBe('Cairo_500Medium');
  });
});
