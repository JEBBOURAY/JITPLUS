import { render, fireEvent } from '@testing-library/react-native';
import ToolsGrid, { type Tool } from '@/components/home/ToolsGrid';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({
    bgCard: '#fff', border: '#e2e8f0', text: '#0f172a', textMuted: '#64748b', danger: '#dc2626',
    primary: '#7c3aed', success: '#10b981',
  }),
}));
jest.mock('@/hooks/useDir', () => ({
  useDir: () => ({ row: 'row', textAlign: 'left', alignStart: 'flex-start', isRTL: false }),
}));

const openGuide = jest.fn();
const tools: Tool[] = [
  { key: 'guide', label: 'Démarrage', hint: 'Guide pas à pas', image: 1, onPress: openGuide },
  { key: 'loyalty', label: 'Fidélité', hint: 'À configurer', image: 2, route: '/settings', alert: true },
  { key: 'games', label: 'Jeux', hint: 'Roue et grattage', image: 3, route: '/games' },
];

describe('Accueil tools grid', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows every tool with its explanation under the title', () => {
    const { getByRole, getAllByRole, getByText } = render(<ToolsGrid title="Mes outils" tools={tools} />);
    expect(getByRole('header', { name: 'Mes outils' })).toBeTruthy();
    expect(getAllByRole('button')).toHaveLength(3);
    expect(getByText('Roue et grattage')).toBeTruthy();
  });

  it('opens the route of a tool', () => {
    const { getByRole } = render(<ToolsGrid title="Mes outils" tools={tools} />);
    fireEvent.press(getByRole('button', { name: 'Jeux, Roue et grattage' }));
    expect(mockPush).toHaveBeenCalledWith('/games');
  });

  it('runs the action of a tool instead of navigating', () => {
    const { getByRole } = render(<ToolsGrid title="Mes outils" tools={tools} />);
    fireEvent.press(getByRole('button', { name: 'Démarrage, Guide pas à pas' }));
    expect(openGuide).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('turns the explanation red when something is left to do', () => {
    const { getByText } = render(<ToolsGrid title="Mes outils" tools={tools} />);
    expect(getByText('À configurer')).toHaveStyle({ color: '#dc2626' });
    expect(getByText('Roue et grattage')).toHaveStyle({ color: '#64748b' });
  });

  it('shows the steps done on a tool with a progress, until it is complete', () => {
    const withProgress = (done: number): Tool[] => [
      { ...tools[0], hint: 'Il reste des étapes', progress: { done, total: 7 } },
    ];
    const pending = render(<ToolsGrid title="Mes outils" tools={withProgress(4)} />);
    expect(pending.getByText('4/7', { includeHiddenElements: true })).toBeTruthy();
    expect(pending.getByText('Il reste des étapes')).toHaveStyle({ color: '#7c3aed' });
    pending.unmount();

    const complete = render(<ToolsGrid title="Mes outils" tools={withProgress(7)} />);
    expect(complete.queryByText('7/7', { includeHiddenElements: true })).toBeNull();
    expect(complete.getByText('Il reste des étapes')).toHaveStyle({ color: '#64748b' });
  });

  it('shows no count on a tool without a progress', () => {
    const { queryByText } = render(<ToolsGrid title="Mes outils" tools={tools} />);
    expect(queryByText(/^\d+\/\d+$/, { includeHiddenElements: true })).toBeNull();
  });
});
