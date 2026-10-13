import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { defaultSchemaValue } from '../ui/src/schema.ts';

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
