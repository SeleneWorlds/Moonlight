import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const { parse, compileScript } = require('@vue/compiler-sfc');
const { transformSync } = require('esbuild');
const { createRenderer, h } = require('vue');
const workspace = fileURLToPath(new URL('../..', import.meta.url));
const shared = resolve(workspace, 'moonlight-ui');
const modules = new Map();

function loadComponent(filename) {
  if (modules.has(filename)) return modules.get(filename);
  const source = readFileSync(filename, 'utf8');
  const { descriptor } = parse(source, { filename });
  const script = compileScript(descriptor, { id: filename, inlineTemplate: true });
  const { code } = transformSync(script.content, { loader: 'ts', format: 'cjs' });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(
    (id) => (id.endsWith('.vue') ? loadComponent(resolve(dirname(filename), id)) : require(id)),
    module,
    module.exports,
  );
  modules.set(filename, module.exports);
  return module.exports;
}

function mount(name, props = {}, slots = {}) {
  const root = { children: [] };
  const node = (type, text = '') => ({
    type,
    text,
    props: {},
    children: [],
    focus() {
      this.focused = true;
    },
  });
  const renderer = createRenderer({
    createElement: node,
    createText: (text) => node('text', text),
    createComment: (text) => node('comment', text),
    setText: (element, text) => {
      element.text = text;
    },
    setElementText: (element, text) => {
      element.text = text;
    },
    patchProp: (element, key, _previous, value) => {
      element.props[key] = value;
    },
    insert: (element, parent) => {
      parent.children.push(element);
      element.parent = parent;
    },
    remove: (element) => {
      element.parent.children.splice(element.parent.children.indexOf(element), 1);
    },
    parentNode: (element) => element.parent,
    nextSibling: () => null,
  });
  const component = loadComponent(resolve(shared, 'ui/src', `${name}.vue`)).default;
  const app = renderer.createApp({ render: () => h(component, { ...props, ref: 'control' }, slots) });
  const instance = app.mount(root);
  return { element: root.children[0], control: instance.$refs.control, app };
}

test('shared buttons preserve native attributes, events, slots, and programmatic focus', () => {
  let received;
  const { element, control, app } = mount(
    'MoonlightButton',
    {
      type: 'submit',
      disabled: true,
      'aria-label': 'Create entry',
      onClick: (event) => {
        received = event;
      },
    },
    { default: () => 'Create' },
  );
  assert.equal(element.type, 'button');
  assert.equal(element.props.type, 'submit');
  assert.equal(element.props.disabled, true);
  assert.equal(element.props['aria-label'], 'Create entry');
  const event = { shiftKey: true };
  element.props.onClick(event);
  assert.equal(received, event);
  control.focus();
  assert.equal(element.focused, true);
  app.unmount();
});

test('shared surfaces expose their native element and switches forward their state and events', () => {
  const surface = mount('MoonlightSurface', { as: 'section', role: 'dialog' });
  assert.equal(surface.element.type, 'section');
  assert.equal(surface.element.props.role, 'dialog');
  assert.equal(surface.control.element, surface.element);
  surface.app.unmount();
  let clicks = 0;
  const toggle = mount('MoonlightSwitch', {
    checked: true,
    disabled: true,
    'aria-label': 'Enabled',
    onClick: () => {
      clicks++;
    },
  });
  assert.equal(toggle.element.type, 'button');
  assert.equal(toggle.element.props.type, 'button');
  assert.equal(toggle.element.props.role, 'switch');
  assert.equal(toggle.element.props['aria-checked'], true);
  assert.equal(toggle.element.props.disabled, true);
  assert.equal(toggle.element.props['aria-label'], 'Enabled');
  toggle.element.props.onClick({});
  assert.equal(clicks, 1);
  toggle.app.unmount();
});

test('both consumers use the same presentation and contain no application stylesheet overrides', () => {
  for (const bundle of ['moonlight-admin', 'moonlight-editor']) {
    const directory = resolve(workspace, bundle, 'ui/src');
    for (const filename of readdirSync(directory).filter((name) => name.endsWith('.vue'))) {
      assert.doesNotMatch(readFileSync(resolve(directory, filename), 'utf8'), /<style\b/, `${bundle}/${filename}`);
    }
    const entry = readFileSync(resolve(directory, 'main.ts'), 'utf8');
    assert.match(entry, /moonlight-ui\/styles\/primitives.css/);
    assert.match(entry, /moonlight-ui\/styles\/theme.css/);
  }
  const directory = resolve(shared, 'ui/styles');
  assert.deepEqual(readdirSync(directory).sort(), ['primitives.css', 'theme.css']);
  for (const filename of readdirSync(directory)) {
    assert.doesNotMatch(readFileSync(resolve(directory, filename), 'utf8'), /moonlight-(admin|editor)/);
  }
});

test('shared modals space content and actions and preserve native dialog behavior', () => {
  let submitted;
  let cancelled;
  const { element, control, app } = mount(
    'MoonlightModal',
    {
      title: 'New entry',
      onSubmit: (event) => {
        submitted = event;
      },
      onCancel: (event) => {
        cancelled = event;
      },
    },
    {
      default: () => h('input', { required: true }),
      actions: () => h('button', { type: 'submit' }, 'Create'),
    },
  );
  assert.equal(element.type, 'dialog');
  const form = element.children.find((child) => child.type === 'form');
  assert.equal(form.props.class, 'ml-stack ml-gap');
  const title = form.children.find((child) => child.type === 'h2');
  assert.equal(title.text, 'New entry');
  assert.equal(element.props['aria-labelledby'], title.props.id);
  const actions = form.children.find((child) => child.type === 'div');
  assert.equal(actions.props.class, 'ml-row ml-end ml-gap');
  assert.equal(actions.children.find((child) => child.type === 'button').props.type, 'submit');
  const escape = {
    key: 'Escape',
    stopPropagation() {
      this.stopped = true;
    },
    preventDefault() {
      this.prevented = true;
    },
  };
  element.props.onKeydown(escape);
  assert.equal(escape.stopped, true);
  assert.equal(escape.prevented, undefined);
  const enter = {
    key: 'Enter',
    stopPropagation() {
      this.stopped = true;
    },
  };
  element.props.onKeydown(enter);
  assert.equal(enter.stopped, undefined);
  const event = {
    preventDefault() {
      this.prevented = true;
    },
  };
  form.props.onSubmit(event);
  assert.equal(submitted, event);
  assert.equal(event.prevented, true);
  element.props.onCancel(event);
  assert.equal(cancelled, event);
  element.showModal = () => {
    element.open = true;
  };
  element.close = () => {
    element.open = false;
  };
  control.showModal();
  assert.equal(element.open, true);
  control.close();
  assert.equal(element.open, false);
  app.unmount();
});
