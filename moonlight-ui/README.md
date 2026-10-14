# Moonlight UI

Shared Vue source components and styles for Moonlight bundles. This bundle has no standalone UI or server entrypoint. Consumers compile its sources into their own UI assets, so it needs no separate build or runtime mount.

## Use

Add `moonlight-ui` to the Selene bundle dependencies and `"moonlight-ui": "file:../moonlight-ui"` to the npm dependencies. Use the Vite aliases, Vue deduplication, and TypeScript paths in moonlight-editor as the build configuration example. Install dependencies in the consuming bundle.

```ts
import SchemaForm from 'moonlight-ui/SchemaForm.vue';
import SelectInput from 'moonlight-ui/SelectInput.vue';
import RegistryVisual from 'moonlight-ui/RegistryVisual.vue';
import 'moonlight-ui/styles/theme.css';
import 'moonlight-ui/styles/primitives.css';
```

The package also exports components from `moonlight-ui`. Import individual files when only a subset is needed. Vue is a peer dependency; inputs that display icons also require the optional `@lucide/vue` peer dependency.

## Ownership

Reusable schema forms, collection controls, script and JSON inputs, ranges, areas, directions, selection controls, and visual previews live in `ui/src`, together with their types and helpers. Resource-backed controls use the common HTTP/registry adapter. The shared Selene injection symbol ensures previews and controls receive the API provided by their consumer.

Editor and admin retain workflow logic, network handling, and template composition. There are no application-specific stylesheets. Both compose the same shared surfaces, switches, buttons, fields, popups, toolbars, lists, status messages, and layout utilities. `primitives.css` provides a single definition for each presentation primitive; component styles describe the reusable component itself. Add new reusable presentation primitives here rather than introducing rules for a particular consumer.

Add the `moonlight-ui` class to the mount element (both consumers do this). Shared styles load inside the consumer's Selene shadow root; they require no document-global selectors. Use `MoonlightSurface` for panels, cards, popups, and status surfaces, and `MoonlightSwitch` for toggles. World markers and range previews are reusable components too.

Theme colors use `--moonlight-*` CSS variables with defaults. Import `theme.css` once per consumer; override variables on the mount element to customize a theme. Component-specific layout and interaction styles remain colocated with shared components.

## Validation

Run `npm run build` and `npm run lint` in both consumers, and `npm test` in moonlight-editor. The editor typechecks all shared components. Shared files can also be linted and formatted using the editor tooling.

## Buttons

Use `MoonlightButton` for every button. It renders a native button, forwards attributes and listeners, and defaults to `type="button"`. Use `type="submit"` for form submission. Variants are `primary`, `secondary` (default), `danger`, `success`, and `ghost`; sizes are `small`, `medium` (default), and `icon`. Icon-only buttons require an accessible label. Use `variant="ghost"` for expandable headers and other borderless controls; its hover and pressed states keep the border transparent. Use `tone="warning"` for yellow selected text and hover highlights. Add `selection-style="text"` for toggles whose selected state changes only the text, with a background highlight only on hover. Ghost highlights use a subtle tint. Template refs expose `focus()`.

```vue
<MoonlightButton variant="primary" :disabled="saving" @click="save">Save</MoonlightButton>
<MoonlightButton variant="danger" @click="remove">Delete</MoonlightButton>
<MoonlightButton type="submit">Create</MoonlightButton>
```

Button appearance, hover, focus, and disabled styles belong to this component. Consumers can supply layout classes and selected-state styling.

Use `ButtonGroup` to join adjacent `MoonlightButton` controls. It removes their touching corner radii, overlaps shared borders, and keeps keyboard focus outlines visible. Supply an accessible group label and put the buttons directly in its slot.

```vue
<ButtonGroup aria-label="Action controls">
  <MoonlightButton variant="ghost" aria-label="Favorite">☆</MoonlightButton>
  <MoonlightButton>Action</MoonlightButton>
</ButtonGroup>
```
