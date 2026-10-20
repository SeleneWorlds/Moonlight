import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const { transformSync } = require('esbuild');
const source = readFileSync(new URL('../../moonlight-ui/ui/src/popover.ts', import.meta.url), 'utf8');
const { code } = transformSync(source, { loader: 'ts', format: 'cjs' });
const module = { exports: {} };
new Function('module', 'exports', code)(module, module.exports);
const { positionPopover } = module.exports;

test('menus choose available space inside the scrolling form and resize after filtering', () => {
  const previousWindow = globalThis.window;
  const previousStyle = globalThis.getComputedStyle;
  globalThis.window = { innerHeight: 900 };
  globalThis.getComputedStyle = (element) => ({ overflowY: element.overflow ?? 'visible' });
  try {
    const form = {
      overflow: 'auto',
      clientTop: 1,
      clientHeight: 400,
      getBoundingClientRect: () => ({ top: 100 }),
      parentElement: null,
    };
    const anchor = {
      parentElement: form,
      getBoundingClientRect: () => ({ top: 440, bottom: 480 }),
    };
    const popup = { parentElement: anchor, scrollHeight: 250, offsetHeight: 100, clientHeight: 98, style: {} };
    positionPopover(popup);
    assert.equal(popup.style.bottom, 'calc(100% + 4px)');
    assert.equal(popup.style.maxHeight, '252px');

    popup.scrollHeight = 10;
    positionPopover(popup);
    assert.equal(popup.style.top, 'calc(100% + 4px)');
    assert.equal(popup.style.bottom, 'auto');

    anchor.getBoundingClientRect = () => ({ top: 280, bottom: 320 });
    popup.scrollHeight = 500;
    positionPopover(popup);
    assert.equal(popup.style.maxHeight, '177px');
    assert.equal(popup.style.top, 'calc(100% + 4px)');
  } finally {
    globalThis.window = previousWindow;
    globalThis.getComputedStyle = previousStyle;
  }
});
