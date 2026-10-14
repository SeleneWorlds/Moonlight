<script setup lang="ts">
import MoonlightSwitch from 'moonlight-ui/MoonlightSwitch.vue';
import MoonlightSurface from 'moonlight-ui/MoonlightSurface.vue';
import MoonlightButton from 'moonlight-ui/MoonlightButton.vue';
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue';
import { Copy, FilePlus, Pipette, X, ArrowLeftRight, Plus } from '@lucide/vue';
import type { DistancePick, SchemaDefinition } from 'moonlight-ui/schema';
import SchemaForm from 'moonlight-ui/SchemaForm.vue';
import SelectInput from 'moonlight-ui/SelectInput.vue';
import RegistryIcon from './RegistryIcon.vue';

const searchInputId = useId();

interface ProjectFile {
  path: string;
  name?: string;
  registry?: string;
  icon?: string;
}

const props = defineProps<{
  scenarioMode: boolean;
  scenarios: string[];
  scenarioLabels: Record<string, string>;
  scenarioBusy: boolean;
  scenarioCatalogLoading: boolean;
  bundles: string[];
  registries: string[];
  projectFiles: ProjectFile[];
  projectLoading: boolean;
  editorLoading: boolean;
  selectedPath: string | null;
  selectedFileName?: string;
  isDirty: boolean;
  permissions: { apply: boolean; persist: boolean; discard: boolean; persistAll: boolean; discardAll: boolean };
  pendingChanges: number;
  pendingPaths: string[];
  localPaths: string[];
  status: string;
  statusIsError: boolean;
  schema: Record<string, SchemaDefinition> | null;
  registryOptions: Record<string, Array<{ value: string; label: string; visual?: string }>>;
}>();

const selectedBundle = defineModel<string>('selectedBundle', { required: true });
const selectedRegistry = defineModel<string>('selectedRegistry', { required: true });
const selectedScenario = defineModel<string>('selectedScenario', { required: true });
const contents = defineModel<string>('contents', { required: true });

