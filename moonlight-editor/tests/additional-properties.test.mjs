import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { additionalSchemaValues, mergeAdditionalSchemaValues } from '../../moonlight-ui/ui/src/schema.ts';

const properties = {
  CustomName: { type: 'string', optional: true },
  CustomNameDe: { type: 'string', optional: true },
};

test('item custom fields exclude declared names and preserve arbitrary JSON values', () => {
  const contents = {
    CustomName: 'To the tavern',
    CustomNameDe: 'Zur Taverne',
    perception: 0,
    nested: { active: true },
  };
  assert.deepEqual(additionalSchemaValues(contents, properties), { perception: 0, nested: { active: true } });
  assert.deepEqual(mergeAdditionalSchemaValues(contents, properties, { perception: 5, added: [1, 2] }), {
    CustomName: 'To the tavern',
    CustomNameDe: 'Zur Taverne',
    perception: 5,
    added: [1, 2],
  });
});

test('custom entries cannot overwrite declared fields or recreate cleared names', () => {
  assert.deepEqual(
    mergeAdditionalSchemaValues({ CustomName: 'Original', old: 1 }, properties, {
      CustomName: 'Overwrite',
      CustomNameDe: 'Recreate',
      constructor: 4,
    }),
    { CustomName: 'Original', constructor: 4 },
  );
  assert.deepEqual(
    additionalSchemaValues(JSON.parse('{"__proto__":1,"toString":2}'), properties),
    JSON.parse('{"__proto__":1,"toString":2}'),
  );
});

test('item forms declare optional name strings alongside arbitrary additional data', () => {
  execFileSync(
    'lua',
    [
      '-e',
      `
    package.preload['illarion-script-loader.server.lua.lib.datakeys'] = function() return {} end
    package.preload['illarion-script-loader.server.lua.lib.dataFields'] = function() return {} end
    package.preload['selene.registries'] = function() return {} end
    package.preload['illarion-script-loader.server.lua.lib.itemEntity'] = function() return {} end
    local forms = dofile('../../illarion-admin-menu/server/lua/item_forms.lua')
    local schema = forms.schema()
    assert(schema.quality.editor == 'slider' and schema.quality.min == 0 and schema.quality.max == 999)
    assert(schema.wear.editor == 'slider' and schema.wear.min == 0 and schema.wear.max == 255)
    local data = schema.data
    assert(data.type == 'object' and data.additionalProperties == 'any')
    for _, name in ipairs({'CustomName', 'CustomNameDe'}) do
      assert(data.properties[name].type == 'string' and data.properties[name].optional)
    end
  `,
    ],
    { cwd: new URL('..', import.meta.url) },
  );
});
