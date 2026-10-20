<script setup lang="ts">
import MoonlightButton from './MoonlightButton.vue';
import { computed, reactive, ref, watch } from 'vue';
import { Trash2 } from '@lucide/vue';
import SchemaForm from './SchemaForm.vue';
import RegistryVisual from './RegistryVisual.vue';
import { resolveSchemaField, defaultSchemaValue, type SchemaDefinition, type DistancePick } from './schema';
type Obj = Record<string, unknown>;
const props = withDefaults(
  defineProps<{
    schema: Record<string, SchemaDefinition>;
    contents: string;
    registryOptions: Record<string, Array<{ value: string; label: string; visual?: string }>>;
    readonly?: boolean;
    allowReferences?: boolean;
  }>(),
  { allowReferences: true },
);
const emit = defineEmits<{
  updateContents: [contents: string];
  searchRegistry: [registry: string, query: string, lookup?: boolean];
  pickCoordinate: [field: string];
  pickDistance: [pick: DistancePick];
}>();
const value = computed<Obj>(() => JSON.parse(props.contents));
const pools = computed<Obj[]>(() => (Array.isArray(value.value.pools) ? value.value.pools : []));
const selection = ref<{ pool: number; entry: number } | null>(null);
const settingsTarget = ref<'rolls' | number | null>(null);
const modal = ref<HTMLDialogElement | null>(null);
function closeModal(): void {
  modal.value?.close();
  selection.value = null;
  settingsTarget.value = null;
}
watch(
  [selection, settingsTarget],
  () => {
    if (selection.value !== null || settingsTarget.value !== null) {
      if (!modal.value?.open) {
        modal.value?.showModal();
      }
    } else {
      modal.value?.close();
    }
  },
  { flush: 'post' },
);
function pickCoordinate(field: string): void {
  closeModal();
  emit('pickCoordinate', field);
}
function pickDistance(pick: DistancePick): void {
  closeModal();
  emit('pickDistance', pick);
}
function properties(d?: SchemaDefinition): Record<string, SchemaDefinition> {
  return typeof d === 'object' ? (d.properties ?? {}) : {};
}
function element(d?: SchemaDefinition): SchemaDefinition {
  return typeof d === 'object' ? (d.valueType ?? 'any') : 'any';
}
const poolSchema = computed(() => properties(element(props.schema.pools)));
const entrySchema = computed(() => properties(element(poolSchema.value.entries)));
function entries(pool: Obj): Obj[] {
  return Array.isArray(pool.entries) ? pool.entries : [];
}
const selected = computed(() =>
  selection.value ? entries(pools.value[selection.value.pool] ?? {})[selection.value.entry] : undefined,
);
function save(next: Obj): void {
  if (!props.readonly) {
    emit('updateContents', JSON.stringify(next));
  }
}
function updatePool(index: number, pool: Obj): void {
  save({
    ...value.value,
    pools: pools.value.map((p, i) => (i === index ? pool : p)),
  });
}
function updateEntry(contents: string): void {
  if (!selection.value) {
    return;
  }
  const { pool, entry } = selection.value;
  const p = pools.value[pool]!;
  updatePool(pool, {
    ...p,
    entries: entries(p).map((e, i) => (i === entry ? JSON.parse(contents) : e)),
  });
}
function addEntry(pool: number): void {
  const p = pools.value[pool]!;
  updatePool(pool, {
    ...p,
    entries: [
      ...entries(p),
      {
        type: defaultSchemaValue(entrySchema.value.type ?? 'string'),
        weight: 1,
      },
    ],
  });
  selection.value = { pool, entry: entries(p).length };
}
function removeEntry(): void {
  if (!selection.value) {
    return;
  }
  const { pool, entry } = selection.value;
  const p = pools.value[pool]!;
  updatePool(pool, { ...p, entries: entries(p).filter((_, i) => i !== entry) });
  selection.value = null;
}
function title(e: Obj): string {
  if (typeof e.label === 'string' && e.label) {
    return e.label;
  }
  const d = entrySchema.value.type;
  const name = typeof d === 'object' ? d.values?.find((v) => v.value === e.type)?.label : undefined;
  const data = e.data;
  const detail =
    data && typeof data === 'object'
      ? Object.values(data)
          .filter((v) => typeof v === 'string')
          .join(' · ')
      : typeof data === 'string'
        ? data
        : '';
  return [name ?? e.type ?? 'Entry', detail].filter(Boolean).join(' · ');
}
// Follow the registered payload schema, including nested and selected variants.
function registryReferences(definition: SchemaDefinition, data: unknown): Array<{ registry: string; value: string }> {
  if (typeof definition === 'string') {
    return [];
  }
  if (definition.type === 'registry' && definition.registry && typeof data === 'string' && data) {
    return [{ registry: definition.registry, value: data }];
  }
  if (definition.type === 'object' && data && typeof data === 'object' && !Array.isArray(data)) {
    const object = data as Obj;
    return Object.entries(definition.properties ?? {}).flatMap(([key, field]) =>
      registryReferences(resolveSchemaField(field, object), object[key]),
    );
  }
  if (definition.type === 'array' && definition.valueType && Array.isArray(data)) {
    return data.flatMap((item) => registryReferences(definition.valueType!, item));
  }
  return [];
}
const references = computed(() =>
  pools.value.flatMap((pool) =>
    entries(pool).flatMap((entry) => registryReferences({ type: 'object', properties: entrySchema.value }, entry)),
  ),
);
const visuals = reactive<Record<string, Record<string, string>>>({});
const requested = new Set<string>();
watch(
  [references, () => props.registryOptions],
  () => {
    for (const [registry, options] of Object.entries(props.registryOptions)) {
      for (const option of options) {
        if (option.visual) {
          (visuals[registry] ??= {})[option.value] = option.visual;
        }
      }
    }
    for (const reference of references.value) {
      const key = JSON.stringify([reference.registry, reference.value]);
      if (!visuals[reference.registry]?.[reference.value] && !requested.has(key)) {
        requested.add(key);
        emit('searchRegistry', reference.registry, reference.value, true);
      }
    }
  },
  { immediate: true },
);
function entryVisual(entry: Obj): string | undefined {
  for (const reference of registryReferences({ type: 'object', properties: entrySchema.value }, entry)) {
    const visual = visuals[reference.registry]?.[reference.value];
    if (visual) {
      return visual;
    }
  }
  return undefined;
}
function weight(e: Obj): number {
  return typeof e.weight === 'number' ? e.weight : 1;
}
function sortedEntries(pool: Obj): Array<{ entry: Obj; index: number }> {
  return entries(pool)
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => weight(b.entry) - weight(a.entry) || a.index - b.index);
}
function chance(p: Obj, e: Obj): string {
  const total = entries(p).reduce((sum, item) => sum + weight(item), 0);
  return total > 0 ? `${Number(((weight(e) / total) * 100).toFixed(1))}%` : '—';
}
function path(field: string): string {
  return selection.value ? `pools.${selection.value.pool}.entries.${selection.value.entry}.${field}` : field;
}
function poolName(pool: Obj, index: number): string {
  return typeof pool.name === 'string' && pool.name.trim() ? pool.name : `Pool ${index + 1}`;
}
function count(p: Obj): string {
  const n = Array.isArray(p.conditions) ? p.conditions.length : 0;
  return n ? `${n} conditions` : 'No conditions';
}
function settings(schema: Record<string, SchemaDefinition>, exclude: string): Record<string, SchemaDefinition> {
  return Object.fromEntries(Object.entries(schema).filter(([key]) => key !== exclude));
}
</script>
<template>
  <div class="rolls-editor">
    <div class="settings">
      <span>{{ count(value) }}</span>
      <MoonlightButton type="button" aria-label="Roll conditions and settings" @click="settingsTarget = 'rolls'"
        >•••</MoonlightButton
      >
    </div>
    <details v-for="(pool, index) in pools" :key="index" class="pool" :open="index === 0">
      <summary>
        <strong>{{ poolName(pool, index) }}</strong
        ><small>{{ pool.rolls ?? 1 }} roll(s)</small><span>{{ entries(pool).length }} entries</span>
      </summary>
      <div class="settings">
        <span>{{ count(pool) }}</span>
        <MoonlightButton
          type="button"
          :aria-label="`${poolName(pool, index)} settings`"
          @click="settingsTarget = index"
        >
          •••
        </MoonlightButton>
      </div>
      <div class="row headings">
        <span>Entry</span><span>Weight</span><span title="Chance before conditions are evaluated">Chance</span><span />
      </div>
      <MoonlightButton
        v-for="{ entry, index: entryIndex } in sortedEntries(pool)"
        :key="entryIndex"
        type="button"
        class="row entry"
        @click="selection = { pool: index, entry: entryIndex }"
      >
        <span class="entry-label"
          ><RegistryVisual v-if="entryVisual(entry)" :identifier="entryVisual(entry)!" /><span>{{
            title(entry)
          }}</span></span
        ><span>{{ weight(entry) }}</span
        ><span>{{ chance(pool, entry) }}</span
        ><span>›</span>
      </MoonlightButton>
      <MoonlightButton v-if="!readonly" type="button" class="add" @click="addEntry(index)"
        >＋ Add entry</MoonlightButton
      >
    </details>
    <MoonlightButton
      v-if="!readonly"
      type="button"
      class="add"
      @click="save({ ...value, pools: [...pools, { rolls: 1, entries: [] }] })"
    >
      ＋ Add pool
    </MoonlightButton>
    <dialog
      ref="modal"
      class="rolls-modal"
      aria-label="Roll editor"
      @cancel.prevent="closeModal"
      @close="closeModal"
      @click="$event.target === modal && closeModal()"
    >
      <div class="modal-body">
        <header class="modal-header">
          <strong v-if="selected && selection">Edit entry</strong>
          <strong v-else-if="settingsTarget === 'rolls'">Roll conditions and settings</strong>
          <strong v-else-if="typeof settingsTarget === 'number' && pools[settingsTarget]">
            {{ poolName(pools[settingsTarget]!, settingsTarget) }} settings
          </strong>
          <MoonlightButton
            variant="ghost"
            type="button"
            class="close-modal"
            aria-label="Close editor"
            @click="closeModal"
            >✕</MoonlightButton
          >
        </header>
        <section v-if="selected && selection">
          <SchemaForm
            :allow-references="allowReferences"
            class="detail"
            :schema="entrySchema"
            :contents="JSON.stringify(selected)"
            :registry-options="registryOptions"
            :readonly="readonly"
            :field-labels="{ type: 'Outcome type' }"
            :expanded-fields="['data']"
            @update-contents="updateEntry"
            @search-registry="(registry, query, lookup) => emit('searchRegistry', registry, query, lookup)"
            @pick-coordinate="pickCoordinate(path($event))"
            @pick-distance="pickDistance({ ...$event, field: path($event.field) })"
          />
          <footer v-if="!readonly" class="delete-actions">
            <MoonlightButton type="button" aria-label="Delete entry" title="Delete entry" @click="removeEntry">
              <Trash2 :size="18" aria-hidden="true" />
            </MoonlightButton>
          </footer>
        </section>

        <section v-else-if="settingsTarget === 'rolls'">
          <SchemaForm
            :allow-references="allowReferences"
            class="detail"
            :schema="settings(schema, 'pools')"
            :contents="contents"
            :registry-options="registryOptions"
            :readonly="readonly"
            @update-contents="save(JSON.parse($event))"
            @search-registry="(registry, query, lookup) => emit('searchRegistry', registry, query, lookup)"
            @pick-coordinate="pickCoordinate($event)"
            @pick-distance="pickDistance($event)"
          />
        </section>
        <section v-else-if="typeof settingsTarget === 'number' && pools[settingsTarget]">
          <SchemaForm
            :allow-references="allowReferences"
            class="detail"
            :schema="settings(poolSchema, 'entries')"
            :contents="JSON.stringify(pools[settingsTarget])"
            :registry-options="registryOptions"
            :readonly="readonly"
            @update-contents="updatePool(settingsTarget, JSON.parse($event))"
            @search-registry="(registry, query, lookup) => emit('searchRegistry', registry, query, lookup)"
            @pick-coordinate="pickCoordinate(`pools.${settingsTarget}.${$event}`)"
            @pick-distance="
              pickDistance({
                ...$event,
                field: `pools.${settingsTarget}.${$event.field}`,
              })
            "
          />
          <footer v-if="!readonly" class="delete-actions">
            <MoonlightButton
              type="button"
              aria-label="Delete pool"
              title="Delete pool"
              @click="
                save({
                  ...value,
                  pools: pools.filter((_, i) => i !== settingsTarget),
                });
                closeModal();
              "
            >
              <Trash2 :size="18" aria-hidden="true" />
            </MoonlightButton>
          </footer>
        </section>
      </div>
    </dialog>
  </div>
