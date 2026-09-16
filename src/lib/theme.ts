/** The visitor's stored preference. `system` is a mode, not a theme. */
export const THEME_MODES = ['system', 'light', 'dark'] as const;

export type ThemeMode = (typeof THEME_MODES)[number];

/** What a mode resolves to, and what the `light`/`dark` class on `<html>` holds. */
export type Theme = 'light' | 'dark';

export const THEME_KEY = 'theme-preference';

/** The `<meta name="theme-color">` values, matching `--color-parchment`. */
export const THEME_COLOR: Record<Theme, string> = {
  light: '#fefefe',
  dark: '#1a1a1a',
};

function isThemeMode(value: unknown): value is ThemeMode {
  return THEME_MODES.includes(value as ThemeMode);
}

export function parseThemeMode(value: unknown): ThemeMode {
  return isThemeMode(value) ? value : 'system';
}

export function nextThemeMode(mode: ThemeMode): ThemeMode {
  return THEME_MODES[(THEME_MODES.indexOf(mode) + 1) % THEME_MODES.length]!;
}

export function resolveTheme(mode: ThemeMode, systemPrefersDark: boolean): Theme {
  if (mode !== 'system') return mode;

  return systemPrefersDark ? 'dark' : 'light';
}
