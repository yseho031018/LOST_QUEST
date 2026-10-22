import { describeImage } from './appearance';
import { CLASSIFIER_PROMPTS, ITEM_TYPES, categoryPrediction, type CategoryPrediction } from './categories';

/** Classifier item type → the register form's category list (data/seed categories). */
export const REGISTER_CATEGORY: Record<string, string> = {
  wallet: '지갑', card: '지갑', bag: '가방', suitcase: '가방',
  phone: '전자기기', earbuds: '전자기기', headphones: '전자기기', laptop: '전자기기', tablet: '전자기기', camera: '전자기기',
  charger: '전자기기', powerbank: '전자기기', mouse: '전자기기', keyboard: '전자기기',
  watch: '액세서리', jewelry: '액세서리', glasses: '액세서리', umbrella: '액세서리', hat: '액세서리', scarf: '액세서리', gloves: '액세서리',
};

/** Hue 0–360, saturation and value 0–1. */
export function toHsv(r: number, g: number, b: number): [number, number, number] {
  const [rr, gg, bb] = [r / 255, g / 255, b / 255];
  const max = Math.max(rr, gg, bb), d = max - Math.min(rr, gg, bb);
  let h = 0;
  if (d) {
    h = max === rr ? ((gg - bb) / d) % 6 : max === gg ? (bb - rr) / d + 2 : (rr - gg) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return [h, max ? d / max : 0, max];
}

/** The register form's colour word for one pixel. Dark bluish pixels count as black: black items photograph blue. */
export function colorName(h: number, s: number, v: number): string {
  if (v < 0.25) return '검정';
  if (s < 0.15) return v > 0.7 ? '흰색' : v < 0.33 ? '검정' : '회색';
  if (h < 15 || h >= 345) return v < 0.45 ? '갈색' : s < 0.45 && v > 0.75 ? '분홍' : '빨강';
  if (h < 40) return v < 0.6 || (s > 0.7 && v < 0.75) ? '갈색' : s < 0.4 ? '베이지' : '주황';
  if (h < 65) return s < 0.35 ? '베이지' : '노랑';
  if (h < 170) return '초록';
  if (h < 250) return v < 0.5 ? (s < 0.4 || v < 0.32 ? '검정' : '남색') : '파랑';
  if (h < 290) return '보라';
  return '분홍';
}

/**
 * Most common colour of the item in a square RGBA image: pixels close to the border's median colour count as
 * background, and pixels near the centre weigh more (items are usually photographed in the middle).
 * Null unless one colour clearly wins (an experimental rule, not a calibrated probability).
 */
export function dominantColor(rgba: Uint8ClampedArray, size: number): { color: string; share: number } | null {
  const at = (i: number, j: number) => { const k = (j * size + i) * 4; return [rgba[k], rgba[k + 1], rgba[k + 2]]; };
  const border: number[][] = [];
  for (let i = 0; i < size; i++) border.push(at(i, 0), at(i, size - 1), at(0, i), at(size - 1, i));
  const background = [0, 1, 2].map(c => border.map(p => p[c]).sort((a, b) => a - b)[border.length >> 1]);
  const votes = new Map<string, number>();
  let total = 0;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const [r, g, b] = at(i, j);
      if (Math.hypot(r - background[0], g - background[1], b - background[2]) < 60) continue;
      const dx = (i - size / 2) / (size / 2), dy = (j - size / 2) / (size / 2);
      const weight = Math.exp(-(dx * dx + dy * dy) * 1.5);
      const name = colorName(...toHsv(r, g, b));
      votes.set(name, (votes.get(name) ?? 0) + weight);
      total += weight;
    }
  }
  if (!total) return null;
  const [best, second] = [...votes].map(([color, w]) => ({ color, share: w / total })).sort((a, b) => b.share - a.share);
  return best.share >= 0.45 && best.share - (second?.share ?? 0) >= 0.15 ? best : null;
}

const COLOR_SAMPLE = 96;

async function photoColor(file: File): Promise<{ color: string } | null> {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = COLOR_SAMPLE;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(bitmap, 0, 0, COLOR_SAMPLE, COLOR_SAMPLE);
    return dominantColor(context.getImageData(0, 0, COLOR_SAMPLE, COLOR_SAMPLE).data, COLOR_SAMPLE);
  } finally {
    bitmap.close();
  }
}

export interface ItemSuggestion {
  /** Empty when nothing could be suggested for that field; the form keeps its own value then. */
  title: string; category: string; color: string;
  kindLabel: string | null;
  kindConfident: boolean;
}

/** Combines the type and colour findings into what the register form can take. */
export function buildSuggestion(kind: CategoryPrediction, color: { color: string } | null): ItemSuggestion {
  if (kind.id === 'other') return { title: '', category: '', color: color?.color ?? '', kindLabel: null, kindConfident: false };
  const kindLabel = ITEM_TYPES.find(type => type.id === kind.id)?.label.split('·')[0] ?? kind.label;
  return {
    title: [color?.color, kindLabel].filter(Boolean).join(' '),
    category: REGISTER_CATEGORY[kind.id] ?? '기타',
    color: color?.color ?? '',
    kindLabel,
    kindConfident: kind.confident,
  };
}

/** Item type (photo model) and colour (pixels) from the photo, both computed in this browser; nothing is uploaded. */
export async function suggestItem(file: File, signal?: AbortSignal): Promise<ItemSuggestion> {
  const kind = categoryPrediction(await describeImage(file, CLASSIFIER_PROMPTS, signal));
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const color = await photoColor(file).catch(() => null);
  return buildSuggestion(kind, color);
}
