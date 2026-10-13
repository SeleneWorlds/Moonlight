<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { ExternalLink, Trash2 } from '@lucide/vue';
import { defaultSchemaValue, type DistancePick, type SchemaDefinition } from './schema';
import { useSelene } from './selene';
import SchemaForm from './SchemaForm.vue';
import RegistryVisual from './RegistryVisual.vue';

type RegistryOption = { value: string; label: string; visual?: string };

const props = defineProps<{
  readonly?: boolean;
  keyType: SchemaDefinition;
  valueType: SchemaDefinition;
  contents: string;
  registryOptions: Record<string, Array<{ value: string; label: string; visual?: string }>>;
}>();
const emit = defineEmits<{
  updateContents: [contents: string];
  searchRegistry: [registry: string, query: string, lookup?: boolean];
  pickCoordinate: [field: string];
  pickDistance: [pick: DistancePick];
}>();
const entries = computed<Record<string, unknown>>(() => JSON.parse(props.contents));
const selene = useSelene();
const keyRegistry = computed(() =>
  typeof props.keyType !== 'string' && props.keyType.type === 'registry' ? props.keyType.registry : undefined,
);
const knownRegistryOptions = reactive<Record<string, Record<string, RegistryOption>>>({});

watch(
  () => props.registryOptions,
  (registries) => {
    for (const [registry, options] of Object.entries(registries)) {
      const known = (knownRegistryOptions[registry] ??= {});
      for (const option of options) {
        known[option.value] = option;
      }
    }
  },
  { immediate: true, deep: true },
);

watch(
  () => ({ registry: keyRegistry.value, keys: Object.keys(entries.value) }),
  ({ registry, keys }) => {
    if (registry) {
      for (const key of keys) {
        if (!knownRegistryOptions[registry]?.[key]) {
          emit('searchRegistry', registry, key, true);
        }
      }
    }
  },
  { immediate: true },
);

function entryOption(key: string): RegistryOption | undefined {
  return keyRegistry.value ? knownRegistryOptions[keyRegistry.value]?.[key] : undefined;
}

function openRegistryEntry(key: string): void {
  if (keyRegistry.value && key) {
    selene.network.sendToServer('moonlight-editor:open-registry-entry', { registry: keyRegistry.value, value: key });
  }
}
const primitiveValue = computed(() => {
  const definition = props.valueType;
  const type = typeof definition === 'string' ? definition : definition.type;
  if (type === 'enum' && typeof definition !== 'string') {
    return (definition.values ?? []).every(
      ({ value }) => value === null || ['string', 'number', 'boolean'].includes(typeof value),
    );
  }
  return ['string', 'integer', 'number', 'boolean', 'enabled', 'distance', 'registry', 'script', 'Direction'].includes(
    type,
  );
});
const inlineProperties = computed(() => {
  const definition = props.valueType;
  return typeof definition !== 'string' &&
    definition.type === 'object' &&
    definition.properties &&
    Object.keys(definition.properties).length <= 3
    ? definition.properties
    : null;
});
const draft = ref('{}');
const selectedKey = computed(() => {
  const key: unknown = JSON.parse(draft.value).key;
  return typeof key === 'string' || typeof key === 'number' ? String(key) : '';
});
const duplicate = computed(() => Object.prototype.hasOwnProperty.call(entries.value, selectedKey.value));

function add(): void {
  if (props.readonly) {
    return;
  }
  if (!selectedKey.value || duplicate.value) {
    return;
  }
  emit(
    'updateContents',
    JSON.stringify({
      ...entries.value,
      [selectedKey.value]: defaultSchemaValue(props.valueType),
    }),
  );
  draft.value = '{}';
}

function remove(key: string): void {
  if (props.readonly) {
    return;
  }
  const next = { ...entries.value };
  delete next[key];
  emit('updateContents', JSON.stringify(next));
}

function entryLabel(key: string): string {
  if (typeof props.keyType !== 'string' && props.keyType.type === 'enum') {
    return props.keyType.values?.find((option) => String(option.value) === key)?.label ?? key;
  }
  return entryOption(key)?.label ?? key;
}

function updateEntry(key: string, contents: string): void {
  if (props.readonly) {
    return;
  }
  emit('updateContents', JSON.stringify({ ...entries.value, [key]: JSON.parse(contents).value }));
}

