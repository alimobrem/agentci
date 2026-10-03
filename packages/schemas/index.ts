import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Ajv, type ErrorObject, type ValidateFunction } from 'ajv';
import type { FormatsPlugin } from 'ajv-formats';

export const schemaNames = ['agent-project', 'requirement', 'finding', 'evidence'] as const;
export type SchemaName = typeof schemaNames[number];

const ajv = new Ajv({ allErrors: true, strict: true });
const addFormats: FormatsPlugin = createRequire(import.meta.url)('ajv-formats');
addFormats(ajv);

export const schemas = Object.fromEntries(schemaNames.map(name => [name,
  JSON.parse(readFileSync(new URL(`./json/${name}.schema.json`, import.meta.url), 'utf8')),
])) as Record<SchemaName, object>;
const validators = Object.fromEntries(schemaNames.map(name => [name, ajv.compile(schemas[name])])) as
  Record<SchemaName, ValidateFunction>;

export interface ValidationResult { valid: boolean; errors: ErrorObject[] }
/** No coercion, default insertion, or removal of unknown fields. */
export function validateDocument(name: SchemaName, value: unknown): ValidationResult {
  const validator = validators[name];
  const valid = validator(value);
  return { valid, errors: structuredClone(validator.errors ?? []) };
}
