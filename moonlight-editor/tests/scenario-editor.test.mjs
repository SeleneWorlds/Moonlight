import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import * as vue from 'vue';
import * as scenarios from '../ui/src/scenarios.ts';
const require = createRequire(import.meta.url);
const { parse, compileScript } = require('@vue/compiler-sfc');
const { transformSync } = require('esbuild');
const filename = fileURLToPath(new URL('../ui/src/App.vue', import.meta.url));

function editor(
  files,
  denied = false,
  definitions = [...new Set(files.map((file) => scenarios.scenarioFromContents(file.contents)).filter(Boolean))].map(
    (identifier) => ({
      path: `demo/server/data/moonlight/scenarios/${identifier.split(':')[1]}.json`,
      contents: JSON.stringify({ name: identifier.split(':')[1], enabled: true }),
    }),
  ),
) {
  const storage = new Map();
  const calls = [];
  globalThis.window = {
    localStorage: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value) },
  };
  const api = {
    world: { getCameraCoordinate: () => ({ x: 0, y: 0, z: 0 }), isLightingEnabled: () => true },
    network: { sendToServer: () => {} },
    http: {
      request: async (path, payload) => {
        calls.push({ operation: 'permissions', path, payload });
        assert.ok(payload.checks.length <= 32);
        return payload.checks.map(() => !denied);
      },
    },
  };
  const requestEditorOperation = async (_, operation, payload = {}) => {
    calls.push({ operation, payload });
    switch (operation) {
      case 'request-project':
        return { files: definitions.map(({ path }) => ({ path })), schema: { name: 'string', enabled: 'enabled' } };
      case 'search-resource-metadata':
        return {
          files: files
            .filter((file) => file.registry === payload.registry && file.path.startsWith(payload.bundle + '/'))
            .filter((file) => scenarios.scenarioFromContents(file.contents))
            .map(({ path, contents }) => ({
              path,
              metadata: { scenario: scenarios.scenarioFromContents(contents) },
              fields: JSON.parse(contents),
            })),
          schema: { [payload.registry.endsWith('spawns') ? 'active' : 'enabled']: 'enabled' },
        };
      case 'open-file':
        return [...files, ...definitions].find((file) => file.path === payload.path);
      case 'save-file': {
        const file = [...files, ...definitions].find((file) => file.path === payload.path);
        if (file) file.contents = payload.contents;
        else if (payload.path.includes('/scenarios/'))
          definitions.push({ path: payload.path, contents: payload.contents });
        return { path: payload.path };
      }
      case 'create-file':
        return {
          ...payload,
          path:
            payload.registry === 'moonlight:scenarios'
              ? `${payload.bundle}/server/data/moonlight/scenarios/${payload.name}.json`
              : `${payload.bundle}/server/data/demo/${payload.registry.split(':')[1]}/${payload.name}.json`,
          contents: payload.contents ?? '{}',
        };
      case 'pending-changes':
        return { count: 0, paths: [] };
      default:
        return {};
    }
  };
  const source = readFileSync(filename, 'utf8').replace(
    '</script>',
    `defineExpose({ manageScenario, save, resourcePermissions, contents, scenarioBusy, scenarioDefinitions, loadScenarios, moveToScenario, scenarioMode, selectedBundle, selectedRegistry, selectedScenario, bundleRegistries, scenarioProjects, scenarioSchemas, entries, listedFiles, scenarios, projectLoading, visible, selectedPath, registrySchema, statusIsError, status, loadScenarioProjects, setScenarioEnabled, createFile, createScenario, receiveFile, selectBundle, toggleScenarioMode });\n</script>`,
  );
  const { descriptor } = parse(source, { filename });
  const script = compileScript(descriptor, { id: 'scenario-editor' });
  const { code } = transformSync(script.content, { loader: 'ts', format: 'cjs' });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(
    (id) => {
      if (id === 'vue') return { ...vue, onMounted: () => {}, onBeforeUnmount: () => {} };
      if (id === './selene') return { useSelene: () => api, requestEditorOperation };
      if (id === './scenarios') return scenarios;
      if (id === 'moonlight-ui/LatestRequest') return { latestRequest: () => ({ push() {}, cancel() {}, flush() {} }) };
      if (id === './distance' || id === 'moonlight-ui/registryOptions') return {};
      if (id.endsWith('.vue') || id === '@lucide/vue') return {};
      return require(id);
    },
    module,
    module.exports,
  );
  let exposed;
  const scope = vue.effectScope();
  scope.run(() =>
    module.exports.default.setup(
      {},
      {
        expose: (value) => {
          exposed = value;
        },
      },
    ),
  );
  const state = vue.proxyRefs(exposed);
  state.selectedBundle = 'demo';
  state.selectedRegistry = 'demo:npcs';
  state.bundleRegistries = { demo: ['demo:npcs', 'demo:spawns'] };
  state.scenarioMode = true;
  state.visible = true;
  return { state, calls, files, definitions, storage, close: () => scope.stop() };
}

