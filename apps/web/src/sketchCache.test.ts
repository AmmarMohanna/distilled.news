import { afterEach, expect, it, vi } from 'vitest';
import { readSavedSketch, saveSketch } from './sketchCache';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('reads processed artwork from persistent storage', async () => {
  const blob = new Blob(['processed']);
  const match = vi.fn(async () => ({ headers: new Headers({ 'x-sketch-saved-at': String(Date.now()) }), blob: async () => blob }));
  vi.stubGlobal('caches', { open: async () => ({ match }) });
  expect(await readSavedSketch('/api/feed/owner/science/sketch')).toBe(blob);
});

it('expires persistent artwork after seven days', async () => {
  const remove = vi.fn();
  vi.stubGlobal('caches', { open: async () => ({
    match: async () => ({ headers: new Headers({ 'x-sketch-saved-at': String(Date.now() - 7*24*3600000) }) }),
    delete: remove
  }) });
  expect(await readSavedSketch('/sketch')).toBeUndefined();
  expect(remove).toHaveBeenCalledWith('/sketch');
});

it('bounds persistent storage and tolerates unavailable browser storage', async () => {
  const remove = vi.fn(), put = vi.fn();
  vi.stubGlobal('caches', { open: async () => ({
    delete: remove, put, keys: async () => Array.from({ length: 34 }, (_, i) => `/sketch/${i}`)
  }) });
  await saveSketch('/new', new Blob(['processed']));
  expect(put).toHaveBeenCalledTimes(1);
  expect(remove).toHaveBeenCalledWith('/sketch/0');
  expect(remove).toHaveBeenCalledWith('/sketch/1');
  vi.stubGlobal('caches', { open: async () => { throw new Error('Storage unavailable'); } });
  expect(await readSavedSketch('/sketch')).toBeUndefined();
  await expect(saveSketch('/sketch', new Blob(['processed']))).resolves.toBeUndefined();
});
