<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  readonly?: boolean;
  value?: number;
  minimum: number;
  maximum: number;
  step?: number;
  label: string;
  required?: boolean;
}>();
const emit = defineEmits<{ update: [value: number] }>();
const boundedValue = computed(() => Math.max(props.minimum, Math.min(props.maximum, props.value ?? props.minimum)));
function update(event: Event): void {
  if (props.readonly) return;
  const input = event.target as HTMLInputElement;
  if (input.value === '' || !Number.isFinite(input.valueAsNumber)) return;
  const step = props.step ?? 1;
  emit(
    'update',
    Math.max(
      props.minimum,
      Math.min(props.maximum, props.minimum + Math.round((input.valueAsNumber - props.minimum) / step) * step),
    ),
  );
}
</script>

<template>
  <div class="slider-control">
    <div class="slider">
      <input
        type="range"
        :disabled="readonly"
        :min="minimum"
        :max="maximum"
        :step="step ?? 1"
        :value="boundedValue"
        :aria-label="label"
        @input="update"
      />
      <div class="bounds">
        <span>{{ minimum }}</span
        ><span>{{ maximum }}</span>
      </div>
    </div>
    <input
      class="moonlight-input number"
      type="number"
      :readonly="readonly"
      :min="minimum"
      :max="maximum"
      :step="step ?? 1"
      :value="value"
      :required="required"
      :aria-label="`${label} value`"
      @change="update"
    />
  </div>
</template>

<style scoped>
.slider-control {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.slider {
  flex: 1;
  min-width: 0;
}
.slider input {
  width: 100%;
  margin: 0;
  accent-color: var(--moonlight-accent, #fb7185);
}
.bounds {
  display: flex;
  justify-content: space-between;
  color: var(--moonlight-text-muted, #a1a1aa);
  font-size: 11px;
}
.number {
  width: 88px;
  min-width: 0;
}
</style>
