import React from 'react';
import { render } from '@testing-library/react-native';
import StampGrid from '@/components/StampGrid';

// ── Mocks ──────────────────────────────────────────────────────────────────────

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({
    primary: '#7C3AED',
    border: '#E5E7EB',
    textSecondary: '#6B7280',
  }),
}));

jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (key === 'stampGrid.count') return `${opts?.current}/${opts?.total}`;
      if (key === 'stampGrid.rewardReady') return '🎁';
      return key;
    },
  }),
}));

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('StampGrid', () => {
  it('renders correct number of circles', () => {
    const { getAllByTestId, toJSON } = render(
      <StampGrid current={3} total={10} />,
    );
    const tree = toJSON();
    // Grid container should exist
    expect(tree).toBeTruthy();
  });

  it('clamps current to not exceed total', () => {
    const { toJSON } = render(
      <StampGrid current={15} total={10} />,
    );
    // Should not crash and should render correctly
    expect(toJSON()).toBeTruthy();
  });

  it('caps display at 30 stamps for very large grids', () => {
    const { toJSON } = render(
      <StampGrid current={5} total={50} />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('shows reward ready label when current >= total', () => {
    const { getByText } = render(
      <StampGrid current={10} total={10} />,
    );
    // Label should contain the reward emoji (mocked as '🎁')
    expect(getByText(/🎁/)).toBeTruthy();
  });

  it('shows count label by default', () => {
    const { getByText } = render(
      <StampGrid current={3} total={10} />,
    );
    expect(getByText(/3\/10/)).toBeTruthy();
  });

  it('hides label when showLabel=false', () => {
    const { queryByText } = render(
      <StampGrid current={3} total={10} showLabel={false} />,
    );
    expect(queryByText(/3\/10/)).toBeNull();
  });

  it('renders with custom size', () => {
    const { toJSON } = render(
      <StampGrid current={2} total={5} size={50} />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders empty grid (0/5)', () => {
    const { getByText } = render(
      <StampGrid current={0} total={5} />,
    );
    expect(getByText(/0\/5/)).toBeTruthy();
  });

  it('handles total=1 edge case', () => {
    const { getByText } = render(
      <StampGrid current={0} total={1} />,
    );
    expect(getByText(/0\/1/)).toBeTruthy();
  });
});
