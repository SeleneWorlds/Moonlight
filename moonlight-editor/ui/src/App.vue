<script setup lang="ts">
import MoonlightSurface from 'moonlight-ui/MoonlightSurface.vue';
import MoonlightButton from 'moonlight-ui/MoonlightButton.vue';
import MoonlightModal from 'moonlight-ui/MoonlightModal.vue';
import { ownsEscape } from 'moonlight-ui/keyboard';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Focus, Database, ArrowDown, ArrowUp, Grid2X2, Eye, Lightbulb, X } from '@lucide/vue';
import type { DistancePick, SchemaDefinition } from 'moonlight-ui/schema';
import { latestRequest } from 'moonlight-ui/LatestRequest';
import { parseRegistryOptions } from 'moonlight-ui/registryOptions';
import { scenarioFromContents, withScenario, withEnabled, mapResources } from './scenarios';
import { pickedDistance, projectedCircle } from './distance';
import { useSelene, requestEditorOperation, type ClientNetworkPayload, type Coordinate } from './selene';
import FileModal from './FileModal.vue';
import SchemaForm from 'moonlight-ui/SchemaForm.vue';
import MoonlightWorldMarker from 'moonlight-ui/MoonlightWorldMarker.vue';
import MoonlightWorldPreview from 'moonlight-ui/MoonlightWorldPreview.vue';
import GoToMenu from './GoToMenu.vue';
import ContextMenu from './ContextMenu.vue';

interface EditorGizmo {
  id: string;
  label: string;
  coordinate: Coordinate;
  path?: string;
  lookup?: boolean;
  color?: string;
  visual?: string;
  range?: number;
}

interface ProjectFile {
  path: string;
  name?: string;
  registry?: string;
  scenario?: string;
  enabled?: boolean;
  icon?: string;
}

const selene = useSelene();
let customVisualRegistries = new Set<string>();
const httpListeners = new Map<string, Set<(payload: Record<string, unknown>) => void>>();
function onEditorResponse(id: string, callback: (payload: Record<string, unknown>) => void): () => void {
  const listeners = httpListeners.get(id) ?? new Set();
  httpListeners.set(id, listeners);
  listeners.add(callback);
  const unsubscribe = selene.network.onPayload(id, callback);
  return () => {
    listeners.delete(callback);
    unsubscribe();
  };
}
function requestEditor(operation: string, payload: Record<string, unknown> = {}): void {
  void requestEditorOperation(selene, operation, payload)
    .then((result) => {
      const data = result as Record<string, unknown>;
      const deliver = (id: string, payload = data): void => {
        for (const listener of httpListeners.get(`moonlight-editor:${id}`) ?? []) {
          listener(payload);
        }
      };
      switch (operation) {
        case 'request-bundles':
          deliver('bundle-options');
          break;
        case 'request-bundle-registries':
          deliver('bundle-registry-options');
          break;
        case 'request-project':
          deliver('project-start');
          deliver('project-files');
          deliver('project-end');
          break;
        case 'search-registry':
          deliver('registry-options');
          if (typeof data.registry === 'string' && customVisualRegistries.has(data.registry)) {
            selene.network.sendToServer('moonlight-editor:resolve-registry-visuals', {
              registry: data.registry,
              values: (data.options as Array<{ value: string }>).map((entry) => entry.value),
            });
          }
          break;
        case 'open-file':
          deliver('file');
          break;
        case 'create-file':
          if (typeof data.path === 'string' && entries.value[data.path]?.draft) {
            deliver('error', { message: 'A local draft with this name already exists.' });
            break;
          }
          deliver('file', { ...data, draft: true });
          deliver('file-created');
          break;
        case 'rename-file': {
          const oldPath = payload.path as string;
          const newPath = data.path as string;
          const entry = entries.value[oldPath];
          if (entry) {
            entries.value[newPath] = entry;
            delete entries.value[oldPath];
          }
          deliver('file', data);
          requestProject();
          break;
        }
        case 'save-file':
          deliver('file-saved');
          break;
        case 'pending-changes':
          deliver('pending-changes');
          break;
        case 'persist-changes':
          if (!data.error) {
            deliver('changes-persisted');
          }
          break;
        case 'discard-changes':
          if (!data.error) {
            deliver('changes-discarded');
          }
          break;
      }
      if (data.pendingChanges) {
        deliver('pending-changes', data.pendingChanges as Record<string, unknown>);
      }
      if (data.error) {
        deliver('error', { message: data.error });
      }
    })
    .catch((error: unknown) => {
      for (const listener of httpListeners.get('moonlight-editor:error') ?? []) {
        listener({ message: error instanceof Error ? error.message : String(error) });
      }
    });
}

