import { describe, expect, it } from 'vitest';

import { nextThemeMode, parseThemeMode, resolveTheme } from './theme';

describe('parseThemeMode', () => {
  it('keeps a stored mode', () => {
    expect(parseThemeMode('dark')).toBe('dark');
    expect(parseThemeMode('light')).toBe('light');
    expect(parseThemeMode('system')).toBe('system');
  });

  it('falls back to system for anything else', () => {
    expect(parseThemeMode(null)).toBe('system');
    expect(parseThemeMode('auto')).toBe('system');
    expect(parseThemeMode(1)).toBe('system');
  });
});

describe('nextThemeMode', () => {
  it('cycles system to light to dark and back', () => {
    expect(nextThemeMode('system')).toBe('light');
    expect(nextThemeMode('light')).toBe('dark');
    expect(nextThemeMode('dark')).toBe('system');
  });
});

describe('resolveTheme', () => {
  it('follows the system only in system mode', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});
