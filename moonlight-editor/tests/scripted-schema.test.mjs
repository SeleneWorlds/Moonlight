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

test('script schemas use HTTP for large replies and propagate fetch failures', async () => {
  const { fetchScriptSchema } = await import('../../moonlight-ui/ui/src/scriptSchemas.ts');
  const schema = { event: { type: 'enum', values: [{ value: 'enter', label: 'x'.repeat(100000) }] } };
  const http = {
    request: async (path, body, method) => {
      assert.equal(path, '/scripts/schema');
      assert.equal(method, 'GET');
      assert.deepEqual(body, { module: 'test.provider', functionName: 'custom' });
      return schema;
    },
  };
  assert.equal(await fetchScriptSchema(http, 'test.provider', 'custom'), schema);
  await assert.rejects(
    fetchScriptSchema(
      {
        request: async () => {
          throw new Error('Access denied');
        },
      },
      'test',
    ),
    /Access denied/,
  );
  for (const result of [null, [], 'invalid']) {
    await assert.rejects(fetchScriptSchema({ request: async () => result }, 'test'), /schema object/);
  }
});