const inlineForm = ref<{
  id: number;
  title: string;
  coordinate: Coordinate;
  schema: Record<string, SchemaDefinition>;
  fieldLabels?: Record<string, string>;
  contents: string;
} | null>(null);
const inlinePicking = ref(false);
const inlineSaving = ref(false);
const inlineMessage = ref('');
const inlineDialog = ref<InstanceType<typeof MoonlightModal> | null>(null);
watch(
  [inlineDialog, inlinePicking],
  ([dialog, picking]) => {
    if (picking) {
      dialog?.close();
    } else {
      dialog?.showModal();
    }
  },
  { flush: 'post' },
);
function refreshWorldProjection(): void {
  projectionRevision.value += 1;
}
function closeInlineForm(): void {
  if (inlineForm.value) {
    selene.network.sendToServer('moonlight-editor:close-inline-form', { id: inlineForm.value.id });
  }
  inlineForm.value = null;
  inlinePicking.value = false;
  releaseTextCapture?.();
  releaseTextCapture = undefined;
  releasePanelKeys?.();
  releasePanelKeys = undefined;
}
function clickGizmo(gizmo: EditorGizmo): void {
  if (pickingCoordinateField || pickingRegistry || pickingDistance.value) {
    finishCoordinatePicker(gizmo.coordinate);
  } else if (gizmo.lookup) {
    selene.network.sendToServer('moonlight-editor:lookup-coordinate', { ...gizmo.coordinate });
  } else if (gizmo.path) {
    openFile(gizmo.path);
  }
}
function saveInlineForm(): void {
  if (!inlineForm.value || inlineSaving.value) {
    return;
  }
  inlineSaving.value = true;
  selene.network.sendToServer('moonlight-editor:save-inline-form', {
    id: inlineForm.value.id,
    contents: inlineForm.value.contents,
  });
}
const connected = ref(false);
const enabled = ref(false);
const visible = ref(false);
const bundleOptions = ref<string[]>([]);
const bundleRegistries = ref<Record<string, string[]>>({});
const projectFiles = ref<ProjectFile[]>([]);
const SELECTION_STORAGE_KEY = 'moonlight-editor.selection';
function loadSelection(): { bundle: string; registry: string } {
  try {
    const selection: unknown = JSON.parse(window.localStorage.getItem(SELECTION_STORAGE_KEY) ?? 'null');
    if (
      typeof selection === 'object' &&
      selection !== null &&
      'bundle' in selection &&
      typeof selection.bundle === 'string' &&
      'registry' in selection &&
      typeof selection.registry === 'string'
    ) {
      return { bundle: selection.bundle, registry: selection.registry };
    }
  } catch {
    // Storage may be unavailable or contain invalid JSON.
  }
  return { bundle: '', registry: '' };
}
const savedSelection = loadSelection();
const selectedBundle = ref(savedSelection.bundle);
const selectedRegistry = ref(savedSelection.registry);
watch([selectedBundle, selectedRegistry], ([bundle, registry]) => {
  if (!bundle || !registry) {
    return;
  }
  try {
    window.localStorage.setItem(SELECTION_STORAGE_KEY, JSON.stringify({ bundle, registry }));
  } catch {
    // Selection still works when browser storage is unavailable.
  }
});
const scenarioMode = ref(false);
const selectedScenario = ref('');
const SCENARIO_REGISTRY = 'moonlight:scenarios';
interface ScenarioDefinition {
  path: string;
  identifier: string;
  name: string;
  enabled: boolean;
}
const scenarioDefinitions = ref<ScenarioDefinition[]>([]);
const scenarioLabels = computed(() =>
  Object.fromEntries(scenarioDefinitions.value.map((scenario) => [scenario.identifier, scenario.name])),
);
const scenarioProjects = ref<ProjectFile[]>([]);
const registryIcons = ref<Record<string, string | undefined>>({});
const scenarioRegistrySchema = ref<Record<string, SchemaDefinition> | null>(null);
const scenarioSchemas = ref<Record<string, Record<string, SchemaDefinition> | null>>({});
const scenarioBusy = ref(false);
let scenarioRevision = 0;
const scenarios = computed(() => scenarioDefinitions.value.map((scenario) => scenario.identifier).sort());
function scenarioIdentifier(path: string): string {
  const match = path.match(/\/(?:common|server)\/data\/([^/]+)\/scenarios\/(.+)\.json$/);
  if (!match) {
    throw new Error('Invalid scenario resource path.');
  }
  return `${match[1]}:${match[2]}`;
}
const scenarioCatalogLoading = ref(false);
let scenarioCatalogRevision = 0;
async function readScenarioDefinitions(bundle: string): Promise<ScenarioDefinition[]> {
  const project = (await requestEditorOperation(selene, 'request-project', {
    bundle,
    registry: SCENARIO_REGISTRY,
  })) as { files: ProjectFile[]; schema: Record<string, SchemaDefinition> | null };
  if (bundle === selectedBundle.value) {
    scenarioRegistrySchema.value = project.schema;
  }
  return await mapResources(project.files, async (file) => {
    const resource = (await requestEditorOperation(selene, 'open-file', { path: file.path })) as { contents: string };
    const data = JSON.parse(resource.contents);
    const identifier = scenarioIdentifier(file.path);
    return {
      path: file.path,
      identifier,
      name: typeof data.name === 'string' ? data.name : identifier,
      enabled: data.enabled === true,
    };
  });
}
async function loadScenarios(): Promise<void> {
  const revision = ++scenarioCatalogRevision;
  const bundle = selectedBundle.value;
  scenarioCatalogLoading.value = true;
  scenarioDefinitions.value = [];
  setStatus('Loading scenarios…');
  try {
    const definitions = await readScenarioDefinitions(bundle);
    if (revision === scenarioCatalogRevision && bundle === selectedBundle.value) {
      scenarioDefinitions.value = definitions;
      setStatus('Choose a scenario.');
    }
  } catch (error) {
    if (revision === scenarioCatalogRevision && bundle === selectedBundle.value) {
      setStatus(String(error), true);
    }
  } finally {
    if (revision === scenarioCatalogRevision) {
      scenarioCatalogLoading.value = false;
    }
  }
}
async function loadScenarioProjects(): Promise<void> {
  const revision = ++scenarioRevision;
  const bundle = selectedBundle.value;
  projectLoading.value = true;
  scenarioProjects.value = [];
  scenarioSchemas.value = {};
  registrySchema.value = null;
  try {
    const definitions = await readScenarioDefinitions(bundle);
    const results = await mapResources(
      registries.value.filter((registry) => registry !== SCENARIO_REGISTRY),
      async (registry) => {
        const result = (await requestEditorOperation(selene, 'search-resource-metadata', {
          bundle,
          registry,
          key: 'scenario',
          fieldType: 'enabled',
        })) as {
          files: Array<ProjectFile & { metadata: Record<string, unknown>; fields: Record<string, unknown> }>;
          schema: Record<string, SchemaDefinition> | null;
          icon?: string;
        };
        return { ...result, registry };
      },
    );
    const files = results.flatMap((result) =>
      result.files.map((file) => ({
        path: file.path,
        name: file.name,
        registry: result.registry,
        icon: result.icon,
        enabled: Object.entries(result.schema ?? {}).some(
          ([field, definition]) =>
            (typeof definition === 'string' ? definition : definition.type) === 'enabled' &&
            file.fields?.[field] === true,
        ),
        scenario: typeof file.metadata.scenario === 'string' ? file.metadata.scenario : undefined,
      })),
    );
    if (revision !== scenarioRevision || bundle !== selectedBundle.value || !scenarioMode.value) {
      return;
    }
    scenarioDefinitions.value = definitions;
    registryIcons.value = Object.fromEntries(results.map((result) => [result.registry, result.icon]));
    scenarioProjects.value = files;
    scenarioSchemas.value = {
      ...Object.fromEntries(results.map((result) => [result.registry, result.schema])),
      [SCENARIO_REGISTRY]: scenarioRegistrySchema.value,
    };
    if (selectedPath.value) {
      registrySchema.value = scenarioSchemas.value[selectedRegistry.value] ?? null;
    }
    if (!scenarios.value.includes(selectedScenario.value)) {
      selectedScenario.value = scenarios.value[0] ?? '';
    }
    setStatus(`${scenarioProjects.value.length} data files`);
  } catch (error) {
    if (revision === scenarioRevision) {
      setStatus(String(error), true);
    }
  } finally {
    if (revision === scenarioRevision) {
      projectLoading.value = false;
      schemaLoading.value = false;
    }
  }
}
function selectScenario(): void {
  selectedPath.value = null;
}
function toggleScenarioMode(): void {
  scenarioRevision += 1;
  scenarioMode.value = !scenarioMode.value;
  selectedPath.value = null;
  requestProject();
}
async function createScenario(name: string): Promise<void> {
  name = name.trim();
  if (!name || scenarioBusy.value || scenarioDefinitions.value.some((scenario) => scenario.name === name)) {
    return;
  }
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!slug) {
    setStatus('Use letters or numbers in the scenario name.', true);
    return;
  }
  scenarioBusy.value = true;
  try {
    const created = (await requestEditorOperation(selene, 'create-file', {
      bundle: selectedBundle.value,
      registry: SCENARIO_REGISTRY,
      namespace: 'moonlight',
      name: slug,
      contents: JSON.stringify({ name, enabled: false }),
    })) as { path: string; contents: string };
    await requestEditorOperation(selene, 'save-file', { path: created.path, contents: created.contents });
    selectedPath.value = null;
    selectedScenario.value = scenarioIdentifier(created.path);
    await loadScenarioProjects();
    setStatus('Scenario created. Persist changes to save it to the bundle.');
  } catch (error) {
    setStatus(String(error), true);
  } finally {
    scenarioBusy.value = false;
    requestEditor('pending-changes');
  }
}
async function manageScenario(): Promise<void> {
  const definition = scenarioDefinitions.value.find((scenario) => scenario.identifier === selectedScenario.value);
  if (!definition || scenarioBusy.value || projectLoading.value || fileLoading.value) {
    return;
  }
  fileLoading.value = true;
  try {
    const resource = (await requestEditorOperation(selene, 'open-file', { path: definition.path })) as {
      path: string;
      contents: string;
    };
    receiveFile({ ...resource, path: definition.path, registry: SCENARIO_REGISTRY });
  } catch (error) {
    fileLoading.value = false;
    setStatus(String(error), true);
  }
}
async function setScenarioEnabled(enabled: boolean, scenarioContents?: string): Promise<void> {
  if (scenarioBusy.value || projectLoading.value || !selectedScenario.value) {
    return;
  }
  scenarioBusy.value = true;
  try {
    const updates = await mapResources(listedFiles.value, async (file) => {
      const schema = scenarioSchemas.value[file.registry ?? ''];
      const local = entries.value[file.path];
      const resource =
        (local && (local.draft || local.contents !== local.appliedContents) ? local : undefined) ??
        ((await requestEditorOperation(selene, 'open-file', { path: file.path })) as { contents: string });
      let updated: string;
      try {
        updated = withEnabled(resource.contents, schema, enabled);
      } catch (error) {
        throw new Error(`${file.path}: ${String(error)}`);
      }
      return { path: file.path, contents: updated };
    });
    const definition = scenarioDefinitions.value.find((scenario) => scenario.identifier === selectedScenario.value);
    if (!definition) {
      throw new Error('Scenario no longer exists.');
    }
    const resource = (await requestEditorOperation(selene, 'open-file', { path: definition.path })) as {
      contents: string;
    };
    updates.push({
      path: definition.path,
      contents: withEnabled(scenarioContents ?? resource.contents, { enabled: 'enabled' }, enabled),
    });
    for (let offset = 0; offset < updates.length; offset += 32) {
      const batch = updates.slice(offset, offset + 32);
      const permissions = await selene.http.request(
        '/resources/permissions',
        {
          checks: batch.map((request) => ({ operation: 'save-file', request })),
        },
        'POST',
      );
      if (
        !Array.isArray(permissions) ||
        permissions.length !== batch.length ||
        permissions.some((value) => value !== true)
      ) {
        throw new Error('You cannot edit every entry in this scenario.');
      }
    }
    for (const update of updates) {
      await requestEditorOperation(selene, 'save-file', update);
      const local = entries.value[update.path];
      if (local) {
        local.contents = update.contents;
        local.appliedContents = update.contents;
        local.draft = false;
      }
    }
    requestEditor('pending-changes');
    requestGizmos();
    await loadScenarioProjects();
    setStatus(`Scenario ${enabled ? 'enabled' : 'disabled'} (${updates.length} entries).`);
  } catch (error) {
    setStatus(String(error), true);
  } finally {
    scenarioBusy.value = false;
    requestEditor('pending-changes');
  }
}
const selectedPath = ref<string | null>(null);
const entries = ref<Record<string, { contents: string; appliedContents: string; draft?: boolean; registry?: string }>>(
  {},
);
function scenarioMatches(value: string | undefined): boolean {
  return (
    !!value &&
    !!selectedScenario.value &&
    (value === selectedScenario.value || value === scenarioLabels.value[selectedScenario.value])
  );
}
const listedFiles = computed<ProjectFile[]>(() => {
  const files = scenarioMode.value ? scenarioProjects.value : projectFiles.value;
  const drafts = Object.entries(entries.value)
    .filter(
      ([path, entry]) =>
        (entry.draft || (scenarioMode.value && entry.contents !== entry.appliedContents)) &&
        bundleFromPath(path) === selectedBundle.value,
    )
    .map(([path, entry]) => ({
      path,
      registry: entry.registry,
      icon: registryIcons.value[entry.registry ?? ''],
      scenario: scenarioFromContents(entry.contents),
    }));
  return [...files, ...drafts.filter(({ path }) => !files.some((file) => file.path === path))]
    .filter((file) =>
      scenarioMode.value
        ? scenarioMatches(
            entries.value[file.path] &&
              (entries.value[file.path]!.draft ||
                entries.value[file.path]!.contents !== entries.value[file.path]!.appliedContents)
              ? scenarioFromContents(entries.value[file.path]!.contents)
              : file.scenario,
          )
        : !file.registry || file.registry === selectedRegistry.value,
    )
    .sort((left, right) => left.path.localeCompare(right.path));
});
const applying = new Map<string, string>();
const contents = computed({
  get: () => (selectedPath.value ? (entries.value[selectedPath.value]?.contents ?? '') : ''),
  set: (value: string) => {
    if (selectedPath.value && entries.value[selectedPath.value]) {
      entries.value[selectedPath.value]!.contents = value;
    }
  },
});
const savedContents = computed(() =>
  selectedPath.value ? (entries.value[selectedPath.value]?.appliedContents ?? '') : '',
);
const localPaths = computed(() =>
  Object.entries(entries.value)
    .filter(([, entry]) => entry.contents !== entry.appliedContents)
    .map(([path]) => path),
);
const pendingChanges = ref(0);
const pendingPaths = ref<string[]>([]);
const confirmation = ref<'persist' | 'discard' | null>(null);
const resourcePermissions = ref({ apply: false, persist: false, discard: false, persistAll: false, discardAll: false });
let permissionRevision = 0;
async function refreshResourcePermissions(): Promise<void> {
  const revision = ++permissionRevision;
  resourcePermissions.value = { apply: false, persist: false, discard: false, persistAll: false, discardAll: false };
  if (!connected.value || !visible.value) {
    return;
  }
  const path = selectedPath.value;
  const target = path ? { path } : {};
  try {
    const result = await selene.http.request(
      '/resources/permissions',
      {
        checks: [
          { operation: 'save-file', request: { ...target, contents: contents.value } },
          { operation: 'persist-changes', request: target },
          { operation: 'discard-changes', request: target },
          { operation: 'persist-changes', request: {} },
          { operation: 'discard-changes', request: {} },
        ],
      },
      'POST',
    );
    if (revision !== permissionRevision || !Array.isArray(result) || result.length !== 5) {
      return;
    }
    resourcePermissions.value = {
      apply: path !== null && result[0] === true,
      persist: path !== null && result[1] === true,
      discard: path !== null && result[2] === true,
      persistAll: result[3] === true,
      discardAll: result[4] === true,
    };
  } catch (error: unknown) {
    if (revision === permissionRevision) {
      setStatus(`Permission check failed: ${error instanceof Error ? error.message : String(error)}`, true);
    }
  }
}
watch([selectedPath, selectedBundle, selectedRegistry, pendingPaths, connected, visible], () => {
  void refreshResourcePermissions();
});

