// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import XpGainToast from './XpGainToast';

const app = vi.hoisted(() => ({ xpGain: null as null | { amount: number; key: number }, profile: { name: 'A', xp: 160, registeredCount: 0, returnedCount: 0 } }));
vi.mock('../context/AppContext', () => ({ useApp: () => app }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, container: HTMLDivElement;
beforeEach(() => { app.xpGain = null; vi.useFakeTimers(); container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); vi.useRealTimers(); });

it('shows nothing until XP rises, then "+N XP" with the new level for a few seconds', () => {
  act(() => root.render(<XpGainToast />));
  expect(container.querySelector('.xp-gain-toast')).toBeNull();
  expect(container.querySelector('[role="status"]')).not.toBeNull();
  app.xpGain = { amount: 50, key: 1 };
  act(() => root.render(<XpGainToast />));
  expect(container.textContent).toContain('+50 XP');
  expect(container.textContent).toContain('Lv.2 · 160 XP');
  act(() => { vi.advanceTimersByTime(3_600); });
  expect(container.querySelector('.xp-gain-toast')).toBeNull();
});
