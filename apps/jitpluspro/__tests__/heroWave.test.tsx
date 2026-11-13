import { render } from '@testing-library/react-native';
import { Animated } from 'react-native';
import HeroWave from '@/components/home/HeroWave';

describe('Accueil hero wave', () => {
  afterEach(() => jest.restoreAllMocks());

  it('renders a static edge, without a looping drift', () => {
    const loop = jest.spyOn(Animated, 'loop');
    const { toJSON } = render(<HeroWave width={360} height={30} color="#fff" />);
    expect(toJSON()).toBeTruthy();
    expect(loop).not.toHaveBeenCalled();
  });
});
