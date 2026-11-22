import { describe, expect, test } from 'vitest';

import {
  attachKeyInput,
  KeyInputElement,
  keyInputState,
  KeyInputState,
} from './input';

// cspell: disable
class FakeInput implements KeyInputElement {
  value = '';
  selectionStart: number | null = null;
  attributes = new Map<string, string>();
  listeners = new Set<() => void>();
  setSelectionRange(start: number) {
    this.selectionStart = start;
  }
  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }
  removeAttribute(name: string) {
    this.attributes.delete(name);
  }
  addEventListener(_: 'input', listener: () => void) {
    this.listeners.add(listener);
  }
  removeEventListener(_: 'input', listener: () => void) {
    this.listeners.delete(listener);
  }
  /** Simulates typing: sets the value and caret, then fires input. */
  type(value: string, caret = value.length) {
    this.value = value;
    this.selectionStart = caret;
    this.listeners.forEach((listener) => listener());
  }
}

describe('attachKeyInput', () => {
  test('formats as the user types and keeps the caret', () => {
    const input = new FakeInput();
    const states: KeyInputState[] = [];
    attachKeyInput(input, { onChange: (s) => states.push(s) });
    expect(states).toHaveLength(1);
    input.type('222et3');
    expect(input.value).toBe('222ET-3');
    expect(input.selectionStart).toBe(7);
    // Typing in the middle keeps the caret after the typed character.
    input.type('222ET-3', 2);
    expect(input.selectionStart).toBe(2);
    input.type('22x2ET-3', 3);
    expect(input.value).toBe('22X2E-T3');
    expect(input.selectionStart).toBe(3);
    // Unchanged value: nothing to move.
    input.selectionStart = 1;
    input.type('22X2E-T3', 1);
    expect(input.selectionStart).toBe(1);
  });

  test('reports validity, errors and suggestions', () => {
    const input = new FakeInput();
    let state: KeyInputState | undefined;
    attachKeyInput(input, { groups: 2, onChange: (s) => (state = s) });
    input.type('222et');
    expect(state).toMatchObject({
      valid: false,
      errorGroups: [],
      suggestions: [],
    });
    expect(input.attributes.has('aria-invalid')).toBe(false);
    input.type('222te3zz');
    expect(state?.errorGroups).toEqual([0]);
    expect(state?.suggestions).toEqual([]);
    expect(input.attributes.get('aria-invalid')).toBe('true');
    input.type('222te3zzgn');
    expect(state?.suggestions).toEqual(['222ET-3ZZGN']);
    input.type('222et3zzgn99');
    expect(input.value).toBe('222ET-3ZZGN');
    expect(state?.valid).toBe(true);
    expect(input.attributes.has('aria-invalid')).toBe(false);
  });

  test('adds the prefix and keeps the caret after it', () => {
    const input = new FakeInput();
    attachKeyInput(input, { prefix: 'LC' });
    input.type('l');
    expect(input.value).toBe('L');
    input.type('222');
    expect(input.value).toBe('LC-222');
    expect(input.selectionStart).toBe(6);
    input.type('lc 222e');
    expect(input.value).toBe('LC-222E');
    expect(input.selectionStart).toBe(7);
  });

  test('handles a missing caret and detaches', () => {
    const input = new FakeInput();
    const detach = attachKeyInput(input);
    input.value = '222et';
    input.selectionStart = null;
    input.listeners.forEach((listener) => listener());
    expect(input.value).toBe('222ET');
    detach();
    expect(input.listeners.size).toBe(0);
  });
});

describe('keyInputState', () => {
  test('finished groups only', () => {
    expect(keyInputState('222ET-3ZZGX').errorGroups).toEqual([1]);
    expect(keyInputState('222ET-3ZZ').errorGroups).toEqual([]);
    expect(keyInputState('222EX-3ZZ').errorGroups).toEqual([0]);
    expect(keyInputState('222TE-3ZZGN').suggestions).toEqual(['222ET-3ZZGN']);
    expect(keyInputState('XX-222ET', { prefix: 'LC' })).toMatchObject({
      errorGroups: [],
      suggestions: [],
    });
    expect(
      keyInputState('nb99jq', { grouped: false, case: 'lower' })
    ).toMatchObject({
      errorGroups: [0],
    });
    expect(keyInputState('222T', { checked: false, groups: 2 })).toMatchObject({
      valid: false,
      errorGroups: [],
    });
  });
});