function updateInlineEntry(key: string, contents: string): void {
  if (props.readonly) {
    return;
  }
  emit('updateContents', JSON.stringify({ ...entries.value, [key]: JSON.parse(contents) }));
}

function inlineContents(value: unknown): string {
  return JSON.stringify(value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {});
}

function valueLabel(value: unknown): string {
  if (
    typeof props.valueType === 'string' ||
    props.valueType.type !== 'object' ||
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    return 'Value';
  }
  const object = value as Record<string, unknown>;
  const parts = Object.entries(props.valueType.properties ?? {}).flatMap(([name, definition]) => {
    const current = object[name];
    if (current === undefined || current === null || current === '' || typeof current === 'object') {
      return [];
    }
    let display = String(current);
    if (typeof definition !== 'string') {
      if (definition.type === 'registry' && definition.registry) {
        display =
          props.registryOptions[definition.registry]?.find((option) => option.value === current)?.label ?? display;
      } else if (definition.type === 'enum') {
        display = definition.values?.find((option) => option.value === current)?.label ?? display;
      }
    }
    const label = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (character) => character.toUpperCase());
    return [`${label}: ${display}`];
  });
  return parts.join(' · ') || 'Value';
}
</script>

<template>
  <div class="map">
    <table v-if="primitiveValue" class="entries" :class="{ 'registry-keys': keyRegistry }">
      <thead>
        <tr>
          <th v-if="keyRegistry" scope="col" class="entry-preview"><span class="visually-hidden">Preview</span></th>
          <th scope="col" class="key-column">Key</th>
          <th scope="col">Value</th>
          <th scope="col" class="entry-actions">Actions</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(value, key) in entries" :key="key">
          <td v-if="keyRegistry" class="entry-preview">
            <RegistryVisual v-if="entryOption(key)?.visual" :identifier="entryOption(key)!.visual!" />
          </td>
          <th scope="row" class="entry-heading">
            <span class="entry-key" :title="key">
              <span>{{ entryLabel(key) }}</span>
            </span>
          </th>
          <td class="entry-value">
            <SchemaForm
              class="value-form"
              hide-field-labels
              :schema="{ value: valueType }"
              :field-labels="{ value: valueLabel(value) }"
              :contents="JSON.stringify({ value })"
              :registry-options="registryOptions"
              :readonly="readonly"
              @update-contents="updateEntry(key, $event)"
              @search-registry="(registry, query, lookup) => emit('searchRegistry', registry, query, lookup)"
              @pick-coordinate="emit('pickCoordinate', `${key}${$event === 'value' ? '' : $event.slice(5)}`)"
              @pick-distance="
                emit('pickDistance', {
                  ...$event,
                  field: `${key}${$event.field === 'value' ? '' : $event.field.slice(5)}`,
                })
              "
            />
          </td>
          <td class="entry-actions">
            <div class="action-buttons">
              <button
                v-if="keyRegistry"
                type="button"
                class="open-registry-entry"
                :disabled="!key"
                :aria-label="`Open ${entryLabel(key)} registry entry in the form`"
                title="Open registry entry in the form"
                @click="openRegistryEntry(key)"
              >
                <ExternalLink :size="16" aria-hidden="true" />
              </button>
              <button
                class="remove-entry"
                :disabled="readonly"
                type="button"
                :aria-label="`Remove ${entryLabel(key)}`"
                :title="`Remove ${entryLabel(key)}`"
                @click="remove(key)"
              >
                <Trash2 :size="16" aria-hidden="true" />
              </button>
            </div>
          </td>
        </tr>
        <tr v-if="Object.keys(entries).length === 0">
          <td :colspan="keyRegistry ? 4 : 3" class="empty">No entries.</td>
        </tr>
      </tbody>
    </table>
    <template v-else>
      <div v-for="(value, key) in entries" :key="key" class="entry">
        <div class="card-heading">
          <span class="entry-key" :title="key">
            <RegistryVisual v-if="entryOption(key)?.visual" :identifier="entryOption(key)!.visual!" />
            <span>{{ entryLabel(key) }}</span>
          </span>
          <div class="action-buttons">
            <button
              v-if="keyRegistry"
              type="button"
              class="open-registry-entry"
              :disabled="!key"
              :aria-label="`Open ${entryLabel(key)} registry entry in the form`"
              title="Open registry entry in the form"
              @click="openRegistryEntry(key)"
            >
              <ExternalLink :size="16" aria-hidden="true" />
            </button>
            <button
              class="remove-entry"
              :disabled="readonly"
              type="button"
              :aria-label="`Remove ${entryLabel(key)}`"
              :title="`Remove ${entryLabel(key)}`"
              @click="remove(key)"
            >
              <Trash2 :size="16" aria-hidden="true" />
            </button>
          </div>
        </div>
        <SchemaForm
          v-if="inlineProperties"
          class="inline-value"
          :schema="inlineProperties"
          :contents="inlineContents(value)"
          :registry-options="registryOptions"
          :readonly="readonly"
          @update-contents="updateInlineEntry(key, $event)"
          @search-registry="(registry, query, lookup) => emit('searchRegistry', registry, query, lookup)"
          @pick-coordinate="emit('pickCoordinate', `${key}.${$event}`)"
          @pick-distance="emit('pickDistance', { ...$event, field: `${key}.${$event.field}` })"
        />
        <SchemaForm
          v-else
          :schema="{ value: valueType }"
          :field-labels="{ value: valueLabel(value) }"
          :contents="JSON.stringify({ value })"
          :registry-options="registryOptions"
          :readonly="readonly"
          @update-contents="updateEntry(key, $event)"
          @search-registry="(registry, query, lookup) => emit('searchRegistry', registry, query, lookup)"
          @pick-coordinate="emit('pickCoordinate', `${key}${$event === 'value' ? '' : $event.slice(5)}`)"
          @pick-distance="
            emit('pickDistance', {
              ...$event,
              field: `${key}${$event.field === 'value' ? '' : $event.field.slice(5)}`,
            })
          "
        />
      </div>
    </template>
    <div v-if="!readonly" class="add-entry">
      <SchemaForm
        :key="contents"
        :hide-field-labels="primitiveValue"
        :schema="{ key: keyType }"
        :contents="draft"
        :registry-options="registryOptions"
        :readonly="readonly"
        @update-contents="draft = $event"
        @search-registry="(registry, query, lookup) => emit('searchRegistry', registry, query, lookup)"
      />
      <button type="button" :disabled="!selectedKey || duplicate" @click="add">Add entry</button>
    </div>
    <small v-if="duplicate" role="status">This key already exists.</small>
  </div>
