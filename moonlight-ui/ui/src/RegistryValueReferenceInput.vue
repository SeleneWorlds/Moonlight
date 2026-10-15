<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Unlink, Link } from '@lucide/vue';
import SchemaForm from './SchemaForm.vue';
import MoonlightButton from './MoonlightButton.vue';
import MoonlightModal from './MoonlightModal.vue';
import { useSelene } from './selene';
import type { SchemaDefinition } from './schema';
import { requestEditorOperation } from './resourceOperations';

const props = defineProps<{
  value: unknown;
  readonly?: boolean;
  registryOptions: Record<string, Array<{ value: string; label: string; visual?: string }>>;
}>();
const emit = defineEmits<{
  updateValue: [value: unknown];
  useInline: [];
  searchRegistry: [registry: string, query: string, lookup?: boolean];
}>();
const selene = useSelene();
const modal = ref<InstanceType<typeof MoonlightModal>>();
const draft = ref<Record<string, unknown>>({});
const reference = computed(() => {
  const object = props.value as Record<string, unknown>;
  const value = object?.$ref;
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
});
const resolvedName = ref('');
const targetName = computed(
  () =>
    props.registryOptions[String(reference.value.registry)]?.find((option) => option.value === reference.value.entry)
      ?.label ||
    resolvedName.value ||
    String(reference.value.entry || 'Not configured'),
);
let lookupGeneration = 0;
watch(
  () => [reference.value.registry, reference.value.entry],
  async ([registry, entry]) => {
    const generation = ++lookupGeneration;
    resolvedName.value = '';
    if (typeof registry !== 'string' || !registry || typeof entry !== 'string' || !entry) {
      return;
    }
    const known = props.registryOptions[registry]?.find((option) => option.value === entry);
    if (known) {
      resolvedName.value = known.label;
      return;
    }
    try {
      const result = (await requestEditorOperation(selene, 'search-registry', {
        registry,
        query: entry,
        lookup: true,
      })) as { options: Array<{ value: string; label: string }> };
      if (generation === lookupGeneration) {
        resolvedName.value = result.options.find((option) => option.value === entry)?.label ?? '';
      }
    } catch {
      // Keep the identifier visible when the target cannot be looked up.
    }
  },
  { immediate: true },
);
const target = computed(() =>
  [reference.value.registry, reference.value.entry, reference.value.path].filter(Boolean).join(' · '),
);
const schema = computed<Record<string, SchemaDefinition>>(() => ({
  registry: 'string',
  entry:
    typeof draft.value.registry === 'string' && draft.value.registry
      ? { type: 'registry', registry: draft.value.registry }
      : 'string',
  path: { type: 'string', optional: true },
}));
const message = computed(() => {
  if (
    typeof draft.value.registry !== 'string' ||
    !draft.value.registry.trim() ||
    typeof draft.value.entry !== 'string' ||
    !draft.value.entry.trim()
  ) {
    return 'Choose a registry and entry.';
  }
  const path = draft.value.path;
  if (
    path !== undefined &&
    (typeof path !== 'string' || (path !== '' && !path.startsWith('/')) || /~(?![01])/.test(path))
  ) {
    return 'Use a JSON Pointer, such as /positions/door, or leave it empty for the whole entry.';
  }
  return '';
});
function update(contents: string): void {
  draft.value = JSON.parse(contents);
}
function configure(): void {
  draft.value = JSON.parse(JSON.stringify(reference.value));
  modal.value?.showModal();
}
function save(event: Event): void {
  event.stopPropagation();
  if (props.readonly || message.value) {
    return;
  }
  emit('updateValue', { $ref: draft.value });
  modal.value?.close();
}
function useInline(): void {
  modal.value?.close();
  emit('useInline');
}
</script>

<template>
  <div class="value-reference">
    <MoonlightButton
      type="button"
      size="icon"
      :aria-label="readonly ? 'View reference' : 'Configure reference'"
      :title="readonly ? 'View reference' : 'Configure reference'"
      @click="configure"
    >
      <Link :size="16" aria-hidden="true" />
    </MoonlightButton>
    <span class="reference-summary" :title="target"
      >{{ targetName
      }}<template v-if="reference.path"
        >: <code>{{ reference.path }}</code></template
      ></span
    >
    <MoonlightModal ref="modal" title="Field Reference" @submit="save">
      <template v-if="!readonly" #headerActions>
        <MoonlightButton type="button" @click="useInline"
          ><Unlink :size="18" aria-hidden="true" />Unlink</MoonlightButton
        >
      </template>
      <SchemaForm
        :schema="schema"
        :contents="JSON.stringify(draft)"
        :registry-options="registryOptions"
        :readonly="readonly"
        :allow-references="false"
        @update-contents="update"
        @search-registry="(registry, query, lookup) => emit('searchRegistry', registry, query, lookup)"
      />
      <p v-if="message" role="alert">{{ message }}</p>
      <template #actions>
        <MoonlightButton type="button" @click="modal?.close()">{{ readonly ? 'Close' : 'Cancel' }}</MoonlightButton>
        <MoonlightButton v-if="!readonly" type="submit" :disabled="!!message">Save</MoonlightButton>
      </template>
    </MoonlightModal>
  </div>
</template>

<style scoped>
.value-reference {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.reference-summary {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--moonlight-text-muted, #a1a1aa);
}
.reference-summary code {
  color: var(--moonlight-text, #e4e4e7);
}
.value-reference > button {
  flex-shrink: 0;
}
p {
  color: #f87171;
}
</style>