</template>
<style scoped>
.rolls-editor {
  border: 1px solid var(--moonlight-border, #3f3f46);
  border-radius: 10px;
  padding: 14px;
  min-width: 0;
}
header,
summary {
  display: flex;
  align-items: center;
  gap: 10px;
}
header small,
.pool > summary > span {
  margin-left: auto;
}
small {
  border-radius: 20px;
  background: var(--moonlight-surface-raised, #27272a);
  padding: 3px 8px;
  color: #d4d4d8;
}
button {
  padding: 7px 10px;
}

.pool {
  border-top: 1px solid var(--moonlight-surface-raised, #27272a);
  margin-top: 12px;
  padding-top: 12px;
}
summary {
  cursor: pointer;
  padding: 5px 0;
}
.pool > summary::before {
  content: '▸';
}
.pool[open] > summary::before {
  content: '▾';
}
.settings {
  display: flex;
  align-items: center;
  gap: 10px;
  justify-content: flex-end;
  color: var(--moonlight-text-muted, #a1a1aa);
  font-size: 12px;
  list-style: none;
}
summary::-webkit-details-marker {
  display: none;
}
.row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 65px 65px 12px;
  gap: 8px;
  align-items: center;
  width: 100%;
  box-sizing: border-box;
  padding: 10px;
}
.row > span:first-child {
  text-align: left;
  overflow-wrap: anywhere;
}
.row > span {
  text-align: right;
}
.headings {
  color: var(--moonlight-text-muted, #a1a1aa);
  font-size: 11px;
  text-transform: uppercase;
}
.entry-label {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.entry {
  border: 0;
}
.add {
  width: 100%;
  margin-top: 10px;
  border-radius: 20px;
}
.detail {
  grid-template-columns: 1fr;
  padding: 16px 0 0;
}
.delete-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
.delete-actions button {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px;
}
</style>

<style scoped>
.rolls-modal {
  box-sizing: border-box;
  width: min(680px, calc(100vw - 32px));
  max-height: calc(100vh - 48px);
  overflow: auto;
  padding: 20px;
  border: 1px solid var(--moonlight-border, #3f3f46);
  border-radius: 12px;
  color: var(--moonlight-text, #e4e4e7);
  background: var(--moonlight-background, #09090b);
  box-shadow: 0 20px 80px #000a;
}
.rolls-modal::backdrop {
  background: #0009;
}
.modal-body {
  position: relative;
}
.modal-header {
  justify-content: space-between;
}
.close-modal {
  margin-left: auto;
}
</style>