const projectLoading = ref(false);
const schemaLoading = ref(false);
const fileLoading = ref(false);
const registrySchema = ref<Record<string, SchemaDefinition> | null>(null);
const registryOptions = ref<Record<string, Array<{ value: string; label: string; visual?: string }>>>({});
const registryQueries = new Map<string, string>();
const status = ref('Escape closes the file panel');
const statusIsError = ref(false);
const gizmos = ref<EditorGizmo[]>([]);
const showGizmos = ref(true);
const hoveredGizmoId = ref<string | null>(null);
const focusedGizmoId = ref<string | null>(null);
const cameraCoordinate = ref(selene.world.getCameraCoordinate());
const hoveredCoordinate = ref<Coordinate | null>(null);
const moveCameraLevel = (direction: number, event: MouseEvent) => {
  const coordinate = { ...cameraCoordinate.value };
  const offset = event.shiftKey ? 3 : 1;
  selene.network.sendToServer('moonlight-editor:move-camera', {
    ...coordinate,
    z: coordinate.z + direction * offset,
  });
};
const projectionRevision = ref(0);
const showTileGrid = ref(false);
const showLights = ref(selene.world.isLightingEnabled());
async function syncEditorLighting() {
  const lighting = !enabled.value || (showLights.value && cameraZoom > 0.5);
  if (selene.world.isLightingEnabled() !== lighting) {
    await selene.world.setLightingEnabled(lighting);
  }
}

async function toggleLights() {
  showLights.value = !showLights.value;
  await syncEditorLighting();
}
let tileGridCheckRevision = 0;
function toggleTileGrid(): void {
  tileGridCheckRevision += 1;
  showTileGrid.value = !showTileGrid.value;
}
async function enableGridForEmptyLayer(coordinate: Coordinate): Promise<void> {
  const revision = ++tileGridCheckRevision;
  try {
    const hasTile = await selene.world.hasTileAt({ ...coordinate });
    if (enabled.value && revision === tileGridCheckRevision && !hasTile) {
      showTileGrid.value = true;
    }
  } catch (error) {
    console.warn('[Moonlight Editor] Could not check focus tile', error);
  }
}
watch([enabled, showTileGrid], ([active, visible]) => {
  void selene.world.setTileGridVisible(active && visible);
});
const dragging = ref(false);
const pickingDistance = ref<DistancePick | null>(null);
const pickerActive = ref(false);
const distanceCircle = computed(() => {
  void projectionRevision.value;
  const pick = pickingDistance.value;
  if (!pick || pick.coordinate.z !== cameraCoordinate.value.z) {
    return null;
  }
  return {
    points: projectedCircle(pick.coordinate, pick.distance, selene.world.projectCoordinate),
    center: selene.world.projectCoordinate(pick.coordinate),
  };
});
const gizmoRangeCircle = computed(() => {
  void projectionRevision.value;
  if (!enabled.value || !showGizmos.value || pickerActive.value || pickingDistance.value || dragging.value) {
    return null;
  }
  const gizmo = gizmos.value.find(({ id }) => id === (hoveredGizmoId.value ?? focusedGizmoId.value));
  if (!gizmo || gizmo.range === undefined || gizmo.coordinate.z !== cameraCoordinate.value.z) {
    return null;
  }
  return {
    points: projectedCircle(gizmo.coordinate, gizmo.range, selene.world.projectCoordinate),
    center: selene.world.projectCoordinate(gizmo.coordinate),
  };
});
watch([enabled, showGizmos, pickerActive, pickingDistance, dragging, () => cameraCoordinate.value.z], () => {
  hoveredGizmoId.value = null;
  focusedGizmoId.value = null;
});
const isDirty = computed(() => selectedPath.value !== null && contents.value !== savedContents.value);
const bundles = computed(() => [...bundleOptions.value].sort());
const registries = computed(() => bundleRegistries.value[selectedBundle.value] ?? []);
const projectedGizmos = computed(() => {
  void projectionRevision.value;
  return gizmos.value
    .filter(({ coordinate }) => coordinate.z === cameraCoordinate.value.z)
    .map((gizmo) => ({ ...gizmo, screen: selene.world.projectCoordinate(gizmo.coordinate) }));
});

