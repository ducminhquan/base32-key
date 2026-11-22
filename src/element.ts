import { attachKeyInput, KeyInputState } from './lib/input';
import { KeyCase } from './lib/options';

export type { KeyInputState } from './lib/input';

// cspell: disable
/**
 * Registers the `<base32-key-input>` custom element (or another tag name)
 * and returns its class. Call it once in the browser:
 *
 * ```html
 * <script type="module">
 *   import { defineKeyInput } from 'base32-key/element';
 *   defineKeyInput();
 * </script>
 * <form>
 *   <base32-key-input name="voucher" groups="4" prefix="LC" required></base32-key-input>
 * </form>
 * ```
 *
 * The element formats the key as it is typed, highlights wrong groups,
 * offers a "Did you mean …?" fix for typos, takes part in forms (its value
 * is the formatted key, and it is invalid until the key is) and fires a
 * `key-change` event whose `detail` is the {@link KeyInputState}.
 *
 * Attributes: `name`, `value`, `groups`, `prefix`, `case` (`upper` or
 * `lower`), `placeholder`, `required`, `disabled`. Style it with the
 * `input`, `hint` and `suggestion` parts.
 */
// cspell: enable
export function defineKeyInput(tagName = 'base32-key-input') {
  const existing = customElements.get(tagName);
  if (existing) {
    return existing;
  }

  class Base32KeyInput extends HTMLElement {
    static formAssociated = true;
    static observedAttributes = [
      'groups',
      'prefix',
      'case',
      'placeholder',
      'disabled',
      'required',
    ];

    readonly #internals = this.attachInternals();
    readonly #input: HTMLInputElement;
    readonly #hint: HTMLElement;
    #detach?: () => void;
    #state?: KeyInputState;

    constructor() {
      super();
      const root = this.attachShadow({ mode: 'open', delegatesFocus: true });
      root.innerHTML = `<style>
  :host { display: inline-block; }
  input { font: inherit; font-family: ui-monospace, monospace; width: 100%; box-sizing: border-box; }
  [part=hint] { font-size: 0.875em; min-height: 1.25em; }
  button { font: inherit; padding: 0; border: 0; background: none; color: inherit; text-decoration: underline; cursor: pointer; }
</style>
<input part="input" autocomplete="off" autocapitalize="characters" spellcheck="false">
<div part="hint" aria-live="polite"></div>`;
      this.#input = root.querySelector('input') as HTMLInputElement;
      this.#hint = root.querySelector('[part=hint]') as HTMLElement;
    }

    /** The formatted key. */
    get value() {
      return this.#input.value;
    }

    set value(value: string) {
      this.#input.value = value;
      this.#input.dispatchEvent(new Event('input'));
    }

    /** The latest state, as sent with `key-change`. */
    get state() {
      return this.#state;
    }

    get form() {
      return this.#internals.form;
    }

    get name() {
      return this.getAttribute('name');
    }

    connectedCallback() {
      const initial = this.getAttribute('value');
      if (initial !== null && !this.#input.value) {
        this.#input.value = initial;
      }
      this.#attach();
    }

    disconnectedCallback() {
      this.#detach?.();
      this.#detach = undefined;
    }

    attributeChangedCallback(name: string) {
      if (
        name === 'placeholder' ||
        name === 'disabled' ||
        name === 'required'
      ) {
        const value = this.getAttribute(name);
        if (value === null) {
          this.#input.removeAttribute(name);
        } else {
          this.#input.setAttribute(name, value);
        }
      }
      if (this.#detach) {
        this.#detach();
        this.#attach();
      }
    }

    formResetCallback() {
      this.value = this.getAttribute('value') ?? '';
    }

    #attach() {
      const groups = Number(this.getAttribute('groups')) || undefined;
      const prefix = this.getAttribute('prefix') ?? undefined;
      const keyCase: KeyCase =
        this.getAttribute('case') === 'lower' ? 'lower' : 'upper';
      this.#detach = attachKeyInput(this.#input, {
        groups,
        prefix,
        case: keyCase,
        onChange: (state) => this.#render(state),
      });
    }

    #render(state: KeyInputState) {
      this.#state = state;
      this.#internals.setFormValue(state.value);
      const empty = state.value === '';
      if (state.valid || (empty && !this.hasAttribute('required'))) {
        this.#internals.setValidity({});
      } else {
        this.#internals.setValidity(
          empty ? { valueMissing: true } : { customError: true },
          empty ? 'Enter the key' : 'Enter a valid key',
          this.#input
        );
      }
      this.#hint.replaceChildren();
      const [suggestion] = state.suggestions;
      if (suggestion) {
        const button = document.createElement('button');
        button.type = 'button';
        button.setAttribute('part', 'suggestion');
        button.textContent = suggestion;
        button.addEventListener('click', () => {
          this.value = suggestion;
          this.#input.focus();
        });
        this.#hint.append('Did you mean ', button, '?');
      } else if (state.errorGroups.length > 0) {
        const groups = state.errorGroups.map((i) => i + 1).join(', ');
        this.#hint.textContent =
          state.errorGroups.length === 1
            ? `Check group ${groups}`
            : `Check groups ${groups}`;
      }
      this.dispatchEvent(
        new CustomEvent('key-change', { detail: state, bubbles: true })
      );
    }
  }

  customElements.define(tagName, Base32KeyInput);
  return Base32KeyInput;
}
