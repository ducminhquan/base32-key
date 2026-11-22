// @vitest-environment happy-dom
import { describe, expect, test } from 'vitest';

import { defineKeyInput, KeyInputState } from './element';

// cspell: disable

// happy-dom has no ElementInternals: a minimal stand-in records what the
// element reports to its form. The real API is checked in a browser by
// scripts/browser-check.mjs.
interface FakeInternals {
  value?: string;
  validity: { valid: boolean; flags: object; message?: string };
  readonly form: HTMLFormElement | null;
}
const internals = new WeakMap<HTMLElement, FakeInternals>();
Object.defineProperty(HTMLElement.prototype, 'attachInternals', {
  value(this: HTMLElement) {
    const closestForm = () => this.closest('form');
    const fake: FakeInternals = {
      validity: { valid: true, flags: {} },
      get form() {
        return closestForm();
      },
      setFormValue(value: string) {
        fake.value = value;
      },
      setValidity(flags: object, message?: string) {
        fake.validity = {
          valid: Object.keys(flags).length === 0,
          flags,
          message,
        };
      },
    } as FakeInternals;
    internals.set(this, fake);
    return fake;
  },
});

defineKeyInput();

type KeyInput = HTMLElement & {
  value: string;
  readonly state?: KeyInputState;
  readonly form: HTMLFormElement | null;
  readonly name: string | null;
};

const mount = (attributes: Record<string, string> = {}) => {
  const form = document.createElement('form');
  const element = document.createElement('base32-key-input') as KeyInput;
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value);
  }
  form.append(element);
  document.body.append(form);
  const input = element.shadowRoot?.querySelector('input') as HTMLInputElement;
  const hint = element.shadowRoot?.querySelector('[part=hint]') as HTMLElement;
  const type = (value: string) => {
    input.value = value;
    input.setSelectionRange(value.length, value.length);
    input.dispatchEvent(new Event('input'));
  };
  return { form, element, input, hint, type };
};

describe('<base32-key-input>', () => {
  test('defineKeyInput is idempotent', () => {
    expect(defineKeyInput()).toBe(customElements.get('base32-key-input'));
  });

  test('formats, validates and fires key-change', () => {
    const { element, type, hint } = mount({ groups: '2', name: 'voucher' });
    const events: KeyInputState[] = [];
    element.addEventListener('key-change', (event) =>
      events.push((event as CustomEvent<KeyInputState>).detail)
    );
    type('222et3zzgn');
    expect(element.value).toBe('222ET-3ZZGN');
    expect(element.state?.valid).toBe(true);
    expect(events.at(-1)?.valid).toBe(true);
    expect(element.name).toBe('voucher');
    expect(element.form).not.toBeNull();
    expect(hint.textContent).toBe('');
  });

  test('offers a fix for a typo', () => {
    const { element, type, hint } = mount({ groups: '2' });
    type('222te3zzgn');
    expect(hint.textContent).toBe('Did you mean 222ET-3ZZGN?');
    hint.querySelector('button')?.click();
    expect(element.value).toBe('222ET-3ZZGN');
    expect(element.state?.valid).toBe(true);
  });

  test('names wrong groups it cannot fix', () => {
    const { type, hint } = mount();
    type('22222-22222-zzzzz-22');
    expect(hint.textContent).toBe('Check group 3');
    type('zzzzz-zzzzz-22');
    expect(hint.textContent).toBe('Check groups 1, 2');
  });

  test('attributes', () => {
    const { element, input, type } = mount({
      prefix: 'LC',
      case: 'lower',
      placeholder: 'LC-xxxxx',
      value: 'aaan3',
    });
    expect(element.value).toBe('LC-aaan3');
    expect(input.getAttribute('placeholder')).toBe('LC-xxxxx');
    element.setAttribute('disabled', '');
    expect(input.hasAttribute('disabled')).toBe(true);
    element.removeAttribute('disabled');
    expect(input.hasAttribute('disabled')).toBe(false);
    element.setAttribute('prefix', 'XY');
    type('2');
    expect(element.value).toBe('XY-2');
    element.remove();
    element.setAttribute('groups', '3');
    document.body.append(element);
    expect(element.value).toBe('XY-2');
  });

  test('form value, validity and reset', () => {
    const { element, type } = mount({
      required: '',
      value: '222ET-3ZZGN',
    });
    const state = () => internals.get(element);
    expect(state()?.value).toBe('222ET-3ZZGN');
    expect(state()?.validity.valid).toBe(true);
    type('');
    expect(state()?.validity).toMatchObject({
      valid: false,
      flags: { valueMissing: true },
      message: 'Enter the key',
    });
    type('222EX');
    expect(state()?.validity).toMatchObject({
      valid: false,
      flags: { customError: true },
      message: 'Enter a valid key',
    });
    // happy-dom does not call form callbacks: call it as a browser would.
    (element as unknown as { formResetCallback(): void }).formResetCallback();
    expect(element.value).toBe('222ET-3ZZGN');
    const optional = mount();
    expect(internals.get(optional.element)?.validity.valid).toBe(true);
    (
      optional.element as unknown as { formResetCallback(): void }
    ).formResetCallback();
    expect(optional.element.value).toBe('');
  });
});
