import assert from 'node:assert/strict';
import { test } from 'node:test';
import { editorHttpRequest } from '../../moonlight-ui/ui/src/resourceOperations.ts';
import { scenarioFromContents, withScenario, withEnabled, mapResources } from '../ui/src/scenarios.ts';

test('scenario membership lives in entry metadata and preserves other data', () => {
  const original = JSON.stringify({ enabled: true, script: 'test', metadata: { name: 'Example', tags: ['a'] } });
  const assigned = withScenario(original, 'Night raid');
  assert.equal(scenarioFromContents(assigned), 'Night raid');
  assert.deepEqual(JSON.parse(assigned), {
    enabled: true,
    script: 'test',
    metadata: { name: 'Example', tags: ['a'], scenario: 'Night raid' },
  });
  assert.deepEqual(JSON.parse(withScenario(assigned, '')), JSON.parse(original));
  assert.equal(scenarioFromContents(withScenario('{}', 'Empty')), 'Empty');
  for (const contents of ['null', '[]', '{', '{}', '{"metadata":{"scenario":42}}', '{"metadata":{"scenario":" "}}']) {
    assert.equal(scenarioFromContents(contents), undefined);
  }
  assert.throws(() => withScenario('{"metadata":[]}', 'Raid'), /metadata/);
});

test('collection enable and disable uses each registry schema and keeps metadata', () => {
  const entries = [
    { schema: { enabled: 'enabled' }, contents: withScenario('{"enabled":false,"script":"a"}', 'Raid') },
    { schema: { active: { type: 'enabled' } }, contents: withScenario('{"active":true,"coordinate":{"x":1}}', 'Raid') },
  ];
  for (const enabled of [true, false]) {
    const updated = entries.map((entry) => JSON.parse(withEnabled(entry.contents, entry.schema, enabled)));
    assert.equal(updated[0].enabled, enabled);
    assert.equal(updated[1].active, enabled);
    assert.equal(updated[0].metadata.scenario, 'Raid');
    assert.equal(updated[1].metadata.scenario, 'Raid');
    assert.equal(updated[0].script, 'a');
    assert.deepEqual(updated[1].coordinate, { x: 1 });
  }
  assert.throws(() => withEnabled('{}', {}, false), /enabled field/);
  assert.throws(() => withEnabled('[]', { enabled: 'enabled' }, false), /JSON object/);
});

test('resource loading bounds concurrency and preserves input order', async () => {
  let live = 0;
  let maximum = 0;
  const result = await mapResources(
    Array.from({ length: 30 }, (_, index) => index),
    async (value) => {
      maximum = Math.max(maximum, ++live);
      await new Promise((resolve) => setTimeout(resolve, value % 3));
      live--;
      return value * 2;
    },
  );
  assert.ok(maximum <= 8);
  assert.deepEqual(
    result,
    Array.from({ length: 30 }, (_, index) => index * 2),
  );
  assert.deepEqual(await mapResources([], async (value) => value), []);
  await assert.rejects(
    mapResources([1], async () => {
      throw new Error('Denied');
    }),
    /Denied/,
  );
});

test('metadata search maps to the generic resource endpoint with encoded path segments', () => {
  assert.deepEqual(
    editorHttpRequest('search-resource-metadata', {
      bundle: 'example bundle',
      registry: 'test:items',
      key: 'category',
      value: 'quest',
    }),
    {
      path: '/resources/bundles/example%20bundle/registries/test%3Aitems/metadata',
      payload: { key: 'category', value: 'quest' },
      method: 'GET',
    },
  );
});
