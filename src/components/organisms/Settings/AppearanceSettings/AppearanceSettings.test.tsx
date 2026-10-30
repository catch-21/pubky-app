import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppearanceStore } from '@/stores/appearance/appearance.store';
import { appearanceInitialState } from '@/stores/appearance/appearance.types';
import { AppearanceSettings } from './AppearanceSettings';

const { mockUseThemePreference, mockSetTheme } = vi.hoisted(() => ({
  mockUseThemePreference: vi.fn(),
  mockSetTheme: vi.fn(),
}));

vi.mock('@/hooks/useThemePreference/useThemePreference', () => ({
  useThemePreference: () => mockUseThemePreference(),
}));

describe('AppearanceSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppearanceStore.setState(appearanceInitialState);
    mockUseThemePreference.mockReturnValue({ theme: 'system', isReady: true, setTheme: mockSetTheme });
  });

  it('renders the Interface section with three options', () => {
    render(<AppearanceSettings />);

    expect(screen.getByText('Interface')).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Interface theme' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Light' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Auto' })).toBeInTheDocument();
  });

  it('marks the current preference as checked', () => {
    mockUseThemePreference.mockReturnValue({ theme: 'light', isReady: true, setTheme: mockSetTheme });

    render(<AppearanceSettings />);

    expect(screen.getByRole('radio', { name: 'Light' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('radio', { name: 'Auto' })).toHaveAttribute('aria-checked', 'false');
  });

  it('defaults to Auto', () => {
    render(<AppearanceSettings />);

    expect(screen.getByRole('radio', { name: 'Auto' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'false');
  });

  it('calls setTheme with dark when Dark is selected', () => {
    render(<AppearanceSettings />);

    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));

    expect(mockSetTheme).toHaveBeenCalledWith('dark');
  });

  it('calls setTheme with light when Light is selected', () => {
    render(<AppearanceSettings />);

    fireEvent.click(screen.getByRole('radio', { name: 'Light' }));

    expect(mockSetTheme).toHaveBeenCalledWith('light');
  });

  it('disables the options until the preference has hydrated', () => {
    mockUseThemePreference.mockReturnValue({ theme: 'system', isReady: false, setTheme: mockSetTheme });

    render(<AppearanceSettings />);

    expect(screen.getByRole('radio', { name: 'Dark' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'Light' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'Auto' })).toBeDisabled();
  });

  describe('Tag colors in Light mode', () => {
    it.each(['light', 'system'])('is shown when the theme is %s', (theme) => {
      mockUseThemePreference.mockReturnValue({ theme, isReady: true, setTheme: mockSetTheme });

      render(<AppearanceSettings />);

      expect(screen.getByRole('radiogroup', { name: 'Tag colors in Light mode' })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: 'Saturated' })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: 'Pastel' })).toBeInTheDocument();
    });

    it('is hidden when the theme is dark', () => {
      mockUseThemePreference.mockReturnValue({ theme: 'dark', isReady: true, setTheme: mockSetTheme });

      render(<AppearanceSettings />);

      expect(screen.queryByRole('radiogroup', { name: 'Tag colors in Light mode' })).not.toBeInTheDocument();
      expect(screen.queryByRole('radio', { name: 'Pastel' })).not.toBeInTheDocument();
    });

    it('defaults to Pastel', () => {
      render(<AppearanceSettings />);

      expect(screen.getByRole('radio', { name: 'Pastel' })).toHaveAttribute('aria-checked', 'true');
      expect(screen.getByRole('radio', { name: 'Saturated' })).toHaveAttribute('aria-checked', 'false');
    });

    it('stores the choice when another option is selected', () => {
      render(<AppearanceSettings />);

      fireEvent.click(screen.getByRole('radio', { name: 'Saturated' }));

      expect(useAppearanceStore.getState().tagLightPalette).toBe('saturated');
      expect(screen.getByRole('radio', { name: 'Saturated' })).toHaveAttribute('aria-checked', 'true');

      fireEvent.click(screen.getByRole('radio', { name: 'Pastel' }));

      expect(useAppearanceStore.getState().tagLightPalette).toBe('pastel');
    });

    it('disables the options until the preference has hydrated', () => {
      mockUseThemePreference.mockReturnValue({ theme: 'system', isReady: false, setTheme: mockSetTheme });

      render(<AppearanceSettings />);

      expect(screen.getByRole('radio', { name: 'Saturated' })).toBeDisabled();
      expect(screen.getByRole('radio', { name: 'Pastel' })).toBeDisabled();
    });
  });
});
