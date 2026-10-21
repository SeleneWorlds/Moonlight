<script setup lang="ts">
import SliderInput from 'moonlight-ui/SliderInput.vue';
import ButtonGroup from 'moonlight-ui/ButtonGroup.vue';
import MoonlightSwitch from 'moonlight-ui/MoonlightSwitch.vue';
import MoonlightSurface from 'moonlight-ui/MoonlightSurface.vue';
import MoonlightButton from 'moonlight-ui/MoonlightButton.vue';
import { ownsEscape } from 'moonlight-ui/keyboard';
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, useTemplateRef } from 'vue';
import { ChevronDown, Locate, Star, X } from '@lucide/vue';
import { z } from 'zod';
import { useSelene, type ClientNetworkPayload, type Coordinate } from './selene';
import RegistryVisual from 'moonlight-ui/RegistryVisual.vue';

const emptyTableAsArray = (value: unknown): unknown =>
  value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0 ? [] : value;
const registryOptionSchema = z.object({ value: z.string(), label: z.string(), visual: z.string().optional() });
const registryOptionsSchema = z.preprocess(emptyTableAsArray, z.array(registryOptionSchema));
const enumOptionSchema = z.object({ value: z.string(), label: z.string() });
const targetOptionSchema = z.object({
  value: z.string(),
  label: z.string(),
  visual: z.string().optional(),
  offline: z.boolean(),
  default: z.boolean(),
});
const targetOptionsSchema = z.preprocess(emptyTableAsArray, z.array(targetOptionSchema));

const parameterSchema = z.discriminatedUnion('type', [
  z.object({
    name: z.string(),
    label: z.string(),
    type: z.literal('file'),
    required: z.boolean(),
    default: z.string().optional(),
  }),
  z.object({
    name: z.string(),
    label: z.string(),
    type: z.literal('number'),
    required: z.boolean(),
    default: z.number().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    step: z.number().positive().optional(),
    editor: z.literal('slider').optional(),
  }),
  z.object({
    name: z.string(),
    label: z.string(),
    type: z.literal('string'),
    required: z.boolean(),
    default: z.string().optional(),
  }),
  z.object({
    name: z.string(),
    label: z.string(),
    type: z.literal('message'),
    required: z.boolean(),
    default: z.string().optional(),
  }),
  z.object({
    name: z.string(),
    label: z.string(),
    type: z.literal('boolean'),
    required: z.boolean(),
    default: z.boolean().optional(),
  }),
  z.object({
    name: z.string(),
    label: z.string(),
    type: z.literal('enum'),
    required: z.boolean(),
    default: z.string().optional(),
    options: z.array(enumOptionSchema).min(1),
  }),
  z.object({
    name: z.string(),
    label: z.string(),
    type: z.literal('coordinate'),
    required: z.boolean(),
    default: z.object({ x: z.number(), y: z.number(), z: z.number() }).optional(),
  }),
  z.object({
    name: z.string(),
    label: z.string(),
    type: z.literal('registry'),
    required: z.boolean(),
    registry: z.string(),
    deferred: z.boolean(),
    default: z.string().optional(),
    options: registryOptionsSchema,
  }),
  z.object({
    name: z.string(),
    label: z.string(),
    type: z.literal('target'),
    required: z.boolean(),
    resolver: z.string(),
    requireOnline: z.boolean(),
    deferred: z.boolean(),
    optionSet: z.string(),
    default: z.string().optional(),
    options: targetOptionsSchema,
  }),
]);

const actionSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string().optional(),
  parameters: z.preprocess(emptyTableAsArray, z.array(parameterSchema)),
});

const actionsPayloadSchema = z.object({
  actions: z.preprocess(emptyTableAsArray, z.array(actionSchema)),
  targetOptions: z.record(z.string(), targetOptionsSchema),
});
const resultPayloadSchema = z.object({
  actionId: z.string(),
  success: z.boolean(),
  message: z.string(),
  download: z.object({ name: z.string(), content: z.string() }).optional(),
});
const registryOptionsPayloadSchema = z.object({
  actionId: z.string(),
  parameterName: z.string(),
  query: z.string(),
  options: registryOptionsSchema,
});
const targetOptionsPayloadSchema = z.object({
  actionId: z.string(),
  parameterName: z.string(),
  query: z.string(),
  options: targetOptionsSchema,
});