</template>

<style scoped>
.map {
  display: grid;
  gap: 12px;
}
.entries {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
  color: #d4d4d8;
}
.entries th,
.entries td {
  padding: 10px 12px;
  border-bottom: 1px solid #3f3f46;
  text-align: left;
  vertical-align: middle;
  overflow-wrap: anywhere;
}
.entries thead th {
  color: #a1a1aa;
  font-size: 12px;
  font-weight: 650;
  background: #18181b;
}
.entries .key-column {
  width: 30%;
}
.entries .entry-preview {
  width: 44px;
}
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
.entries .entry-actions {
  width: 60px;
  text-align: right;
}
.entries.registry-keys .entry-actions {
  width: 84px;
}
.action-buttons {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
}
.entry-heading {
  font-weight: 500;
}
.entry {
  border: 1px solid #3f3f46;
  border-radius: 6px;
  overflow: visible;
}
.card-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  overflow-wrap: anywhere;
}
.entry > .inline-value {
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  overflow: visible;
  padding: 12px;
}
.entry-value > .value-form {
  grid-template-columns: minmax(0, 1fr);
  padding: 0;
}
.empty {
  color: #71717a;
}
.entry-key {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
}
.add-entry {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
}
button {
  padding: 8px 12px;
  border: 1px solid #3f3f46;
  border-radius: 6px;
  color: #fafafa;
  background: #18181b;
  cursor: pointer;
}
button:disabled {
  opacity: 0.5;
  cursor: default;
}
.remove-entry {
  display: inline-grid;
  place-items: center;
  width: 36px;
  height: 36px;
  padding: 0;
}
.open-registry-entry {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 1px solid rgba(251, 113, 133, 0.42);
  color: #ffe4e6;
  background: rgba(251, 113, 133, 0.14);
}
.open-registry-entry:hover:not(:disabled),
.open-registry-entry:focus-visible {
  background: rgba(251, 113, 133, 0.24);
}
small {
  color: #fda4af;
}
</style>
