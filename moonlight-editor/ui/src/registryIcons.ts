import { defineAsyncComponent, type Component } from 'vue';

type IconModules = Record<string, () => Promise<{ default: Component }>>;
const catalogs = new WeakMap<
  IconModules,
  { loaders: Map<string, IconModules[string]>; components: Map<string, Component> }
>();

export function iconNameKey(name: string): string | undefined {
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    return undefined;
  }
  return name.replace(/Icon$/, '').replace(/[-_]/g, '').toLowerCase();
}

export function resolveRegistryIcon(name: string, modules: IconModules): Component | undefined {
  const key = iconNameKey(name);
  if (!key) {
    return undefined;
  }
  let catalog = catalogs.get(modules);
  if (!catalog) {
    catalog = { loaders: new Map(), components: new Map() };
    for (const [path, loader] of Object.entries(modules)) {
      const basename = path.slice(path.lastIndexOf('/') + 1).replace(/\.mjs$/, '');
      const iconKey = iconNameKey(basename);
      if (iconKey) {
        catalog.loaders.set(iconKey, loader);
      }
    }
    catalogs.set(modules, catalog);
  }
  const loader = catalog.loaders.get(key);
  if (!loader) {
    return undefined;
  }
  let component = catalog.components.get(key);
  if (!component) {
    component = defineAsyncComponent(async () => (await loader()).default);
    catalog.components.set(key, component);
  }
  return component;
}