type AdminAction = z.infer<typeof actionSchema>;
type RegistryParameter = Extract<AdminAction['parameters'][number], { type: 'registry' | 'target' }>;
type EnumParameter = Extract<AdminAction['parameters'][number], { type: 'enum' }>;
type CoordinateInput = { x: number | undefined; y: number | undefined; z: number | undefined };
type ParameterValue = string | number | boolean | CoordinateInput | undefined;

const alwaysKeepMenuOpenAfterExecute = true;
const favoriteActionsStorageKey = 'moonlight-admin:favorite-actions';

function loadFavoriteActionIds(): string[] {
  try {
    const stored = JSON.parse(localStorage.getItem(favoriteActionsStorageKey) ?? '[]');
    return Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

const selene = useSelene();
const isOpen = ref(false);
const actions = ref<AdminAction[]>([]);
const favoriteActionIds = ref(loadFavoriteActionIds());
const searchQuery = ref('');
const searchInput = useTemplateRef<HTMLInputElement>('searchInput');
const actionsList = useTemplateRef<HTMLElement>('actionsList');
const expandedActionId = ref<string | null>(null);
const values = reactive<Record<string, Record<string, ParameterValue>>>({});
const executingActionId = ref<string | null>(null);
const closeOnSuccessActionId = ref<string | null>(null);
const result = ref<{ actionId: string; success: boolean; message: string } | null>(null);
const openRegistryKey = ref<string | null>(null);
const openEnumKey = ref<string | null>(null);
const registryQueries = reactive<Record<string, string>>({});
const includeOffline = reactive<Record<string, boolean>>({});
const pickingCoordinate = ref<{ actionId: string; parameterName: string } | null>(null);

const unsubscribers: Array<() => void> = [];
let openAfterActions = false;
let releaseMenuKeys: (() => void) | undefined;
let releasePickerKeys: (() => void) | undefined;
let releasePickerPointer: (() => void) | undefined;

const filteredActions = computed(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase();
  if (!query) {
    const favorites = new Set(favoriteActionIds.value);
    return actions.value
      .map((action, index) => ({ action, index }))
      .sort(
        (left, right) =>
          Number(favorites.has(right.action.id)) - Number(favorites.has(left.action.id)) || left.index - right.index,
      )
      .map(({ action }) => action);
  }
  return actions.value
    .map((action) => ({ action, score: actionSearchScore(action, query) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.action.label.localeCompare(right.action.label))
    .map(({ action }) => action);
});
const unmatchedActionsCount = computed(() =>
  searchQuery.value.trim() ? actions.value.length - filteredActions.value.length : 0,
);

function textSearchScore(value: string | undefined, query: string): number {
  if (!value) {
    return 0;
  }
  const normalized = value.toLocaleLowerCase();
  if (normalized === query) {
    return 1000;
  }
  if (normalized.startsWith(query)) {
    return 800;
  }
  if (normalized.split(/[^\p{L}\p{N}]+/u).some((word) => word.startsWith(query))) {
    return 600;
  }
  const index = normalized.indexOf(query);
  return index === -1 ? 0 : 400 - index;
}

function actionSearchScore(action: AdminAction, query: string): number {
  return Math.max(
    textSearchScore(action.label, query),
    textSearchScore(action.id, query) * 0.5,
    textSearchScore(action.description, query) * 0.25,
  );
}

function isFavorite(actionId: string): boolean {
  return favoriteActionIds.value.includes(actionId);
}

function toggleFavorite(actionId: string): void {
  favoriteActionIds.value = isFavorite(actionId)
    ? favoriteActionIds.value.filter((id) => id !== actionId)
    : [...favoriteActionIds.value, actionId];
  try {
    localStorage.setItem(favoriteActionsStorageKey, JSON.stringify(favoriteActionIds.value));
  } catch {
    // Favoriting still works for this session when persistent storage is unavailable.
  }
}

function defaultsFor(action: AdminAction): Record<string, ParameterValue> {
  return Object.fromEntries(
    action.parameters.map((parameter) => [
      parameter.name,
      parameter.default ??
        (parameter.type === 'boolean'
          ? false
          : parameter.type === 'coordinate'
            ? { x: undefined, y: undefined, z: undefined }
            : undefined),
    ]),
  );
}

function coordinateValue(action: AdminAction, parameterName: string): CoordinateInput {
  return values[action.id]![parameterName] as CoordinateInput;
}

function finishCoordinatePicker(coordinate?: Coordinate): void {
  const picker = pickingCoordinate.value;
  if (!picker) {
    return;
  }
  if (coordinate) {
    values[picker.actionId]![picker.parameterName] = { ...coordinate };
  }
  releasePickerKeys?.();
  releasePickerPointer?.();
  releasePickerKeys = undefined;
  releasePickerPointer = undefined;
  pickingCoordinate.value = null;
  setMenuOpen(true);
}

function startCoordinatePicker(action: AdminAction, parameterName: string): void {
  setMenuOpen(false);
  pickingCoordinate.value = { actionId: action.id, parameterName };
  releasePickerKeys = selene.input.captureKeys('Escape');
  releasePickerPointer = selene.input.onPointerDown((event) => {
    if (event.button === 0) {
      finishCoordinatePicker(event.coordinate);
    }
  });
}

function requestActions(): void {
  selene.network.sendToServer('moonlight-admin:request-actions');
}

function receiveActions(payload: ClientNetworkPayload): void {
  const parsed = actionsPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    console.error('[Moonlight Admin] Invalid action list', parsed.error);
    return;
  }
  actions.value = parsed.data.actions;
  if (actions.value.length === 0) {
    setMenuOpen(false);
  }
  for (const action of actions.value) {
    for (const parameter of action.parameters) {
      if (parameter.type === 'target') {
        parameter.options = parsed.data.targetOptions[parameter.optionSet] ?? [];
      }
    }
    values[action.id] ??= defaultsFor(action);
    for (const parameter of action.parameters) {
      if (parameter.type === 'registry' || parameter.type === 'target') {
        const key = registryKey(action.id, parameter.name);
        const selected = parameter.options.find((option) => option.value === values[action.id]?.[parameter.name]);
        registryQueries[key] = selected?.label ?? '';
      }
    }
  }
  if (openAfterActions) {
    openAfterActions = false;
    setMenuOpen(actions.value.length > 0);
  }
}

function receiveResult(payload: ClientNetworkPayload): void {
  const parsed = resultPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    console.error('[Moonlight Admin] Invalid action result', parsed.error);
    return;
  }
  executingActionId.value = null;
  result.value = parsed.data;
  if (parsed.data.success && parsed.data.download) {
    const file = parsed.data.download;
    const url = URL.createObjectURL(new Blob([file.content], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  const shouldClose = parsed.data.success && closeOnSuccessActionId.value === parsed.data.actionId;
  closeOnSuccessActionId.value = null;
  if (shouldClose) {
    setMenuOpen(false);
  }
}

function receiveRegistryOptions(payload: ClientNetworkPayload): void {
  const parsed = registryOptionsPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    console.error('[Moonlight Admin] Invalid registry options', parsed.error);
    return;
  }
  const key = registryKey(parsed.data.actionId, parsed.data.parameterName);
  if ((registryQueries[key] ?? '') !== parsed.data.query) {
    return;
  }
  const action = actions.value.find((candidate) => candidate.id === parsed.data.actionId);
  const parameter = action?.parameters.find((candidate) => candidate.name === parsed.data.parameterName);
  if (parameter?.type === 'registry' && parameter.deferred) {
    parameter.options = parsed.data.options;
  }
}

function receiveTargetOptions(payload: ClientNetworkPayload): void {
  const parsed = targetOptionsPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    console.error('[Moonlight Admin] Invalid target options', parsed.error);
    return;
  }
  const key = registryKey(parsed.data.actionId, parsed.data.parameterName);
  if ((registryQueries[key] ?? '') !== parsed.data.query) {
    return;
  }
  const action = actions.value.find((candidate) => candidate.id === parsed.data.actionId);
  const parameter = action?.parameters.find((candidate) => candidate.name === parsed.data.parameterName);
  if (parameter?.type === 'target' && parameter.deferred) {
    parameter.options = parsed.data.options;
  }
}

function requestChoiceOptions(action: AdminAction, parameter: RegistryParameter): void {
  if (!parameter.deferred) {
    return;
  }
  const query = registryQueries[registryKey(action.id, parameter.name)] ?? '';
  selene.network.sendToServer(
    parameter.type === 'registry' ? 'moonlight-admin:search-registry' : 'moonlight-admin:search-target',
    {
      actionId: action.id,
      parameterName: parameter.name,
      query,
    },
  );
}

async function toggleAction(action: AdminAction, event: MouseEvent): Promise<void> {
  const expanding = expandedActionId.value !== action.id;
  const actionElement = (event.currentTarget as HTMLElement).closest<HTMLElement>('.action');
  expandedActionId.value = expanding ? action.id : null;
  result.value = null;
  if (expanding) {
    await nextTick();
    actionElement?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

async function expandFirstAvailableAction(): Promise<void> {
  const action = filteredActions.value[0];
  if (!action || action.parameters.length === 0) {
    return;
  }
  expandedActionId.value = action.id;
  result.value = null;
  await nextTick();
  actionsList.value?.querySelector<HTMLElement>('.action')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function registryKey(actionId: string, parameterName: string): string {
  return `${actionId}:${parameterName}`;
}

function selectedEnumLabel(action: AdminAction, parameter: EnumParameter): string {
  return parameter.options.find((option) => option.value === values[action.id]?.[parameter.name])?.label ?? 'Select…';
}

function toggleEnumDropdown(action: AdminAction, parameter: EnumParameter): void {
  const key = registryKey(action.id, parameter.name);
  openRegistryKey.value = null;
  openEnumKey.value = openEnumKey.value === key ? null : key;
}

function selectEnumOption(action: AdminAction, parameter: EnumParameter, value: string | undefined): void {
  values[action.id]![parameter.name] = value;
  openEnumKey.value = null;
}

function closeEnumDropdown(key: string): void {
  window.setTimeout(() => {
    if (openEnumKey.value === key) {
      openEnumKey.value = null;
    }
  });
}

function matchingRegistryOptions(parameter: RegistryParameter, key: string) {
  const query = (registryQueries[key] ?? '').trim().toLocaleLowerCase();
  return parameter.options.filter((option) => {
    if ('offline' in option && option.offline && !includeOffline[key]) {
      return false;
    }
    return (
      !query || option.label.toLocaleLowerCase().includes(query) || option.value.toLocaleLowerCase().includes(query)
    );
  });
}

function toggleOfflineTargets(action: AdminAction, parameter: RegistryParameter): void {
  if (parameter.type !== 'target') {
    return;
  }
  const key = registryKey(action.id, parameter.name);
  includeOffline[key] = !includeOffline[key];
  if (!includeOffline[key]) {
    const selected = parameter.options.find((option) => option.value === values[action.id]?.[parameter.name]);
    if (selected?.offline) {
      values[action.id]![parameter.name] = undefined;
      registryQueries[key] = '';
    }
  }
}

function openRegistryDropdown(action: AdminAction, parameter: RegistryParameter): void {
  const key = registryKey(action.id, parameter.name);
  const selected = parameter.options.find((option) => option.value === values[action.id]?.[parameter.name]);
  registryQueries[key] = selected?.label ?? '';
  openRegistryKey.value = key;
  requestChoiceOptions(action, parameter);
}

function searchRegistryOptions(action: AdminAction, parameter: RegistryParameter, event: Event): void {
  const key = registryKey(action.id, parameter.name);
  registryQueries[key] = (event.target as HTMLInputElement).value;
  values[action.id]![parameter.name] = undefined;
  openRegistryKey.value = key;
  requestChoiceOptions(action, parameter);
}

function selectRegistryOption(
  action: AdminAction,
  parameter: RegistryParameter,
  option: RegistryParameter['options'][number],
): void {
  const key = registryKey(action.id, parameter.name);
  values[action.id]![parameter.name] = option.value;
  registryQueries[key] = option.label;
  openRegistryKey.value = null;
}

function selectFirstRegistryOption(action: AdminAction, parameter: RegistryParameter): void {
  const key = registryKey(action.id, parameter.name);
  const option = matchingRegistryOptions(parameter, key)[0];
  if (option) {
    selectRegistryOption(action, parameter, option);
  }
}

function closeRegistryDropdown(key: string): void {
  window.setTimeout(() => {
    if (openRegistryKey.value === key) {
      openRegistryKey.value = null;
    }
  });
}

function suppliedParameters(action: AdminAction): Record<string, unknown> {
  const actionValues = values[action.id] ?? {};
  const supplied: Record<string, unknown> = {};
  for (const parameter of action.parameters) {
    const value = actionValues[parameter.name];
    if (value === undefined) {
      continue;
    }
    if (parameter.type === 'coordinate') {
      const coordinate = value as CoordinateInput;
      const components = Object.fromEntries(
        (['x', 'y', 'z'] as const)
          .filter((axis) => coordinate[axis] !== undefined)
          .map((axis) => [axis, coordinate[axis]]),
      );
      if (Object.keys(components).length > 0) {
        supplied[parameter.name] = components;
      }
    } else {
      supplied[parameter.name] = value;
    }
  }
  return supplied;
}

async function readFile(action: AdminAction, name: string, event: Event): Promise<void> {
  values[action.id]![name] = undefined;
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) {
    return;
  }
  try {
    if (file.size > 4 * 1024 * 1024) {
      throw new Error('Character JSON must be at most 4 MiB.');
    }
    values[action.id]![name] = await file.text();
  } catch (error) {
    result.value = { actionId: action.id, success: false, message: String(error) };
  }
}

function execute(action: AdminAction, keepOpen = false): void {
  executingActionId.value = action.id;
  closeOnSuccessActionId.value = keepOpen || alwaysKeepMenuOpenAfterExecute ? null : action.id;
  result.value = null;
  try {
    selene.network.sendToServer('moonlight-admin:execute', {
      actionId: action.id,
      parameters: suppliedParameters(action),
    });
  } catch (error) {
    executingActionId.value = null;
    closeOnSuccessActionId.value = null;
    result.value = {
      actionId: action.id,
      success: false,
      message: error instanceof Error ? error.message : String(error),
    };
    return;
  }
}

async function focusSearch(): Promise<void> {
  await nextTick();
  searchInput.value?.focus();
  searchInput.value?.select();
}

async function scrollExpandedActionIntoView(): Promise<void> {
  await nextTick();
  const actionId = expandedActionId.value;
  if (!actionId) {
    return;
  }
  [...(actionsList.value?.querySelectorAll<HTMLElement>('.action') ?? [])]
    .find((element) => element.dataset.actionId === actionId)
    ?.scrollIntoView({ behavior: 'instant', block: 'nearest' });
}

function setMenuOpen(open: boolean): void {
  if (open && actions.value.length === 0) {
    return;
  }
  isOpen.value = open;
  if (!open) {
    openRegistryKey.value = null;
    closeOnSuccessActionId.value = null;
  }
  releaseMenuKeys?.();
  releaseMenuKeys = open ? selene.input.captureKeys('Escape', 'Enter') : undefined;
  if (open) {
    void focusSearch();
    void scrollExpandedActionIntoView();
  }
}

function handleMenuKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && ownsEscape(event)) {
    return;
  }
  if (pickingCoordinate.value) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      finishCoordinatePicker();
    }
    return;
  }
  const shouldClose = event.key === 'Escape' && isOpen.value;
  if (!shouldClose || event.repeat) {
    return;
  }
  event.preventDefault();
  event.stopImmediatePropagation();
  openAfterActions = false;
  setMenuOpen(false);
}

