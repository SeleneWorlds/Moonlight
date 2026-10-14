import assert from 'node:assert/strict';
import { test } from 'node:test';
import { containDialogEscape, ownsEscape } from '../../moonlight-ui/ui/src/keyboard.ts';

test('Escape belongs to dialogs across shadow roots, even after closing during dispatch', () => {
  const previous = globalThis.Element;
  globalThis.Element = class Element {
    constructor(localName) {
      this.localName = localName;
    }
  };
  try {
    const input = new Element('input');
    const dialog = new Element('dialog');
    const host = new Element('div');
    const event = {
      key: 'Escape',
      target: host,
      defaultPrevented: false,
      composedPath: () => [input, dialog, {}, host],
      stopPropagation() { this.stopped = true; },
    };
    let listener;
    const root = {
      addEventListener(type, handler) { assert.equal(type, 'keydown'); listener = handler; },
      removeEventListener(type, handler) { assert.equal(type, 'keydown'); assert.equal(handler, listener); listener = null; },
    };
    const release = containDialogEscape(root);
    listener(event);
    assert.equal(event.stopped, true);
    assert.equal(event.defaultPrevented, false);
    assert.equal(ownsEscape(event), true);
    dialog.open = false;
    assert.equal(ownsEscape(event), true);
    event.composedPath = () => [input, host];
    assert.equal(ownsEscape(event), false);
    event.stopped = false;
    listener(event);
    assert.equal(event.stopped, false);
    event.defaultPrevented = true;
    assert.equal(ownsEscape(event), true);
    release();
    assert.equal(listener, null);
  } finally {
    globalThis.Element = previous;
  }
});