const releases: Array<() => void> = [];
let releaseTextCapture: (() => void) | undefined;
let releasePanelKeys: (() => void) | undefined;
let releasePickerKeys: (() => void) | undefined;
let pickingCoordinateField: string | null = null;
let pickingRegistry: string | null = null;
let pickerCameraZ: number | null = null;
let suppressWorldPointer = false;
let moved = false;
let lastRequested: Coordinate | null = null;
let dragClientX = 0;
let dragClientY = 0;
let dragCameraPosition: { x: number; y: number } | null = null;
let dragSequence = 0;
const MIN_CAMERA_ZOOM = 0.28;
let cameraZoom = 1;
let dragRequestRevision = 0;
let zoomRequestRevision = 0;
const cameraRequests = latestRequest<Coordinate>((coordinate) => {
  if (enabled.value) {
    selene.network.sendToServer('moonlight-editor:move-camera', { ...coordinate });
  }
});
const zoomRequests = latestRequest<number>((zoom) => {
  if (enabled.value) {
    selene.network.sendToServer('moonlight-editor:zoom-camera', { zoom });
  }
});

function bundleFromPath(path: string): string {
  const dataDirectory = path.search(/\/(?:common|server)\/data\//);
  return dataDirectory === -1 ? path.split('/')[0]! : path.slice(0, dataDirectory);
}

function selectFirstRegistry(): void {
  selectedRegistry.value = registries.value[0] ?? '';
}

function isCurrentSelection(payload: ClientNetworkPayload): boolean {
  return payload.bundle === selectedBundle.value && payload.registry === selectedRegistry.value;
}

function setStatus(message: string, error = false): void {
  status.value = message;
  statusIsError.value = error;
}

function requestProject(): void {
  if (scenarioMode.value) {
    void loadScenarioProjects();
    return;
  }
  if (!selectedBundle.value || !selectedRegistry.value) {
    projectLoading.value = false;
    schemaLoading.value = false;
    return;
  }
  projectLoading.value = true;
  schemaLoading.value = true;
  projectFiles.value = [];
  registrySchema.value = null;
  setStatus(`Loading ${selectedRegistry.value} files…`);
  requestEditor('request-project', {
    bundle: selectedBundle.value,
    registry: selectedRegistry.value,
  });
  requestEditor('pending-changes');
}

function searchRegistry(registry: string, query: string, lookup = false): void {
  if (!lookup) {
    registryQueries.set(registry, query);
  }
  requestEditor('search-registry', { registry, query, lookup });
}

function requestBundles(): void {
  projectLoading.value = true;
  schemaLoading.value = true;
  requestEditor('request-bundles');
}

let lastGizmoCoordinate: Coordinate | null = null;
function requestGizmos(): void {
  lastGizmoCoordinate = { ...cameraCoordinate.value };
  selene.network.sendToServer('moonlight-editor:request-gizmos', { ...lastGizmoCoordinate });
}

function requestBundleRegistries(): void {
  if (!selectedBundle.value) {
    requestProject();
    return;
  }
  projectLoading.value = true;
  schemaLoading.value = true;
  requestEditor('request-bundle-registries', { bundle: selectedBundle.value });
}

function selectBundle(): void {
  scenarioRevision += 1;
  selectedScenario.value = '';
  scenarioDefinitions.value = [];
  scenarioProjects.value = [];
  scenarioSchemas.value = {};
  selectedPath.value = null;
  selectedRegistry.value = '';
  projectFiles.value = [];
  registrySchema.value = null;
  requestBundleRegistries();
}

function selectRegistry(): void {
  selectedPath.value = null;
  requestProject();
}

function setProjectVisible(show: boolean, refreshResources = true): void {
  if (show) {
    closeInlineForm();
  }
  visible.value = show;
  if (!show) {
    confirmation.value = null;
  }
  if (show) {
    releaseTextCapture ??= selene.input.captureText();
    releasePanelKeys ??= selene.input.captureKeys('Escape');
    if (connected.value && refreshResources) {
      if (bundleOptions.value.length === 0) {
        requestBundles();
      } else {
        requestBundleRegistries();
      }
    }
  } else {
    releaseTextCapture?.();
    releaseTextCapture = undefined;
    releasePanelKeys?.();
    releasePanelKeys = undefined;
  }
}

function openFile(path: string): void {
  fileLoading.value = true;
  setStatus(`Opening ${path}…`);
  const draft = entries.value[path];
  if (draft?.draft) {
    receiveFile({ path, contents: draft.contents, draft: true, registry: draft.registry });
    return;
  }
  requestEditor('open-file', { path });
}

function newScenarioEntryContents(registry: string): string {
  const value = withScenario('{}', selectedScenario.value);
  const schema = scenarioSchemas.value[registry];
  if (
    !Object.values(schema ?? {}).some(
      (definition) => (typeof definition === 'string' ? definition : definition.type) === 'enabled',
    )
  ) {
    return value;
  }
  return withEnabled(
    value,
    schema,
    scenarioDefinitions.value.find((scenario) => scenario.identifier === selectedScenario.value)?.enabled ?? false,
  );
}
function createFile(name: string, duplicate = false, registry = selectedRegistry.value): void {
  if (
    !selectedBundle.value ||
    !registry ||
    (scenarioMode.value && !selectedScenario.value) ||
    fileLoading.value ||
    projectLoading.value
  ) {
    return;
  }
  fileLoading.value = true;
  setStatus('Creating entry…');
  requestEditor('create-file', {
    name,
    bundle: duplicate && selectedPath.value ? bundleFromPath(selectedPath.value) : selectedBundle.value,
    registry,
    namespace: (duplicate && selectedPath.value
      ? selectedPath.value
      : scenarioMode.value
        ? scenarioProjects.value.find((file) => file.registry === registry)?.path
        : projectFiles.value[0]?.path
    )?.match(/\/(?:common|server)\/data\/([^/]+)\//)?.[1],
    ...(duplicate
      ? { sourcePath: selectedPath.value, contents: contents.value }
      : scenarioMode.value
        ? { contents: newScenarioEntryContents(registry) }
        : {}),
  });
}

async function moveToScenario(path: string, scenario: string): Promise<void> {
  if (scenarioBusy.value || fileLoading.value || projectLoading.value) {
    return;
  }
  if (!scenarioDefinitions.value.some((definition) => definition.identifier === scenario)) {
    setStatus('Choose an existing scenario.', true);
    return;
  }
  const bundle = selectedBundle.value;
  scenarioBusy.value = true;
  try {
    const local = entries.value[path];
    const resource = local?.draft
      ? local
      : ((await requestEditorOperation(selene, 'open-file', { path })) as { contents: string });
    const updated = withScenario(resource.contents, scenario);
    const localUpdated =
      local && local.contents !== local.appliedContents ? withScenario(local.contents, scenario) : updated;
    const permissions = await selene.http.request(
      '/resources/permissions',
      {
        checks: [{ operation: 'save-file', request: { path, contents: updated } }],
      },
      'POST',
    );
    if (!Array.isArray(permissions) || permissions[0] !== true) {
      throw new Error('You cannot edit this entry.');
    }
    if (local?.draft) {
      local.contents = updated;
    } else {
      await requestEditorOperation(selene, 'save-file', { path, contents: updated });
      if (local) {
        local.contents = localUpdated!;
        local.appliedContents = updated;
      }
    }
    if (bundle === selectedBundle.value && scenarioMode.value) {
      await loadScenarioProjects();
    }
    setStatus(
      local?.draft
        ? 'Draft moved to scenario. Apply and persist to save it.'
        : 'Entry moved to scenario. Persist changes to save it.',
    );
  } catch (error) {
    setStatus(String(error), true);
  } finally {
    scenarioBusy.value = false;
    requestEditor('pending-changes');
  }
}
function renameFile(path: string, name: string): void {
  if (fileLoading.value || projectLoading.value) {
    return;
  }
  const newPath = `${path.slice(0, path.lastIndexOf('/') + 1)}${name}.json`;
  if (entries.value[newPath]) {
    setStatus('An entry with this name already exists.', true);
    return;
  }
  if (entries.value[path]?.draft) {
    entries.value[newPath] = entries.value[path]!;
    delete entries.value[path];
    receiveFile({
      path: newPath,
      contents: entries.value[newPath]!.contents,
      draft: true,
      registry: entries.value[newPath]!.registry,
    });
    return;
  }
  fileLoading.value = true;
  setStatus('Renaming entry…');
  requestEditor('rename-file', { path, name });
}

function save(): void {
  if (!selectedPath.value || !isDirty.value || !resourcePermissions.value.apply) {
    return;
  }
  if (scenarioMode.value && selectedRegistry.value === SCENARIO_REGISTRY) {
    try {
      const enabled = JSON.parse(contents.value).enabled === true;
      if (enabled !== (JSON.parse(savedContents.value).enabled === true)) {
        void setScenarioEnabled(enabled, contents.value);
        return;
      }
    } catch {
      setStatus('Fix the JSON before applying the scenario.', true);
      return;
    }
  }
  if (applying.has(selectedPath.value)) {
    return;
  }
  applying.set(selectedPath.value, contents.value);
  requestEditor('save-file', {
    path: selectedPath.value,
    contents: contents.value,
  });
  setStatus('Saving…');
}

function discardLocalChanges(): void {
  if (selectedPath.value && entries.value[selectedPath.value]?.draft) {
    delete entries.value[selectedPath.value];
    selectedPath.value = null;
    setStatus('Local draft discarded');
    return;
  }
  contents.value = savedContents.value;
  setStatus('Local changes discarded');
}

function persistChanges(path?: string): void {
  if (
    pendingChanges.value === 0 ||
    !(path ? resourcePermissions.value.persist : resourcePermissions.value.persistAll)
  ) {
    return;
  }
  requestEditor('persist-changes', path ? { path } : {});
  setStatus('Persisting changes…');
}

function discardChanges(path?: string): void {
  if (
    pendingChanges.value === 0 ||
    !(path ? resourcePermissions.value.discard : resourcePermissions.value.discardAll)
  ) {
    return;
  }
  requestEditor('discard-changes', path ? { path } : {});
  setStatus('Discarding changes…');
}

function finishCoordinatePicker(coordinate?: Coordinate): void {
  const field = pickingCoordinateField;
  const scope = pickingRegistry;
  const distance = pickingDistance.value;
  if (!field && !scope && !distance) {
    return;
  }
  if (coordinate && scope) {
    selene.network.sendToServer('moonlight-editor:lookup-coordinate', { ...coordinate, scope });
    return;
  }
  const targetField = distance?.field ?? field;
  if (coordinate && targetField && (!distance || coordinate.z === distance.coordinate.z)) {
    try {
      const value: unknown = JSON.parse(
        inlinePicking.value && inlineForm.value ? inlineForm.value.contents : contents.value,
      );
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        let object = value as Record<string, unknown>;
        const path = targetField.split('.');
        for (const key of path.slice(0, -1)) {
          const child = object[key];
          const nested = child !== null && typeof child === 'object' ? child : {};
          object[key] = nested;
          object = nested as Record<string, unknown>;
        }
        object[path[path.length - 1]!] = distance ? pickedDistance(distance, coordinate) : { ...coordinate };
        const updated = `${JSON.stringify(value, null, 2)}\n`;
        if (inlinePicking.value && inlineForm.value) {
          inlineForm.value.contents = updated;
        } else {
          contents.value = updated;
        }
      }
    } catch {
      setStatus('Fix the JSON before picking a coordinate', true);
    }
  }
  releasePickerKeys?.();
  releasePickerKeys = undefined;
  pickingCoordinateField = null;
  pickingRegistry = null;
  pickingDistance.value = null;
  pickerActive.value = false;
  if (pickerCameraZ !== null) {
    const coordinate = selene.world.getCameraCoordinate();
    if (coordinate.z !== pickerCameraZ) {
      selene.network.sendToServer('moonlight-editor:move-camera', { ...coordinate, z: pickerCameraZ });
    }
    pickerCameraZ = null;
  }
  suppressWorldPointer = true;
  window.setTimeout(() => {
    suppressWorldPointer = false;
  });
  if (inlinePicking.value) {
    inlinePicking.value = false;
    releaseTextCapture ??= selene.input.captureText();
    releasePanelKeys ??= selene.input.captureKeys('Escape');
  } else {
    // The current form is still mounted; refreshing its schema would recreate it.
    setProjectVisible(true, false);
  }
}

function startCoordinatePicker(field: string): void {
  pickingCoordinateField = field;
  startPicker('Click a tile to pick its coordinate; Escape cancels');
}

function startDistancePicker(pick: DistancePick): void {
  pickingDistance.value = { ...pick, coordinate: { ...pick.coordinate } };
  startPicker('Move to preview the radius; click to set distance; Escape cancels');
  selene.network.sendToServer('moonlight-editor:move-camera', { ...pick.coordinate });
}

function startRegistryPicker(): void {
  if (!selectedRegistry.value) {
    return;
  }
  pickingRegistry = selectedRegistry.value;
  startPicker(`Click a tile to pick a ${pickingRegistry} resource; Escape cancels`);
}

function startPicker(message: string): void {
  pickerCameraZ = selene.world.getCameraCoordinate().z;
  pickerActive.value = true;
  inlinePicking.value = inlineForm.value !== null;
  setProjectVisible(false);
  releasePickerKeys = selene.input.captureKeys('Escape');
  setStatus(message);
}

function handleSaveShortcut(event: KeyboardEvent): void {
  if (
    !(event.ctrlKey || event.metaKey) ||
    event.altKey ||
    event.shiftKey ||
    event.key.toLowerCase() !== 's' ||
    event.repeat ||
    (!inlineForm.value && !visible.value)
  ) {
    return;
  }
  event.preventDefault();
  event.stopImmediatePropagation();
  if (inlineForm.value) {
    saveInlineForm();
  } else if (!confirmation.value) {
    save();
  }
}

function handleKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && ownsEscape(event)) {
    return;
  }
  if ((pickingCoordinateField || pickingRegistry || pickingDistance.value) && event.key === 'Escape' && !event.repeat) {
    event.preventDefault();
    finishCoordinatePicker();
  } else if (inlineForm.value && event.key === 'Escape' && !event.repeat) {
    event.preventDefault();
    closeInlineForm();
  } else if (confirmation.value && event.key === 'Escape' && !event.repeat) {
    event.preventDefault();
    confirmation.value = null;
  } else if (visible.value && event.key === 'Escape' && !event.repeat) {
    event.preventDefault();
    setProjectVisible(false);
  }
}

