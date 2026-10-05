import type { ThemeOption } from '@/config/theme';

export interface UseThemePreferenceResult {
  /** The user's stored preference (`dark` | `light` | `system`). Falls back to the default until hydrated. */
  theme: ThemeOption;
  /** False during SSR and the first client render, when the stored preference is not yet known. */
  isReady: boolean;
  setTheme: (theme: ThemeOption) => void;
}
