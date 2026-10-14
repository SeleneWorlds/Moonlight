import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { defaultSchemaValue, resolveSchemaField } from '../../moonlight-ui/ui/src/schema.ts';

test('scripted schema properties start with an object value', () => {
  assert.deepEqual(defaultSchemaValue({ type: 'scripted_schema_lookup', property: 'script' }), {});
});

test('Lua schema lookup invokes providers and handles errors and disabled editors', () => {
  const output = execFileSync('lua', ['tests/scripted_schema_test.lua'], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
  });
  assert.match(output, /scripted schema regression tests passed/);
});

test('payload controls follow the sibling type and preserve optional clearing', () => {
  const definition = {
    type: 'schema_lookup',
    property: 'type',
    optional: true,
    variants: { item: { type: 'object', properties: { amount: 'integer' } }, level: 'integer' },
  };
  assert.deepEqual(resolveSchemaField(definition, { type: 'item' }), {
    optional: true,
    type: 'object',
    properties: { amount: 'integer' },
  });
  assert.deepEqual(resolveSchemaField(definition, { type: 'level' }), { optional: true, type: 'integer' });
  for (const type of ['missing', 'toString', undefined]) {
    assert.deepEqual(resolveSchemaField(definition, { type }), { optional: true, type: 'any' });
  }
  assert.equal(resolveSchemaField('string', {}), 'string');
});
