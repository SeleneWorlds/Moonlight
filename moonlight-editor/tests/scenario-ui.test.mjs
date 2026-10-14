import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createRenderer, h, nextTick, reactive } from 'vue';
import * as scenarios from '../ui/src/scenarios.ts';
globalThis.Document = class Document {};
globalThis.ShadowRoot = class ShadowRoot {};
const require = createRequire(import.meta.url);
const { parse, compileScript } = require('@vue/compiler-sfc');
const { transformSync } = require('esbuild');
const filename = fileURLToPath(new URL('../ui/src/FileModal.vue', import.meta.url));
const source = readFileSync(filename, 'utf8').replace(
  '</script>',
  `defineExpose({ openCreateDialog, submitCreate, entryName, entryRegistry, submitScenario, scenarioName, contextPath, movePath, moveTarget, submitMove });\n</script>`,
);
const { descriptor } = parse(source, { filename });
const script = compileScript(descriptor, { id: 'scenario-ui', inlineTemplate: true });
const { code } = transformSync(script.content, { loader: 'ts', format: 'cjs' });
const module = { exports: {} };
new Function('require', 'module', 'exports', code)(
  (id) => {
    if (id === './scenarios') return scenarios;
    if (id.endsWith('.vue'))
      return {
        inheritAttrs: false,
        setup:
          (_, { attrs, slots }) =>
          () =>
            h(id.includes('SelectInput') ? 'select' : 'button', attrs, slots.default?.()),
      };
    if (id === '@lucide/vue') return new Proxy({}, { get: () => ({ render: () => h('svg') }) });
    return require(id);
  },
  module,
  module.exports,
);

function mount(overrides = {}) {
  const props = reactive({
    selectedBundle: 'demo',
    selectedRegistry: 'demo:npcs',
    selectedScenario: 'Raid',
    scenarioMode: true,
    scenarioBusy: false,
    scenarioCatalogLoading: false,
    scenarios: ['Raid', 'Peace'],
    scenarioLabels: { Raid: 'Raid', Peace: 'Peace' },
    bundles: ['demo'],
    registries: ['demo:npcs', 'demo:spawns'],
    contents: '{"enabled":true,"metadata":{"scenario":"Raid","name":"Guard"}}',
    projectFiles: [
      { path: 'demo/server/data/demo/npcs/guard.json', registry: 'demo:npcs', icon: 'user' },
      { path: 'demo/server/data/demo/spawns/wolves.json', registry: 'demo:spawns', icon: 'paw-print' },
    ],
    projectLoading: false,
    editorLoading: false,
    selectedPath: 'demo/server/data/demo/npcs/guard.json',
    isDirty: false,
    permissions: { apply: true },
    pendingChanges: 0,
    pendingPaths: [],
    localPaths: [],
    status: '',
    statusIsError: false,
    schema: { enabled: 'enabled' },
    registryOptions: {},
    confirmation: null,
    ...overrides,
  });
  const events = [];
  const root = { children: [] };
  const node = (type, text = '') => ({
    type,
    text,
    props: {},
    children: [],
    style: {},
    addEventListener() {},
    removeEventListener() {},
    getRootNode() {
      return {};
    },
    showModal() {
      this.open = true;
    },
    close() {
      this.open = false;
    },
  });
  const renderer = createRenderer({
    createElement: node,
    createText: (text) => node('text', text),
    createComment: (text) => node('comment', text),
    setText: (node, text) => {
      node.text = text;
    },
    setElementText: (node, text) => {
      node.text = text;
    },
    patchProp: (node, key, _, value) => {
      node.props[key] = value;
    },
    insert: (node, parent) => {
      parent.children.push(node);
      node.parent = parent;
    },
    remove: (node) => {
      node.parent.children.splice(node.parent.children.indexOf(node), 1);
    },
    parentNode: (node) => node.parent,
    nextSibling: () => null,
  });
  const app = renderer.createApp({
    render: () =>
      h(module.exports.default, {
        ...props,
        ref: 'modal',
        onToggleScenarioMode: () => events.push(['toggle']),
        onLoadScenarios: () => events.push(['loadScenarios']),
        onMoveToScenario: (...args) => events.push(['move', ...args]),
        onCreateFile: (...args) => events.push(['create', ...args]),
        onCreateScenario: (name) => events.push(['scenario', name]),
        onManageScenario: () => events.push(['manageScenario']),
        'onUpdate:contents': (contents) => {
          props.contents = contents;
        },
      }),
  });
  const instance = app.mount(root);
  const all = () => {
    const result = [];
    const walk = (node) => {
      result.push(node);
      node.children.forEach(walk);
    };
    walk(root);
    return result;
  };
  const text = (node) => `${node.text ?? ''}${node.children.map(text).join('')}`;
  return { props, events, control: instance.$refs.modal, app, all, text };
}

