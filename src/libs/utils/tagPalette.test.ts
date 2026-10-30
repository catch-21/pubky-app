import { describe, expect, it } from 'vitest';
import { getTagDayPalette, getTagPaletteStyle } from './tagPalette';
import { generateRandomColor } from './utils';

const WHITE_LABEL = 'var(--color-white)';
const DARK_LABEL = 'var(--foreground)';
/** Light theme `--foreground` */
const DARK_LABEL_HEX = '#303034';

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((offset) => {
    const channel = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** Every colour `generateRandomColor` can produce: six channel patterns times 256 values */
function allGeneratorColours(): string[] {
  const colours = new Set<string>();
  for (let byte = 0; byte < 256; byte++) {
    const x = byte.toString(16).padStart(2, '0');
    [`#ff00${x}`, `#ff${x}00`, `#${x}ff00`, `#${x}00ff`, `#00${x}ff`, `#00ff${x}`].forEach((c) => colours.add(c));
  }
  ['bitcoin', 'synonym', 'bitkit', 'pubky', 'blocktank', 'tether', 'ai'].forEach((name) =>
    colours.add(generateRandomColor(name).toLowerCase()),
  );
  return [...colours];
}

describe('getTagDayPalette', () => {
  it('keeps every generator colour readable on its day chip', () => {
    for (const colour of allGeneratorColours()) {
      const { background, label } = getTagDayPalette(colour);
      const labelHex = label === WHITE_LABEL ? '#ffffff' : DARK_LABEL_HEX;
      expect(contrast(background, labelHex), colour).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('gives deep hues a white label, keeping the hue at mid lightness', () => {
    expect(getTagDayPalette('#FF0000')).toEqual({
      background: '#e42a1f',
      label: WHITE_LABEL,
      count: 'color-mix(in oklab, var(--color-white) 70%, transparent)',
      accent: '#e42a1f',
    });
    expect(getTagDayPalette('#00FF00').background).toBe('#008a00');
    expect(getTagDayPalette('#0000FF').background).toBe('#184bd7');
  });

  it('gives amber, yellow and lime a bright chip with a dark label and a deep accent', () => {
    expect(getTagDayPalette('#FFFF00')).toEqual({
      background: '#e3e448',
      label: DARK_LABEL,
      count: 'color-mix(in oklab, var(--foreground) 60%, transparent)',
      accent: '#7a7a00',
    });
    expect(getTagDayPalette('#C8FF00')).toMatchObject({ background: '#c4ed64', label: DARK_LABEL, accent: '#637f00' });
    expect(getTagDayPalette('#FFAE00')).toMatchObject({ label: DARK_LABEL, accent: '#a06b00' });
    expect(getTagDayPalette(generateRandomColor('bitcoin')).label).toBe(DARK_LABEL);
  });

  it('keeps amber and orange at their own lightness instead of bleaching them', () => {
    expect(getTagDayPalette('#FF9900').background).toBe('#ff9d24');
    expect(getTagDayPalette('#FFAE00').background).toBe('#ffae03');
  });

  it('keeps true orange as a deep chip', () => {
    expect(getTagDayPalette('#FF8800').label).toBe(WHITE_LABEL);
  });

  it('keeps the bright band accent visible against a white card', () => {
    for (const colour of ['#FFAE00', '#FFFF00', '#C8FF00']) {
      expect(contrast(getTagDayPalette(colour).accent, '#ffffff'), colour).toBeGreaterThanOrEqual(3);
    }
  });

  it('treats greys as deep chips, since their hue is meaningless', () => {
    expect(getTagDayPalette('#a0a0a0').label).toBe(WHITE_LABEL);
  });

  it('accepts shorthand hex and is case insensitive', () => {
    expect(getTagDayPalette('#f00')).toEqual(getTagDayPalette('#FF0000'));
    expect(getTagDayPalette('#ff0000')).toBe(getTagDayPalette('#FF0000'));
  });

  it('passes through colours it cannot parse', () => {
    expect(getTagDayPalette('rgba(255, 0, 0, 0.3)')).toEqual({
      background: 'rgba(255, 0, 0, 0.3)',
      label: DARK_LABEL,
      count: 'color-mix(in oklab, var(--foreground) 60%, transparent)',
      accent: 'rgba(255, 0, 0, 0.3)',
    });
  });
});

describe('getTagPaletteStyle', () => {
  it('maps night and day values onto the custom properties `.tag-palette` reads', () => {
    const day = getTagDayPalette('#FF0000');
    expect(getTagPaletteStyle({ nightFill: 'night-fill', nightEdge: 'night-edge', dayFill: 'day-fill', day })).toEqual({
      '--tag-night-fill': 'night-fill',
      '--tag-night-edge': 'night-edge',
      '--tag-day-fill': 'day-fill',
      '--tag-day-edge': day.accent,
      '--tag-day-label': day.label,
      '--tag-day-count': day.count,
    });
  });
});
