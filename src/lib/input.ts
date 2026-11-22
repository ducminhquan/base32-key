import {
  formatInput,
  FormatOptions,
  validate,
  ValidationResult,
} from './decode';
import { resolveOptions } from './options';
import { suggest } from './suggest';

/** The parts of an `<input>` element that {@link attachKeyInput} uses. */
export interface KeyInputElement {
  value: string;
  readonly selectionStart: number | null;
  setSelectionRange(start: number, end: number): void;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  addEventListener(type: 'input', listener: () => void): void;
  removeEventListener(type: 'input', listener: () => void): void;
}

/** What {@link attachKeyInput} reports after each change. */
export interface KeyInputState {
  /** The formatted value now in the input. */
  readonly value: string;
  /** The key is complete and every check digit matches. */
  readonly valid: boolean;
  /** Full validation result, as from {@link validate}. */
  readonly validation: ValidationResult;
  /**
   * 0-based indexes of finished groups that are wrong. Unlike
   * `validation.invalidGroups`, a group still being typed is not listed, so
   * these can be highlighted while the user types.
   */
  readonly errorGroups: readonly number[];
  /** Corrections from {@link suggest} once the key is fully typed. */
  readonly suggestions: readonly string[];
}

/** Options for {@link attachKeyInput}. */
export interface KeyInputOptions extends FormatOptions {
  /** Called after every change, and once when attached. */
  readonly onChange?: (state: KeyInputState) => void;
}

const SEPARATORS = /[\s-]/;

function countSignificant(text: string) {
  let count = 0;
  for (const c of text) {
    if (!SEPARATORS.test(c)) ++count;
  }
  return count;
}

/** Position in `text` just after its `count`-th significant character. */
function positionAfter(text: string, count: number) {
  let seen = 0;
  for (let i = 0; i < text.length; ++i) {
    if (seen === count) return i;
    if (!SEPARATORS.test(text[i])) ++seen;
  }
  return text.length;
}

/** Reads the state of a formatted key. */
export function keyInputState(
  value: string,
  options: FormatOptions = {}
): KeyInputState {
  const resolved = resolveOptions(options, true, true);
  const validation = validate(value, options);
  const prefix = resolved.prefix ? `${resolved.prefix}-` : '';
  const body = value.startsWith(prefix) ? value.slice(prefix.length) : '';
  const groups = resolved.grouped ? body.split('-') : [body];
  const size = resolved.checked ? 5 : 4;
  const finished = (i: number) =>
    !resolved.grouped || i < groups.length - 1 || groups[i]?.length === size;
  const errorGroups =
    validation.code === 'INVALID_PREFIX'
      ? []
      : validation.invalidGroups.filter(
          (i) => i < groups.length && finished(i)
        );
  const typedAll =
    resolved.groups === undefined
      ? finished(groups.length - 1)
      : groups.length >= resolved.groups && finished(groups.length - 1);
  const suggestions =
    !validation.valid && typedAll && errorGroups.length > 0
      ? suggest(value, options)
      : [];
  return {
    value,
    valid: validation.valid,
    validation,
    errorGroups,
    suggestions,
  };
}

// cspell: disable
/**
 * Turn an `<input>` into a key field: as the user types or pastes, the value
 * is formatted (letter case, hyphens, prefix, at most `groups` groups) with
 * the caret kept in place, `aria-invalid` is set when a finished group is
 * wrong, and `onChange` reports the state, including suggestions for typos.
 * Returns a function that detaches the field.
 *
 * ### Example
 * ```js
 * attachKeyInput(document.querySelector('#voucher'), {
 *   groups: 4,
 *   onChange: ({ valid, suggestions }) => { … },
 * });
 * ```
 */
// cspell: enable
export function attachKeyInput(
  input: KeyInputElement,
  options: KeyInputOptions = {}
): () => void {
  const { onChange, ...formatOptions } = options;
  const { prefix } = resolveOptions(formatOptions, true, true);
  const update = () => {
    const raw = input.value;
    const caret = input.selectionStart ?? raw.length;
    const formatted = formatInput(raw, formatOptions);
    if (formatted !== raw) {
      let count = countSignificant(raw.slice(0, caret));
      // formatInput added a prefix the user did not type.
      if (
        prefix &&
        formatted.startsWith(`${prefix}-`) &&
        !raw
          .replace(/[\s-]+/g, '')
          .toUpperCase()
          .startsWith(prefix.toUpperCase())
      ) {
        count += prefix.length;
      }
      input.value = formatted;
      const position = positionAfter(formatted, count);
      input.setSelectionRange(position, position);
    }
    const state = keyInputState(formatted, formatOptions);
    if (state.errorGroups.length > 0) {
      input.setAttribute('aria-invalid', 'true');
    } else {
      input.removeAttribute('aria-invalid');
    }
    onChange?.(state);
  };
  input.addEventListener('input', update);
  update();
  return () => input.removeEventListener('input', update);
}
