import assert from 'node:assert/strict';
import { test } from 'node:test';
import { iconNameKey, resolveRegistryIcon } from '../ui/src/registryIcons.ts';

test('registry icons accept Lucide kebab names and component names and reject unknown names', async () => {
  let loads = 0;
  const component = { render: () => null };
  const modules = {
    '/icons/map-pin.mjs': async () => {
      loads++;
      return { default: component };
    },
    '/icons/door-open.mjs': async () => {
      throw new Error('Unused icon loaded');
    },
  };
  assert.equal(iconNameKey('map-pin'), iconNameKey('MapPin'));
  assert.equal(iconNameKey('MapPinIcon'), iconNameKey('map-pin'));
  assert.equal(iconNameKey('Grid2X2'), iconNameKey('grid-2x2'));
  assert.equal(resolveRegistryIcon('unknown-icon', modules), undefined);
  assert.equal(resolveRegistryIcon('../../icons/map-pin', modules), undefined);
  assert.equal(resolveRegistryIcon('', modules), undefined);
  const icon = resolveRegistryIcon('map-pin', modules);
  assert.equal(resolveRegistryIcon('MapPin', modules), icon);
  assert.equal(loads, 0);
  assert.equal(await icon.__asyncLoader(), component);
  assert.equal(loads, 1);
});
