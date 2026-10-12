import { render } from '@testing-library/react-native';
import PlvPoster, {
  PLV_TEMPLATES,
  contrastRatio,
  readableBrand,
  type PlvTemplateId,
} from '@/components/plv/PlvPoster';
import type { PlvProgram } from '@/components/plv/usePlvProgram';

jest.mock('react-native-qrcode-svg', () => () => null);

const t = ((key: string) => key) as unknown as Parameters<typeof PlvPoster>[0]['t'];

const program: PlvProgram = {
  slots: 8,
  earnLine: '1 tampon tous les 20 DH d\'achat',
  rewardHeadline: '8 tampons = Café offert',
  rewardShort: 'Dès 8 tampons : Café offert',
  otherRewards: [{ title: 'Menu', cost: 12, label: '12 tampons · Menu' }],
  wheelLine: 'Roue de la chance : tentez votre chance dès 100 DH d\'achat',
  validityLine: 'Tampons valables 90 jours',
};

function renderPoster(template: PlvTemplateId, p: PlvProgram = program, brandColor?: string) {
  return render(
    <PlvPoster template={template} width={330} merchantName="Café Atlas" brandColor={brandColor} program={p} t={t} />,
  );
}

describe('readableBrand', () => {
  it.each(['#FFE600', '#F5F5F5', '#22C55E', '#38BDF8', '#7C3AED', 'not-a-color', null])(
    'keeps white text readable on %s',
    (brand) => {
      expect(contrastRatio(readableBrand(brand), '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    },
  );

  it('leaves an already dark brand colour untouched', () => {
    expect(readableBrand('#1E3A8A')).toBe('#1E3A8A');
  });
});

describe('PlvPoster', () => {
  it.each(PLV_TEMPLATES.map((d) => d.id))('renders the %s template with the programme', (id) => {
    const { getAllByText } = renderPoster(id);
    expect(getAllByText(program.earnLine).length).toBeGreaterThan(0);
  });

  it('switches from counter to reward without losing the poster', () => {
    const { rerender, getByText } = renderPoster('counter');
    rerender(<PlvPoster template="reward" width={330} merchantName="Café Atlas" program={program} t={t} />);
    expect(getByText(program.rewardHeadline)).toBeTruthy();
    expect(getByText(program.wheelLine as string)).toBeTruthy();
    expect(getByText('12 tampons · Menu')).toBeTruthy();
  });

  it('draws one track slot per stamp on the reward template', () => {
    const { UNSAFE_root } = renderPoster('reward', { ...program, wheelLine: null });
    const slots = UNSAFE_root.findAll(
      (n) => typeof n.type === 'string' && n.props.style && JSON.stringify(n.props.style).includes('rgba(255,255,255,0.75)'),
    );
    expect(slots).toHaveLength(8);
  });

  it('does not draw a lone gift dot for a 1-stamp card', () => {
    const { UNSAFE_root } = renderPoster('reward', { ...program, slots: 1 });
    const slots = UNSAFE_root.findAll(
      (n) => typeof n.type === 'string' && n.props.style && JSON.stringify(n.props.style).includes('rgba(255,255,255,0.75)'),
    );
    expect(slots).toHaveLength(0);
  });

  it('keeps a single extra reward when the wheel is shown', () => {
    const { queryByText } = renderPoster('reward', {
      ...program,
      otherRewards: [
        { title: 'Menu', cost: 12, label: '12 tampons · Menu' },
        { title: 'Dessert', cost: 15, label: '15 tampons · Dessert' },
      ],
    });
    expect(queryByText('12 tampons · Menu')).toBeTruthy();
    expect(queryByText('15 tampons · Dessert')).toBeNull();
  });

  it.each(PLV_TEMPLATES.map((d) => d.id))('shows only the merchant name on the %s template', (id) => {
    const { getByText, queryByText } = renderPoster(id);
    expect(getByText('Café Atlas')).toBeTruthy();
    expect(queryByText(/JitPlus\s*×/)).toBeNull();
  });

  it('renders every template with a very light brand colour', () => {
    PLV_TEMPLATES.forEach((d) => {
      expect(() => renderPoster(d.id, program, '#FFFFFF')).not.toThrow();
    });
  });
});