function toggleMenu(): boolean | void {
  if (pickingCoordinate.value) {
    return false;
  }
  if (isOpen.value || openAfterActions) {
    openAfterActions = false;
    setMenuOpen(false);
  } else {
    openAfterActions = true;
    requestActions();
  }
}

function handleExecuteShortcut(event: KeyboardEvent): void {
  if (
    event.key !== 'Enter' ||
    !event.ctrlKey ||
    event.altKey ||
    event.metaKey ||
    !isOpen.value ||
    pickingCoordinate.value ||
    event.repeat
  ) {
    return;
  }
  event.preventDefault();
  event.stopImmediatePropagation();
  const action = actions.value.find((candidate) => candidate.id === expandedActionId.value);
  if (action) {
    execute(action, event.shiftKey);
  }
}

onMounted(() => {
  unsubscribers.push(
    selene.input.registerBinding(
      { id: 'admin.toggle', label: 'Admin Menu', category: 'General', defaultBinding: 'F2', allowInText: true },
      toggleMenu,
    ),
    selene.network.onPayload('moonlight-admin:actions', receiveActions),
    selene.network.onPayload('moonlight-admin:result', receiveResult),
    selene.network.onPayload('moonlight-admin:registry-options', receiveRegistryOptions),
    selene.network.onPayload('moonlight-admin:target-options', receiveTargetOptions),
    selene.network.onConnected(requestActions),
  );
  window.addEventListener('keydown', handleExecuteShortcut, true);
  window.addEventListener('keydown', handleMenuKeydown);
});

