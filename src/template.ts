// Entry of base32-key/template: keys that carry typed, signed or encrypted
// fields (vouchers, activation codes, member cards, order numbers).
export { defineKeyTemplate, presets, verifyKeyTemplates } from './lib/template';
export type {
  BoolField,
  DateField,
  EnumField,
  KeyTemplate,
  KeyTemplateDefinition,
  TemplateField,
  TemplateValues,
  TemplateVerifyOptions,
  UintField,
} from './lib/template';
export { Base32KeyError } from './lib/errors';
export type { Base32KeyErrorCode } from './lib/errors';
export type { SigningSecret } from './lib/sign';