const enabledField = computed(
  () =>
    Object.entries(props.schema ?? {}).find(
      ([, definition]) => (typeof definition === 'string' ? definition : definition.type) === 'enabled',
    )?.[0],
);
const parsedContents = computed<Record<string, unknown> | null>(() => {
  try {
    const value: unknown = JSON.parse(contents.value);
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
});
const formSchema = computed(() =>
  props.schema
    ? Object.fromEntries(Object.entries(props.schema).filter(([name]) => name !== enabledField.value))
    : null,
);

function toggleEnabled(): void {
  const field = enabledField.value;
  if (props.permissions.apply && field && parsedContents.value) {
    contents.value = `${JSON.stringify({ ...parsedContents.value, [field]: parsedContents.value[field] !== true }, null, 2)}\n`;
  }
}

const emit = defineEmits<{
  selectBundle: [];
  requestProject: [];
  openFile: [path: string];
  save: [];
  discardLocal: [];
  persist: [path?: string];
  discard: [path?: string];
  close: [];
  searchRegistry: [registry: string, query: string, lookup?: boolean];
  pickCoordinate: [field: string];
  pickDistance: [pick: DistancePick];
  pickResource: [];
  toggleScenarioMode: [];
  selectScenario: [];
  createScenario: [name: string];
  manageScenario: [];
  createFile: [name: string, registry: string];
  duplicateFile: [name: string];
  renameFile: [path: string, name: string];
  loadScenarios: [];
  moveToScenario: [path: string, scenario: string];
}>();

const createDialog = ref<HTMLDialogElement | null>(null);
const entryName = ref('');
const entryRegistry = ref('');
const scenarioDialog = ref<HTMLDialogElement | null>(null);
const scenarioName = ref('');
const scenarioSubmitted = ref(false);
function submitScenario(): void {
  const name = scenarioName.value.trim();
  if (!name || Object.values(props.scenarioLabels).includes(name)) {
    return;
  }
  scenarioSubmitted.value = true;
  emit('createScenario', name);
}
watch(
  () => [props.scenarioBusy, props.status] as const,
  ([busy]) => {
    if (scenarioSubmitted.value && !busy) {
      scenarioSubmitted.value = false;
      if (!props.statusIsError) {
        scenarioDialog.value?.close();
      }
    }
  },
);
const createSubmitted = ref(false);
const createAttempted = ref(false);
const duplicating = ref(false);
const renamingPath = ref<string | null>(null);
const contextPath = ref<string | null>(null);
const contextMenuElement = ref<InstanceType<typeof MoonlightSurface> | null>(null);
const contextPosition = ref({ x: 0, y: 0 });
async function openEntryContextMenu(event: MouseEvent, path: string): Promise<void> {
  contextPath.value = path;
  contextPosition.value = { x: 0, y: 0 };
  const position = contextPosition.value;
  await nextTick();
  const element = contextMenuElement.value?.element;
  if (contextPosition.value !== position || contextPath.value !== path || !element) {
    return;
  }
  // The bundle UI layer can translate and scale fixed elements.
  const bounds = element.getBoundingClientRect();
  const scaleX = bounds.width / element.offsetWidth;
  const scaleY = bounds.height / element.offsetHeight;
  const left = Math.max(0, Math.min(event.clientX, window.innerWidth - bounds.width));
  const top = Math.max(0, Math.min(event.clientY, window.innerHeight - bounds.height));
  contextPosition.value = { x: (left - bounds.left) / scaleX, y: (top - bounds.top) / scaleY };
}

const moveDialog = ref<HTMLDialogElement | null>(null);
const movePath = ref<string | null>(null);
const moveTarget = ref('');
const moveSubmitted = ref(false);
function openMoveDialog(path: string): void {
  movePath.value = path;
  moveTarget.value = '';
  moveSubmitted.value = false;
  contextPath.value = null;
  emit('loadScenarios');
  moveDialog.value?.showModal();
}
function submitMove(): void {
  if (
    !movePath.value ||
    !moveTarget.value ||
    props.scenarioCatalogLoading ||
    props.scenarioBusy ||
    moveSubmitted.value
  ) {
    return;
  }
  moveSubmitted.value = true;
  emit('moveToScenario', movePath.value, moveTarget.value);
}
watch(
  () => [props.scenarioBusy, props.status] as const,
  ([busy]) => {
    if (moveSubmitted.value && !busy) {
      moveSubmitted.value = false;
      if (!props.statusIsError) {
        moveDialog.value?.close();
      }
    }
  },
);
function openRenameDialog(path: string): void {
  openCreateDialog();
  renamingPath.value = path;
  entryName.value =
    path
      .split('/')
      .pop()
      ?.replace(/\.json$/, '') ?? '';
  contextPath.value = null;
}
const entryNameError = computed(() => {
  const name = entryName.value.trim();
  if (!name) {
    return 'Enter a name.';
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    return 'Use letters, numbers, underscores, or hyphens.';
  }
  const targetPath = renamingPath.value
    ? `${renamingPath.value.slice(0, renamingPath.value.lastIndexOf('/') + 1)}${name}.json`
    : null;
  if (
    props.projectFiles.some(({ path, registry }) =>
      targetPath
        ? path === targetPath
        : pathWithinRegistry(path) === `${name}.json` &&
          (!props.scenarioMode || registry === (duplicating.value ? selectedRegistry.value : entryRegistry.value)),
    )
  ) {
    return 'An entry with this name already exists.';
  }
  return '';
});

function openCreateDialog(duplicate = false): void {
  renamingPath.value = null;
  entryRegistry.value = props.registries.includes(selectedRegistry.value)
    ? selectedRegistry.value
    : props.registries[0] || '';
  duplicating.value = duplicate;
  entryName.value = duplicate
    ? `${
        props.selectedPath
          ?.split('/')
          .pop()
          ?.replace(/\.json$/, '') ?? 'entry'
      }_copy`
    : '';
  createAttempted.value = false;
  createSubmitted.value = false;
  createDialog.value?.showModal();
}

function closeCreateDialog(): void {
  createSubmitted.value = false;
  createDialog.value?.close();
}

function submitCreate(): void {
  if (entryNameError.value || createSubmitted.value) {
    return;
  }
  createSubmitted.value = true;
  createAttempted.value = true;
  contextPath.value = null;
  fileSearch.value = '';
  if (renamingPath.value) {
    emit('renameFile', renamingPath.value, entryName.value.trim());
  } else if (duplicating.value) {
    emit('duplicateFile', entryName.value.trim());
  } else {
    emit('createFile', entryName.value.trim(), entryRegistry.value);
  }
}

watch(
  () => [props.editorLoading, props.status, props.selectedPath] as const,
  ([loading]) => {
    if (createSubmitted.value && !loading) {
      createSubmitted.value = false;
      if (!props.statusIsError) {
        closeCreateDialog();
      }
    }
  },
);

const confirmation = defineModel<'persist' | 'discard' | null>('confirmation', { required: true });
const confirmationPath = ref<string | null>(null);
const confirmationPaths = computed(() =>
  confirmationPath.value === null
    ? props.pendingPaths
    : props.pendingPaths.filter((path) => path === confirmationPath.value),
);
const resourceHasChanges = computed(
  () => props.selectedPath !== null && props.pendingPaths.includes(props.selectedPath),
);

const confirmationAllowed = computed(() => {
  if (confirmation.value === 'persist') {
    return confirmationPath.value === null ? props.permissions.persistAll : props.permissions.persist;
  }
  return confirmationPath.value === null ? props.permissions.discardAll : props.permissions.discard;
});

function requestConfirmation(action: 'persist' | 'discard', path: string | null = null): void {
  confirmationPath.value = path;
  confirmation.value = action;
}

const confirmationDialog = ref<HTMLDialogElement | null>(null);
onBeforeUnmount(() => {
  createDialog.value?.close();
  scenarioDialog.value?.close();
  moveDialog.value?.close();
  confirmationDialog.value?.close();
});
watch(confirmation, (action) => {
  if (action) {
    confirmationDialog.value?.showModal();
  } else {
    confirmationDialog.value?.close();
  }
});

function confirmChanges(): void {
  if (!confirmationAllowed.value) {
    return;
  }
  const action = confirmation.value;
  const path = confirmationPath.value ?? undefined;
  const hasChanges = confirmationPaths.value.length > 0;
  confirmation.value = null;
  if (!hasChanges) {
    return;
  }
  if (action === 'persist') {
    emit('persist', path);
  } else if (action === 'discard') {
    emit('discard', path);
  }
}

const activeTab = ref<'form' | 'json'>('form');
watch(
  () => props.selectedPath,
  () => {
    activeTab.value = props.schema ? 'form' : 'json';
  },
);
watch(
  () => props.schema,
  (schema) => {
    activeTab.value = schema ? 'form' : 'json';
  },
);

const selectedFile = computed(() => props.projectFiles.find(({ path }) => path === props.selectedPath));
const fileSearch = ref('');
const filteredFiles = computed(() => {
  const query = fileSearch.value.trim().toLowerCase();
  const changedPaths = new Set([...props.localPaths, ...props.pendingPaths]);
  return props.projectFiles
    .filter(({ path, name }) => !query || path.toLowerCase().includes(query) || name?.toLowerCase().includes(query))
    .sort((a, b) => Number(changedPaths.has(b.path)) - Number(changedPaths.has(a.path)));
});
watch([selectedBundle, selectedRegistry, selectedScenario, () => props.scenarioMode], () => {
  contextPath.value = null;
  fileSearch.value = '';
  closeCreateDialog();
  scenarioDialog.value?.close();
  moveDialog.value?.close();
});

function pathWithinRegistry(path: string): string {
  const match = path.match(/\/(?:common|server)\/data\/[^/]+\/[^/]+\/(.+)$/);
  return match?.[1] ?? path;
}

function searchRegistry(registry: string, query: string, lookup?: boolean): void {
  emit('searchRegistry', registry, query, lookup);
}
</script>

<template>
  <div
    class="file-modal ml-contents"
    @pointerdown.capture="contextPath = ($event.target as Element).closest('.entry-context-menu') ? contextPath : null"
    @keydown.esc="contextPath = null"
  >
    <div class="peek-zone ml-peek" aria-hidden="true" />
    <MoonlightSurface as="section" variant="panel" class="project ml-window ml-split">
      <MoonlightSurface
        as="div"
        variant="popup"
        v-if="contextPath"
        ref="contextMenuElement"
        :style="{ left: `${contextPosition.x}px`, top: `${contextPosition.y}px` }"
        @contextmenu.prevent
        class="entry-context-menu moonlight-popup ml-context ml-column"
        role="menu"
        aria-label="Entry actions"
      >
        <MoonlightButton
          class="moonlight-item"
          variant="ghost"
          type="button"
          role="menuitem"
          :disabled="editorLoading || projectLoading"
          @pointerdown.prevent
          @click="openRenameDialog(contextPath)"
        >
          Rename
        </MoonlightButton>
        <MoonlightButton
          class="moonlight-item"
          variant="ghost"
          type="button"
          role="menuitem"
          :disabled="editorLoading || projectLoading || scenarioBusy"
          @pointerdown.prevent
          @click="openMoveDialog(contextPath)"
          >Move to Scenario</MoonlightButton
        >
      </MoonlightSurface>
      <aside class="browser ml-sidebar">
        <div class="browser-content ml-grow ml-scroll ml-pad ml-stack ml-gap">
          <div class="bundle-picker moonlight-field">
            <span class="moonlight-field-label">Bundle</span>
            <SelectInput
              v-model="selectedBundle"
              :options="bundles"
              :disabled="scenarioBusy"
              label="Bundle"
              @change="emit('selectBundle')"
            />
          </div>
          <div class="bundle-picker moonlight-field">
            <span class="moonlight-field-label ml-row">
              <span class="ml-grow">{{ scenarioMode ? 'Scenario' : 'Registry' }}</span>
              <MoonlightButton
                size="icon"
                type="button"
                :aria-pressed="scenarioMode"
                :disabled="scenarioBusy"
                title="Switch between registry and scenario"
                aria-label="Switch between registry and scenario"
                @click="emit('toggleScenarioMode')"
                ><ArrowLeftRight :size="16" aria-hidden="true"
              /></MoonlightButton>
            </span>
            <div v-if="scenarioMode" class="ml-row ml-gap">
              <SelectInput
                v-model="selectedScenario"
                :options="scenarios"
                :option-labels="scenarioLabels"
                :disabled="scenarioBusy || projectLoading"
                label="Scenario"
                @change="emit('selectScenario')"
              />
              <MoonlightButton
                type="button"
                size="icon"
                title="New Scenario"
                aria-label="New Scenario"
                :disabled="!selectedBundle || projectLoading || scenarioBusy"
                @click="
                  scenarioName = '';
                  scenarioSubmitted = false;
                  scenarioDialog?.showModal();
                "
                ><Plus :size="16" aria-hidden="true"
              /></MoonlightButton>
            </div>
            <MoonlightButton
              v-if="scenarioMode && selectedScenario"
              type="button"
              :disabled="scenarioBusy || projectLoading || editorLoading"
              @click="emit('manageScenario')"
            >
              Manage Scenario
            </MoonlightButton>
            <SelectInput
              v-if="!scenarioMode"
              v-model="selectedRegistry"
              :options="registries"
              :disabled="scenarioBusy"
              label="Registry"
              @change="emit('requestProject')"
            />
          </div>
          <div class="file-search moonlight-field">
            <label :for="searchInputId" class="moonlight-field-label">Search</label>
            <div class="ml-row-stretch ml-gap">
              <input
                :id="searchInputId"
                class="moonlight-input ml-grow"
                v-model="fileSearch"
                type="search"
                placeholder="Search paths or names…"
                :disabled="!selectedBundle || !selectedRegistry"
                spellcheck="false"
              />
              <MoonlightButton
                size="icon"
                class="close"
                type="button"
                :disabled="scenarioMode || !selectedBundle || !selectedRegistry"
                title="Pick a resource in this registry from the world"
                aria-label="Pick a resource in this registry from the world"
                @click="emit('pickResource')"
              >
                <Pipette :size="16" aria-hidden="true" />
              </MoonlightButton>
              <MoonlightButton
                size="icon"
                class="close"
                type="button"
                :disabled="
                  !selectedBundle ||
                  (scenarioMode ? !selectedScenario : !selectedRegistry) ||
                  projectLoading ||
                  editorLoading ||
                  scenarioBusy
                "
                title="Create a new registry entry"
                aria-label="Create a new registry entry"
                @click="openCreateDialog()"
              >
                <FilePlus :size="16" aria-hidden="true" />
              </MoonlightButton>
            </div>
          </div>
          <div v-if="projectLoading" class="loading moonlight-loading ml-grow" role="status" aria-label="Loading paths">
            <span class="spinner moonlight-spinner" aria-hidden="true" />
          </div>
          <p v-else-if="filteredFiles.length === 0" class="files-empty moonlight-empty" role="status">
            {{
              fileSearch.trim()
                ? 'No matching files.'
                : scenarioMode
                  ? 'No entries in this scenario.'
                  : 'No files in this registry.'
            }}
          </p>
          <ul v-else class="files moonlight-list">
            <li
              v-for="file in filteredFiles"
              :key="file.path"
              @keydown.esc="contextPath = null"
              @focusout="contextPath = null"
            >
              <MoonlightButton
                variant="ghost"
                layout="stacked"
                class="moonlight-item"
                :aria-selected="file.path === selectedPath"
                :title="file.path"
                @contextmenu.prevent.stop="openEntryContextMenu($event, file.path)"
                @click="emit('openFile', file.path)"
              >
                <span class="file-heading ml-row ml-gap">
                  <RegistryIcon
                    v-if="scenarioMode && file.icon"
                    :name="file.icon"
                    :title="file.registry"
                    :size="16"
                    aria-hidden="true"
                  />
                  <span class="file-name ml-grow ml-truncate">{{ file.name ?? pathWithinRegistry(file.path) }}</span>
                  <span
                    v-if="localPaths.includes(file.path)"
                    class="change-dot local moonlight-badge"
                    title="Unapplied local changes"
                    role="img"
                    aria-label="Unapplied local changes"
                  />
                  <span
                    v-if="pendingPaths.includes(file.path)"
                    class="change-dot pending moonlight-badge"
                    title="Unpersisted changes"
                    role="img"
                    aria-label="Unpersisted changes"
                  />
                </span>
                <small class="ml-truncate">({{ pathWithinRegistry(file.path) }})</small>
              </MoonlightButton>
            </li>
          </ul>
        </div>
        <footer class="browser-footer ml-column ml-pad ml-border-top" aria-label="Batch resource actions">
          <MoonlightButton
            variant="success"
            class="persist"
            :disabled="pendingChanges === 0 || !permissions.persistAll"
            @click="requestConfirmation('persist')"
          >
            Persist {{ pendingChanges }} changes
          </MoonlightButton>
          <MoonlightButton
            variant="danger"
            class="discard"
            :disabled="pendingChanges === 0 || !permissions.discardAll"
            @click="requestConfirmation('discard')"
          >
            Rollback {{ pendingChanges }} changes
          </MoonlightButton>
        </footer>
      </aside>
      <main class="editor moonlight-panel">
        <header class="toolbar moonlight-toolbar">
          <MoonlightSwitch
            v-if="selectedPath && enabledField"
            class="enabled-switch"
            type="button"
            :checked="parsedContents?.[enabledField] === true"
            aria-label="Enabled"
            :title="parsedContents?.[enabledField] === true ? 'Disable resource' : 'Enable resource'"
            :disabled="editorLoading || !parsedContents || !permissions.apply"
            @click="toggleEnabled"
          >
          </MoonlightSwitch>
          <span class="path moonlight-description ml-grow">
            <template v-if="selectedPath">
              <span>{{ selectedFileName ?? selectedFile?.name ?? pathWithinRegistry(selectedPath) }}</span>
              <small class="ml-truncate">({{ pathWithinRegistry(selectedPath) }})</small>
            </template>
            <template v-else>Select a file</template>
          </span>
          <MoonlightButton variant="ghost" size="icon" aria-label="Close editor" @click="emit('close')">
            <X :size="18" aria-hidden="true" />
          </MoonlightButton>
        </header>
        <div v-if="editorLoading" class="loading moonlight-loading ml-grow" role="status" aria-label="Loading editor">
          <span class="spinner moonlight-spinner" aria-hidden="true" />
        </div>
        <div v-else-if="selectedPath" class="document ml-document ml-grow">
          <div class="document-toolbar moonlight-toolbar moonlight-toolbar-compact ml-wrap">
            <nav class="tabs moonlight-tabs" aria-label="Editor view">
              <MoonlightButton
                size="small"
                v-if="schema"
                variant="tab"
                :aria-selected="activeTab === 'form'"
                type="button"
                @click="activeTab = 'form'"
              >
                Form
              </MoonlightButton>
              <MoonlightButton
                size="small"
                variant="tab"
                :aria-selected="activeTab === 'json'"
                type="button"
                @click="activeTab = 'json'"
              >
                Raw JSON
              </MoonlightButton>
            </nav>
            <div class="resource-actions ml-row ml-wrap" aria-label="Resource actions">
              <MoonlightButton
                size="small"
                class="close duplicate"
                type="button"
                :disabled="editorLoading || projectLoading"
                title="Duplicate"
                aria-label="Duplicate"
                @click="openCreateDialog(true)"
              >
                <Copy :size="16" aria-hidden="true" />
              </MoonlightButton>
              <MoonlightButton
                size="small"
                variant="primary"
                class="save"
                :disabled="!isDirty || editorLoading || !permissions.apply"
                @click="emit('save')"
              >
                Apply
              </MoonlightButton>
              <MoonlightButton
                size="small"
                variant="danger"
                class="discard"
                :disabled="!isDirty || editorLoading"
                @click="emit('discardLocal')"
              >
                Discard
              </MoonlightButton>
              <MoonlightButton
                size="small"
                variant="success"
                class="persist"
                :disabled="!resourceHasChanges || editorLoading || !permissions.persist"
                @click="requestConfirmation('persist', selectedPath)"
              >
                Persist
              </MoonlightButton>
              <MoonlightButton
                size="small"
                variant="danger"
                class="discard"
                :disabled="!resourceHasChanges || editorLoading || !permissions.discard"
                @click="requestConfirmation('discard', selectedPath)"
              >
                Rollback
              </MoonlightButton>
            </div>
          </div>
          <SchemaForm
            v-if="schema && activeTab === 'form'"
            class="document-form moonlight-form-scroll ml-scroll ml-grow"
            :readonly="!permissions.apply"
            :schema="formSchema!"
            :contents="contents"
            :registry-options="registryOptions"
            @update-contents="permissions.apply && (contents = $event)"
            @search-registry="searchRegistry"
            @pick-coordinate="emit('pickCoordinate', $event)"
            @pick-distance="emit('pickDistance', $event)"
          />
          <textarea
            class="moonlight-input moonlight-code ml-grow"
            v-else
            v-model="contents"
            :readonly="!permissions.apply"
            spellcheck="false"
          />
        </div>
        <div v-else class="empty moonlight-empty ml-grow ml-center">Select a bundle data file.</div>
        <footer class="status moonlight-status ml-pad ml-border-top" :class="{ error: statusIsError }">
          {{ status }}
        </footer>
      </main>
      <dialog
        ref="moveDialog"
        class="confirmation moonlight-dialog"
        aria-labelledby="move-scenario-title"
        @cancel.prevent="!scenarioBusy && moveDialog?.close()"
      >
        <form class="ml-stack ml-gap" @submit.prevent="submitMove">
          <h2 id="move-scenario-title">Move to Scenario</h2>
          <p class="moonlight-description">{{ movePath ? pathWithinRegistry(movePath) : '' }}</p>
          <label class="moonlight-field">
            <span>Scenario</span>
            <SelectInput
              v-model="moveTarget"
              :options="scenarios"
              :option-labels="scenarioLabels"
              label="Target scenario"
              :disabled="scenarioCatalogLoading || scenarioBusy"
            />
          </label>
          <p v-if="scenarioCatalogLoading" role="status">Loading scenarios…</p>
          <p v-else-if="!scenarios.length" class="moonlight-description">
            Create a scenario first using the scenario picker.
          </p>
          <p v-if="statusIsError" class="moonlight-error" role="alert">{{ status }}</p>
          <div class="ml-row ml-end ml-gap">
            <MoonlightButton type="button" :disabled="scenarioBusy" @click="moveDialog?.close()"
              >Cancel</MoonlightButton
            >
            <MoonlightButton
              type="submit"
              :disabled="!moveTarget || scenarioCatalogLoading || scenarioBusy || moveSubmitted"
              >Move</MoonlightButton
            >
          </div>
        </form>
      </dialog>
      <dialog ref="scenarioDialog" class="confirmation moonlight-dialog" aria-labelledby="new-scenario-title">
        <form @submit.prevent="submitScenario">
          <h2 id="new-scenario-title">New Scenario</h2>
          <label class="moonlight-field"
            ><span>Name</span
            ><input class="moonlight-input" v-model="scenarioName" required autofocus :disabled="scenarioBusy"
          /></label>
          <p v-if="Object.values(scenarioLabels).includes(scenarioName.trim())" class="moonlight-error">
            A scenario with this name already exists.
          </p>
          <p v-if="statusIsError && !scenarioBusy" class="moonlight-error" role="alert">{{ status }}</p>
          <div class="ml-row ml-end ml-gap">
            <MoonlightButton type="button" :disabled="scenarioBusy" @click="scenarioDialog?.close()"
              >Cancel</MoonlightButton
            >
            <MoonlightButton
              type="submit"
              :disabled="
                scenarioBusy ||
                !scenarioName.trim() ||
                !/[a-zA-Z0-9_-]/.test(scenarioName) ||
                Object.values(scenarioLabels).includes(scenarioName.trim())
              "
              >Create</MoonlightButton
            >
          </div>
        </form>
      </dialog>
      <dialog
        ref="createDialog"
        class="confirmation moonlight-dialog"
        aria-labelledby="create-entry-title"
        @cancel.prevent="closeCreateDialog"
      >
        <form @submit.prevent="submitCreate">
          <h2 id="create-entry-title">
            {{ renamingPath ? 'Rename entry' : duplicating ? 'Duplicate entry' : 'New entry' }}
          </h2>
          <label v-if="scenarioMode && !renamingPath && !duplicating" class="bundle-picker moonlight-field">
            <span>Registry</span
            ><SelectInput v-model="entryRegistry" :options="registries" label="Registry" :disabled="createSubmitted" />
          </label>
          <label class="bundle-picker moonlight-field">
            <span>Name</span>
            <input
              class="moonlight-input"
              v-model="entryName"
              autofocus
              required
              autocomplete="off"
              spellcheck="false"
              :disabled="createSubmitted"
            />
          </label>
          <p v-if="entryName.trim() && entryNameError" class="name-error moonlight-error" role="alert">
            {{ entryNameError }}
          </p>
          <p
            v-if="createAttempted && statusIsError && !createSubmitted"
            class="name-error moonlight-error"
            role="alert"
          >
            {{ status }}
          </p>
          <div class="confirmation-actions ml-row ml-end">
            <MoonlightButton class="close" type="button" @click="closeCreateDialog">Cancel</MoonlightButton>
            <MoonlightButton
              variant="primary"
              class="save"
              type="submit"
              :disabled="!!entryNameError || createSubmitted || (scenarioMode && !entryRegistry)"
            >
              {{ createSubmitted ? (renamingPath ? 'Renaming…' : 'Creating…') : renamingPath ? 'Rename' : 'Create' }}
            </MoonlightButton>
          </div>
        </form>
      </dialog>
      <dialog
        ref="confirmationDialog"
        class="confirmation moonlight-dialog"
        aria-labelledby="confirmation-title"
        @cancel.prevent="confirmation = null"
      >
        <h2 id="confirmation-title">{{ confirmation === 'persist' ? 'Persist' : 'Rollback' }} changes?</h2>
        <p v-if="confirmation === 'persist'">Write pending changes to the following resource files:</p>
        <p v-else>Restore the file-backed values for the following resources:</p>
        <ul class="resource-list moonlight-resource-list">
          <li v-for="path in confirmationPaths" :key="path">{{ path }}</li>
        </ul>
        <p v-if="confirmationPaths.length === 0">No pending resources available.</p>
        <div class="confirmation-actions ml-row ml-end">
          <MoonlightButton class="close" type="button" autofocus @click="confirmation = null">Cancel</MoonlightButton>
          <MoonlightButton
            :variant="confirmation === 'persist' ? 'success' : 'danger'"
            type="button"
            :disabled="confirmationPaths.length === 0 || !confirmationAllowed"
            @click="confirmChanges"
          >
            {{ confirmation === 'persist' ? 'Persist' : 'Rollback' }} {{ confirmationPaths.length }}
            {{ confirmationPaths.length === 1 ? 'resource' : 'resources' }}
          </MoonlightButton>
        </div>
      </dialog>
    </MoonlightSurface>
  </div>
</template>
