import { describe, expect, it, vi } from 'vitest';
import { CLASSIFIER_PROMPTS, ITEM_TYPES } from './categories';
import { buildSuggestion, colorName, dominantColor, suggestItem, toHsv } from './suggestItem';

vi.mock('./appearance', () => ({ describeImage: vi.fn() }));
const { describeImage } = await import('./appearance');

/** A square image: background colour everywhere, `item` colour in the centre square covering `fraction` of the side. */
function picture(size: number, background: number[], item: number[], fraction = 0.6, second?: number[]) {
  const data = new Uint8ClampedArray(size * size * 4);
  const lo = size * (1 - fraction) / 2, hi = size - lo;
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const inside = i >= lo && i < hi && j >= lo && j < hi;
    const c = inside ? (second && i < size / 2 ? second : item) : background;
    data.set([c[0], c[1], c[2], 255], (j * size + i) * 4);
  }
  return data;
}

describe('pixel colour names', () => {
  it('names the basic colours', () => {
    expect(colorName(...toHsv(20, 20, 20))).toBe('검정');
    expect(colorName(...toHsv(240, 240, 240))).toBe('흰색');
    expect(colorName(...toHsv(128, 128, 128))).toBe('회색');
    expect(colorName(...toHsv(210, 30, 30))).toBe('빨강');
    expect(colorName(...toHsv(120, 70, 30))).toBe('갈색');
    expect(colorName(...toHsv(40, 90, 200))).toBe('파랑');
    expect(colorName(...toHsv(30, 40, 110))).toBe('남색');
    expect(colorName(...toHsv(40, 45, 60))).toBe('검정');  // black items often photograph slightly blue
    expect(colorName(...toHsv(60, 170, 60))).toBe('초록');
  });
});

describe('item colour from a photo', () => {
  it('ignores the background and finds the item colour', () => {
    expect(dominantColor(picture(48, [235, 235, 230], [120, 70, 30]), 48)).toMatchObject({ color: '갈색' });
    expect(dominantColor(picture(48, [180, 150, 120], [20, 20, 20]), 48)).toMatchObject({ color: '검정' });
  });
  it('gives no colour when two colours split the item or nothing stands out', () => {
    expect(dominantColor(picture(48, [235, 235, 235], [20, 20, 20], 0.6, [210, 30, 30]), 48)).toBeNull();
    expect(dominantColor(picture(48, [235, 235, 235], [235, 235, 235]), 48)).toBeNull();
  });
});

describe('suggestion', () => {
  const confidentWallet = { id: 'wallet', label: '지갑', score: 0.8, margin: 0.5, confident: true, source: 'auto' as const };
  it('builds title, register category and colour', () => {
    expect(buildSuggestion(confidentWallet, { color: '갈색' })).toEqual({ title: '갈색 지갑', category: '지갑', color: '갈색', kindLabel: '지갑', kindConfident: true });
  });
  it('keeps the title without a colour and maps unknown categories to 기타', () => {
    expect(buildSuggestion({ ...confidentWallet, id: 'bottle', label: '물병·텀블러' }, null)).toMatchObject({ title: '물병', category: '기타', color: '' });
  });
  it('suggests no item when the photo is not a lost item', () => {
    expect(buildSuggestion({ ...confidentWallet, id: 'other', confident: false }, null)).toMatchObject({ title: '', category: '', kindLabel: null });
  });
  it('classifies the type with the photo model and still answers when the colour step cannot run', async () => {
    const wallet = ITEM_TYPES.find(t => t.id === 'wallet')!;
    vi.mocked(describeImage).mockResolvedValueOnce(CLASSIFIER_PROMPTS.map(label => ({ label, score: label === wallet.prompt ? 0.7 : 0.3 / (CLASSIFIER_PROMPTS.length - 1) })));
    // No createImageBitmap in this test environment: the colour is simply left for the user.
    const result = await suggestItem(new File(['x'], 'p.jpg', { type: 'image/jpeg' }));
    expect(result).toMatchObject({ title: '지갑', category: '지갑', color: '', kindConfident: true });
    expect(vi.mocked(describeImage).mock.calls[0][1]).toBe(CLASSIFIER_PROMPTS);
  });
});