test('scenario mode shows Manage Scenario, the icon creation button, and member entries', () => {
  const view = mount();
  const nodes = view.all();
  assert.ok(nodes.some((node) => node.type === 'select' && node.props.label === 'Scenario'));
  const toggle = nodes.find((node) => node.props?.['aria-label'] === 'Switch between registry and scenario');
  assert.equal(toggle.props['aria-pressed'], true);
  toggle.props.onClick();
  assert.deepEqual(view.events, [['toggle']]);
  assert.ok(!nodes.some((node) => node.props?.['aria-label'] === 'Raid'));
  const manage = nodes.find((node) => node.type === 'button' && view.text(node).trim() === 'Manage Scenario');
  assert.ok(manage);
  manage.props.onClick();
  assert.deepEqual(view.events[1], ['manageScenario']);
  const createButton = nodes.find((node) => node.props?.['aria-label'] === 'New Scenario');
  assert.equal(createButton.props.size, 'icon');
  assert.doesNotMatch(view.text(createButton), /New Scenario/);
  assert.ok(createButton.children.some((node) => node.type === 'svg'));
  assert.match(view.text({ children: nodes.filter((node) => node.type === 'li') }), /guard.json/);
  assert.match(view.text({ children: nodes.filter((node) => node.type === 'li') }), /wolves.json/);
  view.app.unmount();
});

test('new entries choose a registry and new scenarios validate names', async () => {
  const view = mount();
  view.control.openCreateDialog();
  view.control.entryRegistry = 'demo:spawns';
  view.control.entryName = 'new_spawn';
  await nextTick();
  assert.ok(view.all().some((node) => node.type === 'select' && node.props.label === 'Registry'));
  view.control.submitCreate();
  assert.deepEqual(view.events, [['create', 'new_spawn', 'demo:spawns']]);
  view.control.scenarioName = 'Raid';
  view.control.submitScenario();
  assert.equal(view.events.length, 1);
  view.control.scenarioName = ' Night raid ';
  view.control.submitScenario();
  assert.deepEqual(view.events[1], ['scenario', 'Night raid']);
  view.app.unmount();
});

test('selected file has no scenario dropdown and registry mode keeps its picker', async () => {
  const view = mount();
  assert.ok(!view.all().some((node) => node.type === 'select' && node.props.label === 'Entry scenario'));
  view.props.scenarioMode = false;
  await nextTick();
  assert.ok(view.all().some((node) => node.type === 'select' && node.props.label === 'Registry'));
  assert.ok(!view.all().some((node) => node.type === 'select' && node.props.label === 'Scenario'));
  view.app.unmount();
});

test('sidebar context menu moves an entry using the scenario picker in registry mode', async () => {
  const view = mount({ scenarioMode: false });
  const path = 'demo/server/data/demo/npcs/guard.json';
  view.control.contextPath = path;
  await nextTick();
  const action = view
    .all()
    .find((node) => node.props?.role === 'menuitem' && view.text(node).trim() === 'Move to Scenario');
  assert.ok(action);
  action.props.onClick();
  await nextTick();
  assert.deepEqual(view.events, [['loadScenarios']]);
  assert.equal(view.control.movePath, path);
  const picker = view.all().find((node) => node.type === 'select' && node.props.label === 'Target scenario');
  assert.deepEqual(picker.props.options, ['Raid', 'Peace']);
  assert.deepEqual(picker.props['option-labels'], { Raid: 'Raid', Peace: 'Peace' });
  view.control.moveTarget = 'Peace';
  view.control.submitMove();
  assert.deepEqual(view.events[1], ['move', path, 'Peace']);
  view.app.unmount();
});

test('managed scenario uses the existing entry header switch and shows its display name', () => {
  const view = mount({
    selectedPath: 'demo/server/data/moonlight/scenarios/raid.json',
    selectedFileName: 'Raid',
    contents: '{"name":"Raid","enabled":true}',
  });
  const enabled = view.all().find((node) => node.props?.['aria-label'] === 'Enabled');
  assert.equal(enabled.props.checked, true);
  enabled.props.onClick();
  assert.equal(JSON.parse(view.props.contents).enabled, false);
  assert.ok(view.all().some((node) => node.type === 'span' && view.text(node) === 'Raid'));
  view.app.unmount();
});

test('registry icons appear beside entries only in scenario mode', async () => {
  const view = mount();
  const entryIcons = () => view.all().filter((node) => node.props?.name === 'user' || node.props?.name === 'paw-print');
  assert.equal(entryIcons().length, 2);
  assert.ok(entryIcons().every((node) => node.props['aria-hidden'] === 'true' && node.props.size === 16));
  view.props.scenarioMode = false;
  await nextTick();
  assert.equal(entryIcons().length, 0);
  view.app.unmount();
});