function receiveProjectFiles(payload: ClientNetworkPayload): void {
  if (!scenarioMode.value && isCurrentSelection(payload) && Array.isArray(payload.files)) {
    projectFiles.value.push(
      ...payload.files.filter(
        (file): file is ProjectFile =>
          typeof file === 'object' &&
          file !== null &&
          typeof (file as Record<string, unknown>).path === 'string' &&
          (typeof (file as Record<string, unknown>).name === 'string' ||
            (file as Record<string, unknown>).name === undefined),
      ),
    );
  }
}

function receiveBundleOptions(payload: ClientNetworkPayload): void {
  if (!Array.isArray(payload.bundles)) {
    return;
  }
  bundleOptions.value = payload.bundles.filter((bundle): bundle is string => typeof bundle === 'string');
  if (!bundles.value.includes(selectedBundle.value)) {
    selectedBundle.value = bundles.value[0] ?? '';
    selectedRegistry.value = '';
  }
  requestBundleRegistries();
}

function receiveBundleRegistries(payload: ClientNetworkPayload): void {
  if (typeof payload.bundle !== 'string' || !Array.isArray(payload.registries)) {
    return;
  }
  bundleRegistries.value[payload.bundle] = payload.registries
    .filter((registry): registry is string => typeof registry === 'string')
    .sort();
  if (payload.bundle !== selectedBundle.value) {
    return;
  }
  if (!registries.value.includes(selectedRegistry.value)) {
    selectFirstRegistry();
  }
  requestProject();
}