const entry = (name, registry, scenario, extra = {}) => ({
  registry,
  path: `demo/server/data/demo/${registry.split(':')[1]}/${name}.json`,
  contents: JSON.stringify({
    ...extra,
    metadata: { scenario: `moonlight:${scenario.toLowerCase().replace(/ /g, '_')}`, name },
  }),
});

test('scenario project combines registries and opening entries retains their schema and list', async () => {
  const view = editor([
    entry('guard', 'demo:npcs', 'Raid', { enabled: true }),
    entry('wolves', 'demo:spawns', 'Raid', { active: true }),
    entry('friend', 'demo:npcs', 'Peace'),
  ]);
  await view.state.loadScenarioProjects();
  view.state.selectedScenario = 'moonlight:raid';
  assert.ok(
    view.calls
      .filter((call) => call.operation === 'open-file')
      .every((call) => call.payload.path.includes('/scenarios/')),
  );
  assert.deepEqual(
    view.state.listedFiles.map((file) => file.registry),
    ['demo:npcs', 'demo:spawns'],
  );
  view.state.receiveFile(view.files[1]);
  assert.equal(view.state.selectedRegistry, 'demo:spawns');
  assert.deepEqual(view.state.registrySchema, { active: 'enabled' });
  assert.equal(view.state.listedFiles.length, 2);
  assert.equal(
    view.state.scenarioDefinitions.find((scenario) => scenario.identifier === view.state.selectedScenario)?.enabled,
    true,
  );
  await view.state.setScenarioEnabled(false);
  assert.equal(JSON.parse(view.files[0].contents).enabled, false);
  assert.equal(JSON.parse(view.files[1].contents).active, false);
  assert.equal(
    view.state.scenarioDefinitions.find((scenario) => scenario.identifier === view.state.selectedScenario)?.enabled,
    false,
  );
  await view.state.loadScenarioProjects();
  assert.deepEqual(view.state.registrySchema, { active: 'enabled' });
  await view.state.setScenarioEnabled(true);
  assert.equal(JSON.parse(view.files[0].contents).enabled, true);
  assert.equal(JSON.parse(view.files[1].contents).active, true);
  assert.equal(
    view.state.scenarioDefinitions.find((scenario) => scenario.identifier === view.state.selectedScenario)?.enabled,
    true,
  );
  view.state.selectedScenario = 'moonlight:peace';
  assert.equal(view.state.listedFiles.length, 1);
  view.close();
});

test('scenario creation and entry creation use selected registry and persist membership in draft contents', async () => {
  const view = editor([]);
  await view.state.loadScenarioProjects();
  await view.state.createScenario(' New Raid ');
  assert.equal(view.state.selectedScenario, 'moonlight:new_raid');
  view.state.createFile('new_spawn', false, 'demo:spawns');
  await new Promise((resolve) => setImmediate(resolve));
  const request = view.calls.find(
    (call) => call.operation === 'create-file' && call.payload.registry === 'demo:spawns',
  ).payload;
  assert.equal(request.registry, 'demo:spawns');
  assert.equal(scenarios.scenarioFromContents(request.contents), 'moonlight:new_raid');
  assert.equal(JSON.parse(request.contents).active, false);
  view.state.receiveFile({
    path: 'demo/server/data/demo/spawns/new_spawn.json',
    registry: request.registry,
    contents: request.contents,
    draft: true,
  });
  assert.deepEqual(
    view.state.listedFiles.map((file) => file.registry),
    ['demo:spawns'],
  );
  await vue.nextTick();
  assert.equal(view.storage.get('moonlight-editor.scenarios'), undefined);
  assert.deepEqual(JSON.parse(view.definitions[0].contents), { name: 'New Raid', enabled: false });
  assert.equal(view.definitions[0].path, 'demo/server/data/moonlight/scenarios/new_raid.json');
  view.close();
  const reloaded = editor([], false, view.definitions);
  await reloaded.state.loadScenarioProjects();
  assert.deepEqual(reloaded.state.scenarios, ['moonlight:new_raid']);
  reloaded.close();
});

