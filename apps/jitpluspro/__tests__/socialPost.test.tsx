import { render } from '@testing-library/react-native';
import SocialPost, { SOCIAL_SLIDES } from '@/components/social/SocialPost';
import type { PlvProgram } from '@/components/plv/usePlvProgram';
import i18n from '@/i18n';

jest.mock('react-native-qrcode-svg', () => () => null);

type T = Parameters<typeof SocialPost>[0]['t'];

const program: PlvProgram = {
  slots: 10,
  earnLine: '1 tampon tous les 50 DH d\'achat',
  rewardHeadline: '10 tampons = Parfum offert',
  rewardShort: 'Dès 10 tampons : Parfum offert',
  otherRewards: [],
  wheelLine: null,
  validityLine: null,
};

const perks = { games: true, deals: true };

const tFor = (locale: string): T => (scope, options) => i18n.t(scope, { ...options, locale });

describe('SocialPost', () => {
  it.each(['fr', 'en', 'ar'])('renders every slide in %s without a missing translation', (locale) => {
    for (const slide of SOCIAL_SLIDES) {
      const { queryByText, getByText } = render(
        <SocialPost slide={slide} width={360} merchantName="izy parfums" program={program} perks={perks} t={tFor(locale)} rtl={locale === 'ar'} />,
      );
      expect(queryByText(/missing|home\.socialPost/)).toBeNull();
      expect(getByText(`${SOCIAL_SLIDES.indexOf(slide) + 1}/${SOCIAL_SLIDES.length}`)).toBeTruthy();
    }
  });

  it('opens on the store name and prints its real programme', () => {
    const partner = render(
      <SocialPost slide="partner" width={360} merchantName="izy parfums" program={program} perks={perks} t={tFor('fr')} />,
    );
    expect(partner.getByText(/izy parfums/)).toBeTruthy();

    const reward = render(
      <SocialPost slide="reward" width={360} merchantName="izy parfums" program={program} perks={perks} t={tFor('fr')} />,
    );
    expect(reward.getByText(program.rewardHeadline)).toBeTruthy();
    expect(reward.getByText(program.earnLine)).toBeTruthy();
    expect(reward.getByText('· 10/10')).toBeTruthy();
  });

  it('always sells the four perks of the app, and only names the games and deals this store runs', () => {
    const props = { width: 360, merchantName: 'izy parfums', program, t: tFor('fr') };
    const app = render(<SocialPost slide="perks" {...props} perks={{ games: false, deals: false }} />);
    for (const title of ['Cadeaux', 'Bons plans', 'Jeux', 'Notifications']) expect(app.getByText(title)).toBeTruthy();

    const store = render(<SocialPost slide="partner" {...props} perks={{ games: false, deals: false }} />);
    expect(store.queryByText('Jeux')).toBeNull();
    expect(store.queryByText('Offres')).toBeNull();
    expect(store.getByText('Cadeaux')).toBeTruthy();
  });

  it('closes on the reasons to install the app', () => {
    const cta = render(<SocialPost slide="cta" width={360} merchantName="izy parfums" program={program} perks={perks} t={tFor('fr')} />);
    expect(cta.getByText('Gratuite')).toBeTruthy();
    expect(cta.getByText('Toutes vos cartes dans une app')).toBeTruthy();
  });

  it('renders the story format taller than the post', () => {
    const story = render(
      <SocialPost slide="cta" format="story" width={360} merchantName="izy parfums" city="El Jadida" program={program} perks={perks} t={tFor('fr')} />,
    );
    expect(story.getByText('El Jadida')).toBeTruthy();
    expect(JSON.stringify(story.toJSON())).toContain('"height":640');
  });

  it('shows the store initial instead of a placeholder logo when the store has none', () => {
    const partner = render(
      <SocialPost slide="partner" width={360} merchantName="izy parfums" program={program} perks={perks} t={tFor('fr')} />,
    );
    expect(partner.getByText('I')).toBeTruthy();
  });
});