function receiveGizmos(payload: ClientNetworkPayload): void {
  if (!Array.isArray(payload.gizmos)) {
    return;
  }
  for (const value of payload.gizmos) {
    if (typeof value !== 'object' || value === null) {
      continue;
    }
    const gizmo = value as Record<string, unknown>;
    const coordinate = gizmo.coordinate as Record<string, unknown> | null;
    if (
      typeof gizmo.id === 'string' &&
      typeof gizmo.label === 'string' &&
      typeof coordinate === 'object' &&
      coordinate !== null &&
      typeof coordinate.x === 'number' &&
      typeof coordinate.y === 'number' &&
      typeof coordinate.z === 'number'
    ) {
      gizmos.value.push({
        id: gizmo.id,
        label: gizmo.label,
        coordinate: { x: coordinate.x, y: coordinate.y, z: coordinate.z },
        lookup: gizmo.lookup === true,
        path: typeof gizmo.path === 'string' ? gizmo.path : undefined,
        color: typeof gizmo.color === 'string' ? gizmo.color : undefined,
        visual: typeof gizmo.visual === 'string' ? gizmo.visual : undefined,
        range:
          typeof gizmo.range === 'number' && Number.isFinite(gizmo.range) && gizmo.range >= 0 ? gizmo.range : undefined,
      });
    }
  }
}

function receiveFile(payload: ClientNetworkPayload): void {
  if (typeof payload.path !== 'string' || typeof payload.contents !== 'string') {
    return;
  }
  if (pickingRegistry || pickingDistance.value) {
    finishCoordinatePicker();
  }
  const previousBundle = selectedBundle.value;
  const previousRegistry = selectedRegistry.value;
  const wasVisible = visible.value;
  fileLoading.value = false;
  selectedPath.value = payload.path;
  selectedBundle.value = bundleFromPath(payload.path);
  selectedRegistry.value = typeof payload.registry === 'string' ? payload.registry : selectedRegistry.value;
  const entry = entries.value[payload.path];
  const localContents = entry && entry.contents !== entry.appliedContents ? entry.contents : payload.contents;
  entries.value[payload.path] = {
    contents: localContents,
    appliedContents: payload.draft === true ? '' : payload.contents,
    draft: payload.draft === true,
    registry: selectedRegistry.value,
  };
  if (scenarioMode.value) {
    registrySchema.value = scenarioSchemas.value[selectedRegistry.value] ?? null;
  }
  if (!wasVisible) {
    setProjectVisible(true);
  } else if (selectedBundle.value !== previousBundle) {
    requestBundleRegistries();
  } else if (!scenarioMode.value && selectedRegistry.value !== previousRegistry) {
    requestProject();
  }
  setStatus('File loaded');
}

