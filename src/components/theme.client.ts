import { THEME_COLOR, THEME_KEY, nextThemeMode, parseThemeMode, resolveTheme } from '../lib/theme';
import type { ThemeMode } from '../lib/theme';

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

/** Storage throws rather than returning null in a locked-down browser. */
function readMode(): ThemeMode {
  try {
    return parseThemeMode(localStorage.getItem(THEME_KEY));
  } catch {
    return 'system';
  }
}

function writeMode(mode: ThemeMode): void {
  try {
    localStorage.setItem(THEME_KEY, mode);
  } catch {
    // A preference that cannot be stored still applies for this page.
  }
}

function apply(mode: ThemeMode): void {
  const root = document.documentElement;
  const theme = resolveTheme(mode, darkQuery.matches);

  root.dataset.theme = mode;
  root.classList.toggle('light', theme === 'light');
  root.classList.toggle('dark', theme === 'dark');

  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme]);
}

export function enhanceThemeToggle(button: HTMLElement): void {
  apply(readMode());

  button.addEventListener('click', () => {
    const mode = nextThemeMode(readMode());

    writeMode(mode);
    apply(mode);
  });

  // Only `system` tracks the OS, but re-applying in any mode is a no-op.
  darkQuery.addEventListener('change', () => apply(readMode()));
}
