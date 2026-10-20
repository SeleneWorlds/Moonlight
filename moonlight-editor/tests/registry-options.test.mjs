import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseRegistryOptions } from '../../moonlight-ui/ui/src/registryOptions.ts';

test('unnamed registry entries display their identifier and preserve the selection value and visual', () => {
  for (const label of ['', '   ']) {
    const [option] = parseRegistryOptions('illarion:items', [
      { value: 'illarion:item_3081', label, visual: 'illarion:items/item_3081' },
    ]);
    assert.deepEqual(option, {
      value: 'illarion:item_3081',
      label: 'illarion:item_3081',
      visual: 'illarion:items/item_3081',
    });
  }
});

test('named registry entries retain their display label', () => {
  assert.deepEqual(parseRegistryOptions('illarion:items', [{ value: 'illarion:item_1', label: 'An item' }]), [
    { value: 'illarion:item_1', label: 'An item' },
  ]);
});