onMounted(() => {
  window.addEventListener('keydown', handleSaveShortcut, true);
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('resize', refreshWorldProjection);
  releases.push(
    selene.input.registerBinding(
      { id: 'editor.toggle', label: 'Toggle Editor', category: 'General', defaultBinding: 'F1', allowInText: true },
      () => {
        selene.network.sendToServer('moonlight-editor:toggle');
      },
    ),
    onEditorResponse('moonlight-editor:resource-path', (payload) => {
      if (typeof payload.path === 'string') {
        openFile(payload.path);
      }
    }),
    onEditorResponse('moonlight-editor:editor-state', (payload) => {
      customVisualRegistries = new Set(
        Array.isArray(payload.visualRegistries)
          ? payload.visualRegistries.filter((registry): registry is string => typeof registry === 'string')
          : [],
      );
      if (payload.enabled === true) {
        requestEditor('pending-changes');
      }
      tileGridCheckRevision += 1;
      enabled.value = payload.enabled === true;
      selene.world.setTileOcclusionEnabled?.(!enabled.value);
      void syncEditorLighting();
      if (enabled.value) {
        selene.network.sendToServer('moonlight-editor:zoom-camera', { zoom: cameraZoom });
        requestGizmos();
      } else {
        gizmos.value = [];
        hoveredGizmoId.value = null;
        focusedGizmoId.value = null;
      }
      if (!enabled.value) {
        cameraRequests.cancel();
        zoomRequests.cancel();
        zoomRequestRevision += 1;
        if (cameraZoom !== 1) {
          cameraZoom = 1;
          void selene.world.setCameraZoom(1);
        }
        releasePickerKeys?.();
        releasePickerKeys = undefined;
        pickingCoordinateField = null;
        pickingRegistry = null;
        pickingDistance.value = null;
        pickerActive.value = false;
        pickerCameraZ = null;
        closeInlineForm();
        setProjectVisible(false);
        dragging.value = false;
        lastRequested = null;
        dragCameraPosition = null;
        dragSequence += 1;
      }
    }),
    onEditorResponse('moonlight-editor:project-start', (payload) => {
      if (!scenarioMode.value && isCurrentSelection(payload)) {
        projectFiles.value = [];
        registrySchema.value =
          typeof payload.schema === 'object' && payload.schema !== null && !Array.isArray(payload.schema)
            ? (payload.schema as Record<string, SchemaDefinition>)
            : null;
        schemaLoading.value = false;
      }
    }),
    onEditorResponse('moonlight-editor:bundle-options', receiveBundleOptions),
    onEditorResponse('moonlight-editor:bundle-registry-options', receiveBundleRegistries),
    onEditorResponse('moonlight-editor:project-files', receiveProjectFiles),
    onEditorResponse('moonlight-editor:project-end', (payload) => {
      if (!scenarioMode.value && isCurrentSelection(payload)) {
        projectLoading.value = false;
        setStatus(`${projectFiles.value.length} data files`);
      }
    }),
    onEditorResponse('moonlight-editor:inline-form', (payload) => {
      if (
        !enabled.value ||
        typeof payload.id !== 'number' ||
        typeof payload.contents !== 'string' ||
        typeof payload.schema !== 'object' ||
        payload.schema === null ||
        Array.isArray(payload.schema)
      ) {
        return;
      }
      const coordinate = payload.coordinate as Coordinate | undefined;
      if (!coordinate || !['x', 'y', 'z'].every((axis) => typeof coordinate[axis as keyof Coordinate] === 'number')) {
        return;
      }
      closeInlineForm();
      setProjectVisible(false);
      inlineForm.value = {
        id: payload.id,
        title: typeof payload.title === 'string' ? payload.title : 'Edit coordinate',
        coordinate,
        schema: payload.schema as Record<string, SchemaDefinition>,
        fieldLabels:
          typeof payload.fieldLabels === 'object' && payload.fieldLabels !== null
            ? (payload.fieldLabels as Record<string, string>)
            : undefined,
        contents: payload.contents,
      };
      inlineSaving.value = false;
      inlineMessage.value = '';
      releaseTextCapture ??= selene.input.captureText();
      releasePanelKeys ??= selene.input.captureKeys('Escape');
    }),
    onEditorResponse('moonlight-editor:inline-form-saved', (payload) => {
      if (payload.id !== inlineForm.value?.id) {
        return;
      }
      inlineSaving.value = false;
      inlineMessage.value = typeof payload.message === 'string' ? payload.message : '';
      if (payload.success === true) {
        closeInlineForm();
        requestGizmos();
      }
    }),
    onEditorResponse('moonlight-editor:file', receiveFile),
    onEditorResponse('moonlight-editor:file-created', (payload) => {
      if (!scenarioMode.value && isCurrentSelection(payload)) {
        requestProject();
      }
    }),
    onEditorResponse('moonlight-editor:registry-visuals', (payload) => {
      if (typeof payload.registry !== 'string' || !payload.visuals || typeof payload.visuals !== 'object') {
        return;
      }
      const visuals = payload.visuals as Record<string, string>;
      registryOptions.value[payload.registry] = (registryOptions.value[payload.registry] ?? []).map((option) => ({
        ...option,
        visual: visuals[option.value] ?? option.visual,
      }));
    }),
    onEditorResponse('moonlight-editor:registry-options', (payload) => {
      if (
        typeof payload.registry !== 'string' ||
        typeof payload.query !== 'string' ||
        !Array.isArray(payload.options)
      ) {
        return;
      }
      if (payload.lookup !== true && registryQueries.get(payload.registry) !== payload.query) {
        return;
      }
      registryOptions.value = {
        ...registryOptions.value,
        [payload.registry]: [
          ...(payload.lookup === true ? (registryOptions.value[payload.registry] ?? []) : []),
          ...parseRegistryOptions(payload.registry, payload.options),
        ].filter(
          (option, index, options) => options.findIndex((candidate) => candidate.value === option.value) === index,
        ),
      };
    }),
    onEditorResponse('moonlight-editor:file-saved', (payload) => {
      if (typeof payload.path !== 'string') {
        return;
      }
      const appliedContents = applying.get(payload.path);
      applying.delete(payload.path);
      const entry = entries.value[payload.path];
      if (entry && appliedContents !== undefined) {
        const wasDraft = entry.draft;
        entry.appliedContents = appliedContents;
        entry.draft = false;
        if (wasDraft || scenarioMode.value) {
          requestProject();
        }
      }
      if (scenarioMode.value && entry && appliedContents !== undefined) {
        const file = scenarioProjects.value.find((file) => file.path === payload.path);
        if (file) {
          file.scenario = scenarioFromContents(appliedContents);
        }
      }
      if (payload.path === selectedPath.value) {
        setStatus('Applied');
      }
    }),
    onEditorResponse('moonlight-editor:pending-changes', (payload) => {
      if (typeof payload.count === 'number' && Number.isInteger(payload.count) && payload.count >= 0) {
        pendingChanges.value = payload.count;
        pendingPaths.value = Array.isArray(payload.paths)
          ? payload.paths.filter((path): path is string => typeof path === 'string').sort()
          : [];
        if (payload.count === 0) {
          confirmation.value = null;
        }
      }
    }),
    onEditorResponse('moonlight-editor:changes-persisted', (payload) => {
      const removedPaths = Array.isArray(payload.removedPaths) ? payload.removedPaths : [];
      for (const path of removedPaths) {
        if (typeof path === 'string') {
          delete entries.value[path];
          applying.delete(path);
        }
      }
      if (selectedPath.value && removedPaths.includes(selectedPath.value)) {
        selectedPath.value = null;
      }
      if (removedPaths.length > 0 || scenarioMode.value) {
        requestProject();
      }
      setStatus('Changes persisted');
    }),
    onEditorResponse('moonlight-editor:changes-discarded', (payload) => {
      setStatus('Changes discarded');
      const removedPaths = Array.isArray(payload.removedPaths) ? payload.removedPaths : [];
      for (const path of removedPaths) {
        if (typeof path === 'string') {
          delete entries.value[path];
          applying.delete(path);
        }
      }
      if (selectedPath.value && removedPaths.includes(selectedPath.value)) {
        selectedPath.value = null;
      }
      if (removedPaths.length > 0 || scenarioMode.value) {
        requestProject();
      }
      if (selectedPath.value && (payload.path === undefined || payload.path === selectedPath.value)) {
        openFile(selectedPath.value);
      }
    }),
    onEditorResponse('moonlight-editor:error', (payload) => {
      if (inlineSaving.value) {
        inlineSaving.value = false;
        inlineMessage.value = String(payload.message ?? 'Editor error');
      }
      projectLoading.value = false;
      schemaLoading.value = false;
      fileLoading.value = false;
      applying.clear();
      setStatus(String(payload.message ?? 'Editor error'), true);
    }),
    onEditorResponse('moonlight-editor:gizmos-start', () => {
      gizmos.value = [];
      hoveredGizmoId.value = null;
      focusedGizmoId.value = null;
    }),
    onEditorResponse('moonlight-editor:gizmos', receiveGizmos),
    onEditorResponse('moonlight-editor:gizmos-end', () => {
      projectionRevision.value += 1;
    }),
    selene.network.onConnected(() => {
      connected.value = true;
      selene.network.sendToServer('moonlight-editor:request-state');
      if (visible.value) {
        requestBundles();
      }
    }),
    selene.input.onScroll(({ amountY }) => {
      if (!enabled.value || dragging.value || !Number.isFinite(amountY) || amountY === 0) {
        return;
      }
      cameraZoom = Math.min(1, Math.max(MIN_CAMERA_ZOOM, cameraZoom * Math.pow(1.1, -amountY)));
      const zoom = cameraZoom;
      const revision = ++zoomRequestRevision;
      void selene.world.setCameraZoom(zoom).then((appliedZoom) => {
        if (!enabled.value || revision !== zoomRequestRevision) {
          return;
        }
        cameraZoom = appliedZoom;
        void syncEditorLighting();
        zoomRequests.push(appliedZoom);
        projectionRevision.value += 1;
      });
    }),
    selene.input.onPointerDown((event) => {
      if (!enabled.value || event.button !== 0 || suppressWorldPointer) {
        return;
      }
      cameraRequests.cancel();
      dragging.value = true;
      moved = false;
      lastRequested = selene.world.getCameraCoordinate();
      dragClientX = event.clientX;
      dragClientY = event.clientY;
      dragCameraPosition = null;
      const sequence = ++dragSequence;
      void selene.world.getCameraPosition().then((position) => {
        if (dragging.value && dragSequence === sequence) {
          dragCameraPosition = position;
        }
      });
    }),
    selene.input.onPointerMove((event) => {
      hoveredCoordinate.value = enabled.value ? { ...event.coordinate } : null;
      const pick = pickingDistance.value;
      if (enabled.value && pick && event.coordinate.z === pick.coordinate.z) {
        pick.distance = pickedDistance(pick, event.coordinate);
      }
      if (!enabled.value || !dragging.value) {
        return;
      }
      moved ||= Math.hypot(event.clientX - dragClientX, event.clientY - dragClientY) > 4;
      if (dragCameraPosition && moved) {
        const sequence = dragSequence;
        const revision = ++dragRequestRevision;
        void selene.world
          .setCameraPosition({
            x: dragCameraPosition.x - (event.clientX - dragClientX) / cameraZoom,
            y: dragCameraPosition.y - (event.clientY - dragClientY) / cameraZoom,
          })
          .then((coordinate) => {
            projectionRevision.value += 1;
            if (
              !dragging.value ||
              sequence !== dragSequence ||
              revision !== dragRequestRevision ||
              (lastRequested &&
                coordinate.x === lastRequested.x &&
                coordinate.y === lastRequested.y &&
                coordinate.z === lastRequested.z)
            ) {
              return;
            }
            lastRequested = coordinate;
            cameraRequests.push({ ...coordinate });
          });
      }
    }),
    selene.input.onPointerUp((event) => {
      if (event.button !== 0 || !dragging.value) {
        return;
      }
      moved ||= Math.hypot(event.clientX - dragClientX, event.clientY - dragClientY) > 4;
      if (!moved && enabled.value && !suppressWorldPointer) {
        if (pickingCoordinateField || pickingRegistry || pickingDistance.value) {
          if (!pickingDistance.value || event.coordinate.z === pickingDistance.value.coordinate.z) {
            finishCoordinatePicker(event.coordinate);
          }
        } else {
          selene.network.sendToServer('moonlight-editor:lookup-coordinate', { ...event.coordinate });
        }
      }
      // Apply the release position even if the last pointer-move promise is still pending.
      const origin = dragCameraPosition;
      const sequence = ++dragSequence;
      cameraRequests.cancel();
      if (origin && moved && enabled.value) {
        void selene.world
          .setCameraPosition({
            x: origin.x - (event.clientX - dragClientX) / cameraZoom,
            y: origin.y - (event.clientY - dragClientY) / cameraZoom,
          })
          .then((coordinate) => {
            if (!enabled.value || sequence !== dragSequence) {
              return;
            }
            cameraRequests.push({ ...coordinate });
            cameraRequests.flush();
          });
      }
      dragging.value = false;
      lastRequested = null;
      dragCameraPosition = null;
    }),
    selene.world.onCameraCoordinateChanged((coordinate) => {
      const changedLayer = coordinate.z !== cameraCoordinate.value.z;
      tileGridCheckRevision += 1;
      cameraCoordinate.value = coordinate;
      if (enabled.value && changedLayer) {
        void enableGridForEmptyLayer(coordinate);
      }
      if (
        enabled.value &&
        (!lastGizmoCoordinate ||
          coordinate.z !== lastGizmoCoordinate.z ||
          Math.abs(coordinate.x - lastGizmoCoordinate.x) >= 16 ||
          Math.abs(coordinate.y - lastGizmoCoordinate.y) >= 16)
      ) {
        requestGizmos();
      }
      projectionRevision.value += 1;
    }),
    selene.world.onMapChanged(() => {
      projectionRevision.value += 1;
    }),
  );
});

