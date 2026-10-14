<script setup lang="ts">
import { onMounted, onUnmounted, ref, useId, watch } from 'vue';
import type { DistancePick, SchemaDefinition } from './schema';
import { useSelene } from './selene';
import SchemaForm from './SchemaForm.vue';

const props = defineProps<{
  module: string;
  functionName?: string;
  contents: string;
  registryOptions: Record<string, Array<{ value: string; label: string; visual?: string }>>;
  readonly?: boolean;
}>();
const emit = defineEmits<{
  updateContents: [contents: string];
  searchRegistry: [registry: string, query: string, lookup?: boolean];
  pickCoordinate: [field: string];
  pickDistance: [pick: DistancePick];
}>();
const selene = useSelene();
const id = useId();
let generation = 0;
let requestId = '';
const schema = ref<Record<string, SchemaDefinition>>({});
const message = ref('');
const loading = ref(false);
const disposers: Array<() => void> = [];

function requestSchema(): void {
  requestId = `${id}:${++generation}`;
  schema.value = {};
  message.value = '';
  loading.value = Boolean(props.module);
  if (props.module) {
    selene.network.sendToServer('moonlight-editor:request-scripted-schema', {
      requestId,
      module: props.module,
      functionName: props.functionName ?? 'schema',
    });
  }
}

onMounted(() => {
  disposers.push(
    selene.network.onPayload('moonlight-editor:scripted-schema', (payload) => {
      if (payload.requestId !== requestId) {
        return;
      }
      loading.value = false;
      if (typeof payload.message === 'string') {
        message.value = payload.message;
      } else if (payload.schema && typeof payload.schema === 'object' && !Array.isArray(payload.schema)) {
        schema.value = payload.schema as Record<string, SchemaDefinition>;
      } else {
        message.value = 'Schema provider must return a schema object.';
      }
    }),
  );
  disposers.push(selene.network.onConnected(requestSchema));
  requestSchema();
});
watch(() => [props.module, props.functionName], requestSchema);
onUnmounted(() => disposers.forEach((dispose) => dispose()));
</script>

<template>
  <div class="nested-form">
    <p v-if="loading">Loading script fields…</p>
    <p v-else-if="message" role="alert">{{ message }}</p>
    <p v-else-if="!module">Select a script to edit its fields.</p>
    <SchemaForm
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