test('collection changes every selected entry and batches permissions before applying any', async () => {
  const files = Array.from({ length: 40 }, (_, index) =>
    entry(`guard_${index}`, 'demo:npcs', 'Raid', { enabled: true }),
  );
  files.push(entry('peace', 'demo:npcs', 'Peace', { enabled: true }));
  const view = editor(files);
  await view.state.loadScenarioProjects();
  view.state.selectedScenario = 'moonlight:raid';
  await view.state.setScenarioEnabled(false);
  assert.equal(view.calls.filter((call) => call.operation === 'save-file').length, 41);
  assert.deepEqual(
    view.calls.filter((call) => call.operation === 'permissions').map((call) => call.payload.checks.length),
    [32, 9],
  );
  assert.ok(files.slice(0, 40).every((file) => JSON.parse(file.contents).enabled === false));
  assert.equal(JSON.parse(files[40].contents).enabled, true);
  assert.ok(files.every((file) => scenarios.scenarioFromContents(file.contents)));
  view.close();
});

test('denied collection permissions cause no writes', async () => {
  const view = editor([entry('guard', 'demo:npcs', 'Raid', { enabled: true })], true);
  await view.state.loadScenarioProjects();
  await view.state.setScenarioEnabled(false);
  assert.ok(!view.calls.some((call) => call.operation === 'save-file'));
  assert.equal(view.state.statusIsError, true);
  assert.match(view.state.status, /cannot edit/);
  view.close();
});

test('project refresh updates cached membership after rollback and preserves unapplied edits', async () => {
  const file = entry('guard', 'demo:npcs', 'Raid', { enabled: true });
  const view = editor([file]);
  await view.state.loadScenarioProjects();
  view.state.receiveFile(file);
  file.contents = scenarios.withScenario(file.contents, 'moonlight:peace');
  await view.state.loadScenarioProjects();
  view.state.selectedScenario = 'moonlight:peace';
  assert.equal(view.state.listedFiles.length, 1);
  view.state.entries[file.path].contents = scenarios.withScenario(file.contents, 'Local');
  file.contents = scenarios.withScenario(file.contents, 'Remote');
  await view.state.loadScenarioProjects();
  assert.equal(scenarios.scenarioFromContents(view.state.entries[file.path].contents), 'Local');
  assert.ok(
    view.calls
      .filter((call) => call.operation === 'open-file')
      .every((call) => call.payload.path.includes('/scenarios/')),
  );
  view.close();
});

test('empty scenarios are registry entries and can be enabled without member entries', async () => {
  const view = editor([]);
  await view.state.createScenario('Empty');
  assert.equal(view.state.selectedScenario, 'moonlight:empty');
  assert.equal(
    view.state.scenarioDefinitions.find((scenario) => scenario.identifier === view.state.selectedScenario)?.enabled,
    false,
  );
  assert.equal(view.state.listedFiles.length, 0);
  await view.state.setScenarioEnabled(true);
  assert.equal(
    view.state.scenarioDefinitions.find((scenario) => scenario.identifier === view.state.selectedScenario)?.enabled,
    true,
  );
  assert.equal(JSON.parse(view.definitions[0].contents).enabled, true);
  view.close();
});

test('scenario catalog comes from the registry, not member metadata or local storage', async () => {
  const view = editor([entry('guard', 'demo:npcs', 'Raid')], false, []);
  await view.state.loadScenarioProjects();
  assert.deepEqual(view.state.scenarios, []);
  assert.equal(view.state.selectedScenario, '');
  view.close();
});

