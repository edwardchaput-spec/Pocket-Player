import type { CustomThemeColors, PlayerSettings } from '../../lib/tauri/types';

type ThemeColorDefaults = Record<keyof CustomThemeColors, string>;

const DARK_DEFAULTS: ThemeColorDefaults = {
  accent: '#836dff',
  background: '#0a0b10',
  surface: '#12141b',
};

const LIGHT_DEFAULTS: ThemeColorDefaults = {
  accent: '#836dff',
  background: '#f3f3f7',
  surface: '#ffffff',
};

const MANAGED_PROPERTIES = [
  '--accent',
  '--accent-strong',
  '--focus',
  '--bg',
  '--surface',
  '--surface-raised',
  '--surface-hover',
  '--border',
  '--text',
  '--text-muted',
  'color-scheme',
] as const;

export function isStrictHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

export function getThemeColorDefaults(theme: PlayerSettings['theme']): ThemeColorDefaults {
  const prefersLight =
    theme === 'light' ||
    (theme === 'system' &&
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: light)').matches);
  return prefersLight ? LIGHT_DEFAULTS : DARK_DEFAULTS;
}

export function applyCustomThemeColors(
  style: CSSStyleDeclaration,
  colors: CustomThemeColors,
): void {
  for (const property of MANAGED_PROPERTIES) style.removeProperty(property);

  if (colors.accent && isStrictHexColor(colors.accent)) {
    style.setProperty('--accent', colors.accent);
    style.setProperty('--accent-strong', shiftForEmphasis(colors.accent, 0.28));
    style.setProperty('--focus', shiftForEmphasis(colors.accent, 0.38));
  }
  if (colors.background && isStrictHexColor(colors.background)) {
    style.setProperty('--bg', colors.background);
    const readableText = readableTextColor(colors.background);
    style.setProperty('--text', readableText);
    style.setProperty('--text-muted', readableMutedColor(colors.background, readableText));
    style.setProperty(
      'color-scheme',
      readableText === '#171820' || readableText === '#000000' ? 'light' : 'dark',
    );
  }
  if (colors.surface && isStrictHexColor(colors.surface)) {
    style.setProperty('--surface', colors.surface);
    style.setProperty('--surface-raised', shiftForEmphasis(colors.surface, 0.055));
    style.setProperty('--surface-hover', shiftForEmphasis(colors.surface, 0.1));
    style.setProperty('--border', shiftForEmphasis(colors.surface, 0.16));
  }
}

function shiftForEmphasis(color: string, amount: number): string {
  const channels = parseHex(color);
  const brightness = (channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722) / 255;
  const target: [number, number, number] = brightness > 0.6 ? [0, 0, 0] : [255, 255, 255];
  return `#${channels
    .map((channel, index) =>
      Math.round(channel + (target[index]! - channel) * amount)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

function parseHex(color: string): [number, number, number] {
  return [
    Number.parseInt(color.slice(1, 3), 16),
    Number.parseInt(color.slice(3, 5), 16),
    Number.parseInt(color.slice(5, 7), 16),
  ];
}

function mixHex(source: string, target: string, amount: number): string {
  const sourceChannels = parseHex(source);
  const targetChannels = parseHex(target);
  return `#${sourceChannels
    .map((channel, index) =>
      Math.round(channel + (targetChannels[index]! - channel) * amount)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

function relativeLuminance(color: string): number {
  const channels = parseHex(color).map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}

function contrastRatio(first: string, second: string): number {
  const lighter = Math.max(relativeLuminance(first), relativeLuminance(second));
  const darker = Math.min(relativeLuminance(first), relativeLuminance(second));
  return (lighter + 0.05) / (darker + 0.05);
}

function readableTextColor(background: string): string {
  const preferred = ['#171820', '#f3f4f8'] as const;
  const preferredChoice =
    contrastRatio(background, preferred[0]) >= contrastRatio(background, preferred[1])
      ? preferred[0]
      : preferred[1];
  if (contrastRatio(background, preferredChoice) >= 4.5) return preferredChoice;
  return contrastRatio(background, '#000000') >= contrastRatio(background, '#ffffff')
    ? '#000000'
    : '#ffffff';
}

function readableMutedColor(background: string, text: string): string {
  for (let amount = 0.62; amount <= 1; amount += 0.04) {
    const candidate = mixHex(background, text, amount);
    if (contrastRatio(background, candidate) >= 4.5) return candidate;
  }
  return text;
}
