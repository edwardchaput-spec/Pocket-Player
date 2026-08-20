import { describe, expect, it } from 'vitest';

import { customThemeColorsSchema } from '../../lib/tauri/types';
import { applyCustomThemeColors, isStrictHexColor } from './themeColors';

describe('custom theme colours', () => {
  it('accepts only complete six-digit hex colours', () => {
    expect(isStrictHexColor('#aB12f0')).toBe(true);
    expect(
      customThemeColorsSchema.safeParse({
        accent: '#836dff',
        background: null,
        surface: '#12141b',
      }).success,
    ).toBe(true);

    for (const invalid of ['836dff', '#fff', '#12345g', 'red', '#12345678']) {
      expect(isStrictHexColor(invalid)).toBe(false);
      expect(
        customThemeColorsSchema.safeParse({
          accent: invalid,
          background: null,
          surface: null,
        }).success,
      ).toBe(false);
    }
  });

  it('applies live overrides and fully removes them on reset', () => {
    const style = document.createElement('div').style;
    applyCustomThemeColors(style, {
      accent: '#ff3366',
      background: '#080b12',
      surface: '#141927',
    });

    expect(style.getPropertyValue('--accent')).toBe('#ff3366');
    expect(style.getPropertyValue('--accent-strong')).toMatch(/^#[0-9a-f]{6}$/);
    expect(style.getPropertyValue('--bg')).toBe('#080b12');
    expect(style.getPropertyValue('--text')).toBe('#f3f4f8');
    expect(style.getPropertyValue('--text-muted')).toMatch(/^#[0-9a-f]{6}$/);
    expect(style.getPropertyValue('color-scheme')).toBe('dark');
    expect(style.getPropertyValue('--surface')).toBe('#141927');
    expect(style.getPropertyValue('--surface-raised')).toMatch(/^#[0-9a-f]{6}$/);

    applyCustomThemeColors(style, { accent: null, background: null, surface: null });
    expect(style.getPropertyValue('--accent')).toBe('');
    expect(style.getPropertyValue('--accent-strong')).toBe('');
    expect(style.getPropertyValue('--bg')).toBe('');
    expect(style.getPropertyValue('--text')).toBe('');
    expect(style.getPropertyValue('--text-muted')).toBe('');
    expect(style.getPropertyValue('color-scheme')).toBe('');
    expect(style.getPropertyValue('--surface')).toBe('');
    expect(style.getPropertyValue('--surface-raised')).toBe('');
  });

  it('chooses dark text for a custom light background', () => {
    const style = document.createElement('div').style;
    applyCustomThemeColors(style, {
      accent: null,
      background: '#f6f2ea',
      surface: null,
    });

    expect(style.getPropertyValue('--text')).toBe('#171820');
    expect(style.getPropertyValue('color-scheme')).toBe('light');
  });
});
