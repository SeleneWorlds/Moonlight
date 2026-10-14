<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useSelene } from './selene';
import { requestEditorOperation } from './resourceOperations';
import SelectInput from './SelectInput.vue';

const props = defineProps<{
  registry?: string;
  entry: unknown;
  property?: string;
  modelValue: unknown;
  label: string;
  readonly?: boolean;
  optional?: boolean;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: unknown] }>();
const selene = useSelene();
const options = ref<Array<{ value: unknown; label: string }>>([]);
const message = ref('');
const loading = ref(false);
let generation = 0;
const selectedIndex = computed(() => options.value.findIndex((option) => option.value === props.modelValue));

watch(
  () => [props.registry, props.entry, props.property],
  async () => {
    const current = ++generation;
    options.value = [];
    message.value = '';
    loading.value = false;
    if (!props.registry || !props.property) {
      message.value = 'Invalid registry field reference schema.';
      return;
    }
    if (typeof props.entry !== 'string' || !props.entry) {
      message.value = 'Select the referenced registry entry first.';
      return;
    }
    loading.value = true;
    try {
      const result = (await requestEditorOperation(selene, 'registry-field-options', {
        registry: props.registry,
        value: props.entry,
        property: props.property,
      })) as { options: Array<{ value: unknown; label: string }> };
      if (current !== generation) {
        return;
      }
      options.value = result.options;
      if (!options.value.length) {
        message.value = 'The referenced field has no entries.';
      }
    } catch (error) {
      if (current === generation) {
        message.value = error instanceof Error ? error.message : String(error);
      }
    } finally {
      if (current === generation) {
        loading.value = false;
      }
    }
  },
  { immediate: true },
);
</script>

<template>
  <div>
    <SelectInput
      appearance="form"
      :label="label"
      :disabled="readonly || loading || !options.length"
      :model-value="modelValue === undefined ? '-1' : String(selectedIndex < 0 ? -2 : selectedIndex)"
      :options="[...(optional ? ['-1'] : []), ...options.map((_, index) => String(index))]"
      :option-labels="
        Object.fromEntries([
          ['-1', 'None'],
          ['-2', loading || message ? String(modelValue) : `${String(modelValue)} (invalid reference)`],
          ...options.map((option, index) => [String(index), option.label]),
        ])
      "
      @update:model-value="emit('update:modelValue', options[Number($event)]?.value)"
    />
    <p v-if="loading">Loading entries…</p>
    <p v-else-if="message" role="alert">{{ message }}</p>
    <p v-else-if="modelValue !== undefined && !options.some((option) => option.value === modelValue)" role="alert">
      This value is not in the referenced field.
    </p>
  </div>
</template>