test('moving from registry mode changes only metadata and leaves a pending resource change', async () => {
  const file = entry('guard', 'demo:npcs', 'Raid', { enabled: true, script: 'original' });
  const view = editor([file, entry('friend', 'demo:npcs', 'Peace')]);
  view.state.scenarioMode = false;
  await view.state.loadScenarios();
  assert.ok(!view.calls.some((call) => call.operation === 'search-resource-metadata'));
  view.state.receiveFile(file);
  view.state.entries[file.path].contents = JSON.stringify({ ...JSON.parse(file.contents), script: 'unsaved' });
  await view.state.moveToScenario(file.path, 'moonlight:peace');
  assert.equal(scenarios.scenarioFromContents(file.contents), 'moonlight:peace');
  assert.equal(JSON.parse(file.contents).script, 'original');
  assert.equal(JSON.parse(file.contents).enabled, true);
  const local = view.state.entries[file.path];
  assert.equal(JSON.parse(local.contents).script, 'unsaved');
  assert.equal(scenarios.scenarioFromContents(local.contents), 'moonlight:peace');
  assert.equal(local.appliedContents, file.contents);
  assert.notEqual(local.contents, local.appliedContents);
  assert.ok(view.calls.some((call) => call.operation === 'pending-changes'));
  view.close();
});

test('moving a draft keeps it local and moving a saved entry updates the scenario list', async () => {
  const file = entry('guard', 'demo:npcs', 'Raid');
  const view = editor([file, entry('friend', 'demo:npcs', 'Peace')]);
  await view.state.loadScenarioProjects();
  view.state.selectedScenario = 'moonlight:raid';
  await view.state.moveToScenario(file.path, 'moonlight:peace');
  assert.equal(view.state.listedFiles.length, 0);
  view.state.selectedScenario = 'moonlight:peace';
  assert.equal(view.state.listedFiles.length, 2);
  const draft = entry('draft', 'demo:npcs', 'Raid');
  view.state.receiveFile({ ...draft, draft: true });
  const writes = view.calls.filter((call) => call.operation === 'save-file').length;
  await view.state.moveToScenario(draft.path, 'moonlight:peace');
  assert.equal(view.state.entries[draft.path].draft, true);
  assert.equal(view.state.entries[draft.path].appliedContents, '');
  assert.equal(scenarios.scenarioFromContents(view.state.entries[draft.path].contents), 'moonlight:peace');
  assert.equal(view.calls.filter((call) => call.operation === 'save-file').length, writes);
  view.close();
});

test('moving an entry checks permissions and rejects unknown scenarios', async () => {
  const file = entry('guard', 'demo:npcs', 'Raid');
  const original = file.contents;
  const view = editor([file, entry('friend', 'demo:npcs', 'Peace')], true);
  await view.state.loadScenarioProjects();
  await view.state.moveToScenario(file.path, 'moonlight:unknown');
  assert.match(view.state.status, /existing scenario/);
  await view.state.moveToScenario(file.path, 'moonlight:peace');
  assert.match(view.state.status, /cannot edit/);
  assert.equal(file.contents, original);
  assert.ok(!view.calls.some((call) => call.operation === 'save-file'));
  view.close();
});

test('Manage Scenario opens its registry file with the enabled schema while keeping member entries in the sidebar', async () => {
  const view = editor([entry('guard', 'demo:npcs', 'Raid', { enabled: true }), entry('friend', 'demo:npcs', 'Peace')]);
  await view.state.loadScenarioProjects();
  view.state.selectedScenario = 'moonlight:raid';
  const paths = view.state.listedFiles.map((file) => file.path);
  await view.state.manageScenario();
  assert.equal(view.state.selectedPath, 'demo/server/data/moonlight/scenarios/raid.json');
  assert.equal(view.state.selectedRegistry, 'moonlight:scenarios');
  assert.deepEqual(view.state.registrySchema, { name: 'string', enabled: 'enabled' });
  assert.deepEqual(
    view.state.listedFiles.map((file) => file.path),
    paths,
  );
  assert.equal(view.state.scenarioMode, true);
  view.state.contents = JSON.stringify({ name: 'Raid renamed', enabled: false });
  view.state.resourcePermissions = { apply: true };
  view.state.save();
  while (view.state.scenarioBusy) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(JSON.parse(view.files[0].contents).enabled, false);
  const definition = view.definitions.find((file) => file.path.endsWith('/raid.json'));
  assert.deepEqual(JSON.parse(definition.contents), { name: 'Raid renamed', enabled: false });
  assert.equal(view.state.contents, definition.contents);
  view.close();
});
