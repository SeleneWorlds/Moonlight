<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue';
import type { DistancePick, SchemaDefinition } from './schema';
import { useSelene } from './selene';
import { fetchScriptSchema } from './scriptSchemas';
import SchemaForm from './SchemaForm.vue';
import BehaviorInput from './BehaviorInput.vue';
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    module: string;
    functionName?: string;
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
const selene = useSelene();
let generation = 0;
const schema = ref<Record<string, SchemaDefinition>>({});
const isBehavior = computed(() => Boolean(schema.value.event && schema.value.conditions && schema.value.actions));
const message = ref('');
const loading = ref(false);
async function requestSchema(): Promise<void> {
  const current = ++generation;
  schema.value = {};
  message.value = '';
  loading.value = Boolean(props.module);
  if (!props.module) return;
  try {
    const result = await fetchScriptSchema(selene.http, props.module, props.functionName);
    if (current !== generation) return;
    schema.value = result;
  } catch (error) {
    if (current === generation) message.value = error instanceof Error ? error.message : String(error);
  } finally {
    if (current === generation) loading.value = false;
  }
}
watch(() => [props.module, props.functionName], requestSchema, { immediate: true });
onUnmounted(() => {
  generation++;
});
</script>

<template>
  <div class="nested-form">
    <p v-if="loading">Loading script fields…</p>
    <p v-else-if="message" role="alert">{{ message }}</p>
    <p v-else-if="!module">Select a script to edit its fields.</p>
    <component
      :is="isBehavior ? BehaviorInput : SchemaForm"
      :allow-references="allowReferences"
      v-else
      :schema="schema"
      :contents="contents"
      :registry-options="registryOptions"
      :readonly="readonly"
      @update-contents="emit('updateContents', $event)"
      @search-registry="(registry, query, lookup) => emit('searchRegistry', registry, query, lookup)"
      @pick-coordinate="emit('pickCoordinate', $event)"
      @pick-distance="emit('pickDistance', $event)"
    />
  </div>
</template>