onBeforeUnmount(() => {
  releaseMenuKeys?.();
  releasePickerKeys?.();
  releasePickerPointer?.();
  for (const unsubscribe of unsubscribers) {
    unsubscribe();
  }
  window.removeEventListener('keydown', handleExecuteShortcut, true);
  window.removeEventListener('keydown', handleMenuKeydown);
});
</script>

<template>
  <main class="layer ml-overlay">
    <MoonlightSurface
      as="div"
      variant="status"
      v-if="pickingCoordinate"
      class="picker-hint ml-status-top ml-grid"
      role="status"
    >
      <span>Select a coordinate</span>
      <small>Left click to select · Escape to cancel</small>
    </MoonlightSurface>
    <Transition name="moonlight-slide">
      <MoonlightSurface
        as="section"
        variant="panel"
        v-if="isOpen"
        class="menu moonlight-panel ml-docked"
        role="dialog"
        aria-label="admin menu"
      >
        <header class="header moonlight-toolbar">
          <div>
            <h1>Admin Menu</h1>
          </div>
          <MoonlightButton
            variant="ghost"
            size="icon"
            type="button"
            aria-label="Close admin menu"
            @click="setMenuOpen(false)"
          >
            <X :size="18" aria-hidden="true" />
          </MoonlightButton>
        </header>

        <div class="search ml-pad ml-border-bottom">
          <label class="ml-sr-only" for="admin-action-search">Search actions</label>
          <input
            class="moonlight-input"
            id="admin-action-search"
            ref="searchInput"
            v-model="searchQuery"
            type="search"
            placeholder="Search actions…"
            autocomplete="off"
            @keydown.enter.prevent="expandFirstAvailableAction"
          />
        </div>

        <div ref="actionsList" class="actions ml-grid ml-grow ml-scroll ml-pad">
          <p v-if="actions.length === 0" class="empty moonlight-empty">No actions are available.</p>
          <p v-else-if="filteredActions.length === 0" class="empty moonlight-empty">No matching actions.</p>
          <MoonlightSurface
            as="article"
            variant="card"
            v-for="action in filteredActions"
            :key="action.id"
            class="action"
            :data-action-id="action.id"
          >
            <div class="action-heading ml-row-stretch">
              <ButtonGroup :class="{ 'ml-grow': action.parameters.length > 0 }" :aria-label="`${action.label} actions`">
                <MoonlightButton
                  variant="ghost"
                  tone="warning"
                  selection-style="text"
                  class="favorite"
                  type="button"
                  :aria-label="`${isFavorite(action.id) ? 'Remove' : 'Add'} ${action.label} ${
                    isFavorite(action.id) ? 'from' : 'to'
                  } favorites`"
                  :aria-pressed="isFavorite(action.id)"
                  @click="toggleFavorite(action.id)"
                >
                  <Star :size="18" :fill="isFavorite(action.id) ? 'currentColor' : 'none'" aria-hidden="true" />
                </MoonlightButton>
                <MoonlightButton
                  v-if="action.parameters.length > 0"
                  variant="ghost"
                  class="toggle moonlight-item ml-between ml-grow"
                  type="button"
                  :aria-expanded="expandedActionId === action.id"
                  @click="toggleAction(action, $event)"
                >
                  <span class="moonlight-description">
                    <strong>{{ action.label }}</strong>
                    <small v-if="action.description">{{ action.description }}</small>
                  </span>
                  <ChevronDown :size="16" class="moonlight-chevron" aria-hidden="true" />
                </MoonlightButton>
              </ButtonGroup>
              <div v-if="action.parameters.length === 0" class="action-summary ml-row ml-grow ml-pad">
                <span class="moonlight-description">
                  <strong>{{ action.label }}</strong>
                  <small v-if="action.description">{{ action.description }}</small>
                </span>
              </div>
              <p
                v-if="action.parameters.length === 0 && result?.actionId === action.id"
                class="result inline-result moonlight-status success ml-grow"
                :class="{ error: !result.success }"
                role="status"
              >
                {{ result.message }}
              </p>
              <MoonlightButton
                variant="primary"
                v-if="action.parameters.length === 0"
                class="execute inline-execute ml-self-center ml-margin-end"
                type="button"
                :disabled="executingActionId === action.id"
                @click="execute(action, $event.shiftKey)"
              >
                {{ executingActionId === action.id ? 'Executing…' : 'Execute' }}
              </MoonlightButton>
            </div>

            <form
              v-if="action.parameters.length > 0 && expandedActionId === action.id"
              class="form moonlight-form ml-border-top"
              :class="{
                'form-with-sliders': action.parameters.some(
                  (parameter) => parameter.type === 'number' && parameter.editor === 'slider',
                ),
              }"
              @submit.prevent="execute(action)"
            >
              <div
                v-for="parameter in action.parameters"
                :key="parameter.name"
                class="field moonlight-field"
                :class="{
                  'ml-span-all':
                    parameter.type === 'coordinate' ||
                    parameter.type === 'registry' ||
                    parameter.type === 'target' ||
                    parameter.type === 'message',
                }"
              >
                <span v-if="parameter.type !== 'boolean'" class="field-heading ml-row ml-between">
                  <span>
                    {{ parameter.label }}
                    <small v-if="!parameter.required" class="optional-label ml-subtle">(optional)</small>
                  </span>
                  <MoonlightSwitch
                    v-if="parameter.type === 'target' && !parameter.requireOnline"
                    class="offline-toggle"
                    type="button"
                    :checked="includeOffline[registryKey(action.id, parameter.name)] === true"
                    @click="toggleOfflineTargets(action, parameter)"
                  >
                    Include Offline
                  </MoonlightSwitch>
                </span>
                <SliderInput
                  v-if="
                    parameter.type === 'number' &&
                    parameter.editor === 'slider' &&
                    parameter.min !== undefined &&
                    parameter.max !== undefined
                  "
                  :value="values[action.id]![parameter.name] as number | undefined"
                  :minimum="parameter.min"
                  :maximum="parameter.max"
                  :step="parameter.step"
                  :label="parameter.label"
                  :required="parameter.required"
                  @update="values[action.id]![parameter.name] = $event"
                />
                <input
                  class="moonlight-input"
                  v-else-if="parameter.type === 'number'"
                  v-model.number="values[action.id]![parameter.name]"
                  type="number"
                  :required="parameter.required"
                  :min="parameter.min"
                  :max="parameter.max"
                  :step="parameter.step ?? 'any'"
                />
                <input
                  class="moonlight-input"
                  v-else-if="parameter.type === 'string' || parameter.type === 'message'"
                  v-model="values[action.id]![parameter.name] as string"
                  type="text"
                  :required="parameter.required"
                />
                <input
                  v-else-if="parameter.type === 'file'"
                  class="moonlight-input"
                  type="file"
                  accept=".json,application/json"
                  :required="parameter.required"
                  @change="readFile(action, parameter.name, $event)"
                />
                <MoonlightSwitch
                  v-else-if="parameter.type === 'boolean'"
                  :checked="values[action.id]![parameter.name] === true"
                  :aria-label="parameter.label"
                  @click="values[action.id]![parameter.name] = values[action.id]![parameter.name] !== true"
                >
                  <span>
                    {{ parameter.label }}
                  </span>
                </MoonlightSwitch>
                <div v-else-if="parameter.type === 'enum'" class="select ml-relative">
                  <MoonlightButton
                    class="enum-trigger moonlight-item ml-between"
                    type="button"
                    :aria-expanded="openEnumKey === registryKey(action.id, parameter.name)"
                    :aria-controls="`${registryKey(action.id, parameter.name)}-options`"
                    @click="toggleEnumDropdown(action, parameter)"
                    @blur="closeEnumDropdown(registryKey(action.id, parameter.name))"
                  >
                    <span>{{ selectedEnumLabel(action, parameter) }}</span>
                    <ChevronDown :size="16" class="moonlight-chevron" aria-hidden="true" />
                  </MoonlightButton>
                  <MoonlightSurface
                    as="div"
                    variant="popup"
                    v-if="openEnumKey === registryKey(action.id, parameter.name)"
                    :id="`${registryKey(action.id, parameter.name)}-options`"
                    class="options moonlight-popup ml-popover"
                    role="listbox"
                  >
                    <MoonlightButton
                      class="moonlight-item"
                      variant="ghost"
                      v-if="!parameter.required"
                      type="button"
                      role="option"
                      :aria-selected="values[action.id]![parameter.name] === undefined"
                      @mousedown.prevent
                      @click="selectEnumOption(action, parameter, undefined)"
                    >
                      None
                    </MoonlightButton>
                    <MoonlightButton
                      class="moonlight-item"
                      variant="ghost"
                      v-for="option in parameter.options"
                      :key="option.value"
                      type="button"
                      role="option"
                      :aria-selected="values[action.id]![parameter.name] === option.value"
                      @mousedown.prevent
                      @click="selectEnumOption(action, parameter, option.value)"
                    >
                      {{ option.label }}
                    </MoonlightButton>
                  </MoonlightSurface>
                </div>
                <div v-else-if="parameter.type === 'coordinate'" class="coordinate-input moonlight-coordinates">
                  <label v-for="axis in ['x', 'y', 'z'] as const" :key="axis">
                    <span>{{ axis.toUpperCase() }}</span>
                    <input
                      class="moonlight-input"
                      v-model.number="coordinateValue(action, parameter.name)[axis]"
                      type="number"
                      step="1"
                      :required="parameter.required"
                    />
                  </label>
                  <MoonlightButton
                    type="button"
                    class="pick-coordinate"
                    :aria-label="`Pick ${parameter.label} from world`"
                    title="Pick coordinate from world"
                    @click="startCoordinatePicker(action, parameter.name)"
                  >
                    <Locate :size="16" aria-hidden="true" />
                  </MoonlightButton>
                </div>
                <div v-else class="select ml-relative">
                  <input
                    class="moonlight-input"
                    :value="registryQueries[registryKey(action.id, parameter.name)] ?? ''"
                    type="text"
                    role="combobox"
                    autocomplete="off"
                    :required="parameter.required"
                    :aria-expanded="openRegistryKey === registryKey(action.id, parameter.name)"
                    :aria-controls="`${registryKey(action.id, parameter.name)}-options`"
                    :placeholder="parameter.type === 'target' ? 'Search targets…' : 'Search registry…'"
                    @focus="openRegistryDropdown(action, parameter)"
                    @input="searchRegistryOptions(action, parameter, $event)"
                    @blur="closeRegistryDropdown(registryKey(action.id, parameter.name))"
                    @keydown.enter.prevent="selectFirstRegistryOption(action, parameter)"
                    @keydown.down.prevent="selectFirstRegistryOption(action, parameter)"
                  />
                  <MoonlightSurface
                    as="div"
                    variant="popup"
                    v-if="openRegistryKey === registryKey(action.id, parameter.name)"
                    :id="`${registryKey(action.id, parameter.name)}-options`"
                    class="options moonlight-popup ml-popover"
                    role="listbox"
                  >
                    <MoonlightButton
                      class="moonlight-item"
                      variant="ghost"
                      v-for="option in matchingRegistryOptions(parameter, registryKey(action.id, parameter.name))"
                      :key="option.value"
                      type="button"
                      role="option"
                      :aria-selected="values[action.id]![parameter.name] === option.value"
                      @mousedown.prevent
                      @click="selectRegistryOption(action, parameter, option)"
                    >
                      <RegistryVisual v-if="option.visual" :identifier="option.visual" />
                      <span class="option-text moonlight-description">
                        <strong>{{ option.label }}</strong>
                        <small>
                          {{ option.value }}{{ 'offline' in option && option.offline ? ' · Offline' : '' }}
                        </small>
                      </span>
                    </MoonlightButton>
                    <p v-if="matchingRegistryOptions(parameter, registryKey(action.id, parameter.name)).length === 0">
                      No matching entries.
                    </p>
                  </MoonlightSurface>
                </div>
              </div>

              <footer class="footer ml-row ml-end ml-span-all">
                <p
                  v-if="result?.actionId === action.id"
                  class="result moonlight-status success ml-grow"
                  :class="{ error: !result.success }"
                  role="status"
                >
                  {{ result.message }}
                </p>
                <MoonlightButton
                  variant="primary"
                  class="execute"
                  type="button"
                  :disabled="executingActionId === action.id"
                  @click="execute(action, $event.shiftKey)"
                >
                  {{ executingActionId === action.id ? 'Executing…' : 'Execute' }}
                </MoonlightButton>
              </footer>
            </form>
          </MoonlightSurface>
          <p
            v-if="filteredActions.length > 0 && unmatchedActionsCount > 0"
            class="filtered-count moonlight-empty ml-subtle"
          >
            {{ unmatchedActionsCount }} more {{ unmatchedActionsCount === 1 ? 'action' : 'actions' }} not matching
            search filter
          </p>
        </div>
      </MoonlightSurface>
    </Transition>
  </main>
</template>

<style scoped>
main {
  container-type: inline-size;
}
.form-with-sliders {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
@container (max-width: 480px) {
  .form-with-sliders {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
