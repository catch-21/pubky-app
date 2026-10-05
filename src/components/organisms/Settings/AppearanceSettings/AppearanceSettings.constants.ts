import type { ThemeOption } from '@/config/theme';

export interface ThemeChoice {
  value: ThemeOption;
  label: string;
  description: string;
}

/** Order matches the Settings → Appearance → Interface radio group */
export const THEME_CHOICES: ThemeChoice[] = [
  {
    value: 'dark',
    label: 'Dark',
    description: 'Always use the dark interface.',
  },
  {
    value: 'light',
    label: 'Light',
    description: 'Always use the light interface.',
  },
  {
    value: 'system',
    label: 'Auto',
    description: 'Follow your browser or system setting.',
  },
];