onBeforeUnmount(() => {
  selene.world.setTileOcclusionEnabled?.(true);
  if (!selene.world.isLightingEnabled()) {
    void selene.world.setLightingEnabled(true);
  }
  cameraRequests.cancel();
  zoomRequests.cancel();
  dragSequence += 1;
  zoomRequestRevision += 1;
  tileGridCheckRevision += 1;
  void selene.world.setTileGridVisible(false);
  if (cameraZoom !== 1) {
    void selene.world.setCameraZoom(1);
    selene.network.sendToServer('moonlight-editor:zoom-camera', { zoom: 1 });
  }
  closeInlineForm();
  window.removeEventListener('keydown', handleSaveShortcut, true);
  window.removeEventListener('keydown', handleKeyDown);
  window.removeEventListener('resize', refreshWorldProjection);
  releaseTextCapture?.();
  releasePanelKeys?.();
  releasePickerKeys?.();
  releases.reverse().forEach((release) => release());
});
</script>

<template>
  <MoonlightSurface
    as="div"
    variant="status"
    v-if="enabled && !visible && hoveredCoordinate"
    class="hovered-coordinate ml-status-start"
    aria-label="Hovered coordinates"
  >
    X: {{ hoveredCoordinate.x }} · Y: {{ hoveredCoordinate.y }} · Z: {{ hoveredCoordinate.z }}
  </MoonlightSurface>
  <ContextMenu
    v-if="enabled && !visible && !inlineForm && !pickingDistance && !pickingCoordinateField && !pickingRegistry"
  />
  <MoonlightSurface
    as="nav"
    variant="status"
    v-if="enabled && !visible && !pickingDistance"
    class="actions ml-toolbar-end ml-row"
    aria-label="Editor actions"
  >
    <MoonlightButton
      type="button"
      title="Camera up 1 level (Shift: 3 levels)"
      aria-label="Camera up"
      @click="moveCameraLevel(1, $event)"
    >
      <ArrowUp :size="16" aria-hidden="true" />
    </MoonlightButton>
    <MoonlightButton
      type="button"
      title="Camera down 1 level (Shift: 3 levels)"
      aria-label="Camera down"
      @click="moveCameraLevel(-1, $event)"
    >
      <ArrowDown :size="16" aria-hidden="true" />
    </MoonlightButton>
    <MoonlightButton
      type="button"
      title="Focus Character"
      @click="selene.network.sendToServer('moonlight-editor:focus-character')"
    >
      <Focus :size="16" aria-hidden="true" />
      Focus Character
    </MoonlightButton>
    <GoToMenu />
    <MoonlightButton
      type="button"
      title="Show tile grid on the current z layer"
      :aria-pressed="showTileGrid"
      @click="toggleTileGrid"
    >
      <Grid2X2 :size="16" aria-hidden="true" />
    </MoonlightButton>
    <MoonlightButton
      type="button"
      title="Enable or disable scene lighting"
      :aria-pressed="showLights"
      @click="toggleLights"
    >
      <Lightbulb :size="16" aria-hidden="true" />
    </MoonlightButton>
    <MoonlightButton
      type="button"
      title="Show editor gizmos on the current z layer"
      :aria-pressed="showGizmos"
      @click="showGizmos = !showGizmos"
    >
      <Eye :size="16" aria-hidden="true" />
      Toggle Gizmos
    </MoonlightButton>
    <MoonlightButton type="button" @click="setProjectVisible(true)">
      <Database :size="16" aria-hidden="true" />
      Registry Editor
    </MoonlightButton>
  </MoonlightSurface>
  <div v-if="enabled && showGizmos && !pickerActive" class="gizmos ml-world-layer">
    <MoonlightWorldMarker
      v-for="gizmo in projectedGizmos"
      :key="gizmo.id"
      class="gizmo"
      :interactive="
        !!(gizmo.label || gizmo.path || gizmo.lookup || gizmo.range !== undefined) && !pickingDistance && !dragging
      "
      :style="{ left: `${gizmo.screen.x}px`, top: `${gizmo.screen.y}px`, '--gizmo-color': gizmo.color ?? '#f29d49' }"
      :label="gizmo.label"
      :visual="gizmo.visual"
      :disabled="(!gizmo.path && !gizmo.lookup && gizmo.range === undefined) || !!pickingDistance"
      @pointerenter="hoveredGizmoId = gizmo.id"
      @pointerleave="hoveredGizmoId = null"
      @focus="focusedGizmoId = gizmo.id"
      @blur="focusedGizmoId = null"
      @click.stop="clickGizmo(gizmo)"
    />
  </div>
  <MoonlightWorldPreview
    v-if="gizmoRangeCircle"
    :points="gizmoRangeCircle.points"
    :center="gizmoRangeCircle.center"
    layer="world"
  />
  <MoonlightWorldPreview
    v-if="enabled && distanceCircle"
    :points="distanceCircle.points"
    :center="distanceCircle.center"
  />
  <MoonlightSurface
    as="div"
    variant="status"
    v-if="enabled && pickingDistance"
    class="distance-status ml-status-top ml-row"
    role="status"
  >
    <strong>{{ pickingDistance.field }}: {{ pickingDistance.distance }} tiles</strong>
    <MoonlightButton type="button" @click="finishCoordinatePicker()">Cancel</MoonlightButton>
  </MoonlightSurface>
  <MoonlightModal
    v-if="inlineForm"
    :key="inlineForm.id"
    ref="inlineDialog"
    :title="inlineForm.title"
    @cancel.prevent="closeInlineForm"
    @submit="saveInlineForm"
    @pointerdown.stop
    @pointerup.stop
    @click.stop
  >
    <template #headerActions>
      <MoonlightButton variant="ghost" size="icon" type="button" aria-label="Close" @click="closeInlineForm">
        <X :size="18" aria-hidden="true" />
      </MoonlightButton>
    </template>
    <SchemaForm
      class="moonlight-form-scroll"
      :schema="inlineForm.schema"
      :allow-references="false"
      :field-labels="inlineForm.fieldLabels"
      :contents="inlineForm.contents"
      :registry-options="registryOptions"
      @update-contents="inlineForm.contents = $event"
      @search-registry="searchRegistry"
      @pick-coordinate="startCoordinatePicker"
      @pick-distance="startDistancePicker"
    />
    <template #actions>
      <span role="status">{{ inlineMessage }}</span>
      <MoonlightButton type="submit" :disabled="inlineSaving">
        {{ inlineSaving ? 'Applying…' : 'Apply' }}
      </MoonlightButton>
    </template>
  </MoonlightModal>
  <FileModal
    v-if="enabled"
    v-show="visible"
    v-model:selected-bundle="selectedBundle"
    v-model:selected-registry="selectedRegistry"
    v-model:contents="contents"
    :scenario-mode="scenarioMode"
    v-model:selected-scenario="selectedScenario"
    :scenarios="scenarios"
    :scenario-labels="scenarioLabels"
    :scenario-busy="scenarioBusy"
    :scenario-catalog-loading="scenarioCatalogLoading"
    @load-scenarios="loadScenarios"
    @move-to-scenario="moveToScenario"
    @toggle-scenario-mode="toggleScenarioMode"
    @select-scenario="selectScenario"
    @create-scenario="createScenario"
    @manage-scenario="manageScenario"
    :bundles="bundles"
    :registries="scenarioMode ? registries.filter((registry) => registry !== SCENARIO_REGISTRY) : registries"
    :project-files="listedFiles"
    :project-loading="projectLoading"
    :editor-loading="fileLoading || schemaLoading || scenarioBusy"
    :selected-path="selectedPath"
    :selected-file-name="scenarioDefinitions.find((scenario) => scenario.path === selectedPath)?.name"
    :is-dirty="isDirty"
    :permissions="resourcePermissions"
    :pending-changes="pendingChanges"
    :pending-paths="pendingPaths"
    :local-paths="localPaths"
    v-model:confirmation="confirmation"
    :status="status"
    :status-is-error="statusIsError"
    :schema="registrySchema"
    :registry-options="registryOptions"
    @select-bundle="selectBundle"
    @request-project="selectRegistry"
    @open-file="openFile"
    @search-registry="searchRegistry"
    @pick-coordinate="startCoordinatePicker"
    @pick-distance="startDistancePicker"
    @pick-resource="startRegistryPicker"
    @create-file="(name, registry) => createFile(name, false, registry)"
    @duplicate-file="createFile($event, true)"
    @rename-file="renameFile"
    @save="save"
    @discard-local="discardLocalChanges"
    @persist="persistChanges"
    @discard="discardChanges"
    @close="setProjectVisible(false)"
  />
</template>
