<script setup lang="ts">
import { computed } from 'vue';
import SchemaForm from './SchemaForm.vue';
import MoonlightButton from './MoonlightButton.vue';
import { defaultSchemaValue, type DistancePick, type SchemaDefinition } from './schema';
const props = defineProps<{
  schema: Record<string, SchemaDefinition>;
  contents: string;
  registryOptions: Record<string, Array<{ value: string; label: string; visual?: string }>>;
  readonly?: boolean;
  allowReferences?: boolean;
}>();
const emit = defineEmits<{
  updateContents: [contents: string];
  searchRegistry: [registry: string, query: string, lookup?: boolean];
  pickCoordinate: [field: string];
  pickDistance: [pick: DistancePick];
}>();
const value = computed<Record<string, unknown>>(() => JSON.parse(props.contents));
const sections = [
  { key: 'event', title: 'Event trigger' },
  { key: 'conditions', title: 'Conditions' },
  { key: 'actions', title: 'Actions' },
];
function entries(key: string): unknown[] {
  return Array.isArray(value.value[key]) ? (value.value[key] as unknown[]) : [];
}
function itemSchema(key: string): SchemaDefinition {
  const schema = props.schema[key];
  return typeof schema === 'object' ? (schema.valueType ?? 'any') : 'any';
}
function save(key: string, next: unknown): void {
  if (!props.readonly) emit('updateContents', JSON.stringify({ ...value.value, [key]: next }));
}
function add(key: string): void {
  const schema = itemSchema(key);
  const next = defaultSchemaValue(schema);
  if (typeof schema === 'object' && schema.properties && next && typeof next === 'object') {
    for (const [name, definition] of Object.entries(schema.properties)) {
      if (typeof definition === 'string' || !definition.optional)
        (next as Record<string, unknown>)[name] = defaultSchemaValue(definition);
    }
  }
  save(key, [...entries(key), next]);
}
function move(key: string, index: number, offset: number): void {
  const next = [...entries(key)];
  [next[index], next[index + offset]] = [next[index + offset], next[index]];
  save(key, next);
}
function title(item: unknown, key: string): string {
  const kind = item && typeof item === 'object' ? (item as Record<string, unknown>).type : undefined;
  const schema = itemSchema(key);
  const type = typeof schema === 'object' ? schema.properties?.type : undefined;
  const label = typeof type === 'object' ? type.values?.find((option) => option.value === kind)?.label : undefined;
  return String(label ?? kind ?? 'Choose type')
    .replace(/[_-]/g, ' ')
    .replace(/^./, (letter) => letter.toUpperCase());
}
function summary(item: unknown): string {
  const data = item && typeof item === 'object' ? (item as Record<string, unknown>).data : undefined;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data == null ? '' : JSON.stringify(data);
  return Object.entries(data)
    .slice(0, 3)
    .map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`)
    .join(' · ');
}
function path(key: string, index: number, field: string): string {
  return `${key}.${index}${field === 'value' ? '' : field.slice(5)}`;
}
</script>

<template>
  <div class="behavior-editor">
    <section v-for="section in sections" :key="section.key" :class="section.key">
      <div class="section-heading">{{ section.title }}</div>
      <SchemaForm
        v-if="section.key === 'event' || (!Array.isArray(value[section.key]) && value[section.key] != null)"
        :schema="{ [section.key]: schema[section.key]! }"
        :contents="contents"
        :registry-options="registryOptions"
        :readonly="readonly"
        :allow-references="allowReferences"
        hide-field-labels
        @update-contents="emit('updateContents', $event)"
        @search-registry="(registry, query, lookup) => emit('searchRegistry', registry, query, lookup)"
        @pick-coordinate="emit('pickCoordinate', $event)"
        @pick-distance="emit('pickDistance', $event)"
      />
      <template v-else>
        <div v-for="(item, index) in entries(section.key)" :key="index" class="card">
          <details>
            <summary>
              <span class="description"
                ><strong>{{ title(item, section.key) }}</strong
                ><small>{{ summary(item) }}</small></span
              >
            </summary>
            <SchemaForm
              :schema="{ value: itemSchema(section.key) }"
              :contents="JSON.stringify({ value: item })"
              :registry-options="registryOptions"
              :readonly="readonly"
              :allow-references="allowReferences"
              :expanded-fields="['value']"
              hide-field-labels
              @update-contents="
                save(
                  section.key,
                  entries(section.key).map((entry, current) => (current === index ? JSON.parse($event).value : entry)),
                )
              "
              @search-registry="(registry, query, lookup) => emit('searchRegistry', registry, query, lookup)"
              @pick-coordinate="emit('pickCoordinate', path(section.key, index, $event))"
              @pick-distance="emit('pickDistance', { ...$event, field: path(section.key, index, $event.field) })"
            />
          </details>
          <div v-if="!readonly" class="tools">
            <MoonlightButton
              type="button"
              variant="ghost"
              :disabled="index === 0"
              aria-label="Move up"
              @click="move(section.key, index, -1)"
              >↑</MoonlightButton
            >
            <MoonlightButton
              type="button"
              variant="ghost"
              :disabled="index === entries(section.key).length - 1"
              aria-label="Move down"
              @click="move(section.key, index, 1)"
              >↓</MoonlightButton
            >
            <MoonlightButton
              type="button"
              variant="ghost"
              aria-label="Remove"
              @click="
                save(
                  section.key,
                  entries(section.key).filter((_, current) => current !== index),
                )
              "
              >×</MoonlightButton
            >
          </div>
        </div>
        <p v-if="!entries(section.key).length" class="empty">
          {{ section.key === 'conditions' ? 'Always runs' : 'No actions yet' }}
        </p>
        <MoonlightButton v-if="!readonly" class="add" type="button" @click="add(section.key)"
          >+ Add {{ section.key === 'actions' ? 'action' : 'condition' }}</MoonlightButton
        >
      </template>
    </section>
  </div>
</template>

<style scoped>
.behavior-editor,
section {
  display: grid;
  gap: 10px;
  min-width: 0;
}
.behavior-editor {
  gap: 20px;
}
.section-heading {
  font-size: inherit;
}
.card {
  position: relative;
  border: 1px solid var(--moonlight-border, #3f3f46);
  border-radius: 12px;
  overflow: hidden;
}
summary {
  padding: 16px 105px 16px 12px;
  cursor: pointer;
}
.description {
  display: inline-grid;
  gap: 5px;
  min-width: 0;
}
.description strong {
  font-weight: 500;
}
.description small {
  color: var(--moonlight-text-muted, #a1a1aa);
  overflow-wrap: anywhere;
}
.tools {
  position: absolute;
  top: 12px;
  right: 8px;
  display: flex;
  gap: 2px;
}
details > .schema-form {
  padding: 12px;
  border-top: 1px solid var(--moonlight-border, #3f3f46);
}
.add {
  width: 100%;
  border-radius: 20px;
  justify-content: center;
}
.empty {
  margin: 4px 0;
  color: var(--moonlight-text-muted, #a1a1aa);
  font-size: 12px;
}
</style>
