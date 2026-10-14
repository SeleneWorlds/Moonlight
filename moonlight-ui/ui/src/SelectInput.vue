<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, useId, watch } from 'vue';
import { Check, ChevronDown } from '@lucide/vue';

const props = defineProps<{
  options: string[];
  label: string;
  optionLabels?: Record<string, string>;
  disabled?: boolean;
  appearance?: 'form' | 'compact';
}>();
const value = defineModel<string>({ required: true });
const emit = defineEmits<{ change: [] }>();
const id = useId();
const root = ref<HTMLElement>();
const input = ref<HTMLInputElement>();
const popup = ref<HTMLElement>();
const open = ref(false);
const active = ref(-1);
const query = ref('');
const filteredOptions = computed(() =>
  props.options.filter((option) => optionLabel(option).toLowerCase().includes(query.value.trim().toLowerCase())),
);

function optionLabel(option: string): string {
  return props.optionLabels?.[option] ?? option;
}

function close(): void {
  open.value = false;
  query.value = '';
}

function show(): void {
  if (props.disabled || open.value || !props.options.length) {
    return;
  }
  active.value = Math.max(0, props.options.indexOf(value.value));
  open.value = true;
}

function search(event: Event): void {
  query.value = (event.target as HTMLInputElement).value;
  open.value = true;
  active.value = filteredOptions.value.length ? 0 : -1;
}

function select(option: string): void {
  close();
  if (value.value !== option) {
    value.value = option;
    emit('change');
  }
}

function keydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && open.value) {
    event.preventDefault();
    event.stopPropagation();
    close();
  } else if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
    event.preventDefault();
    if (!open.value) {
      show();
    } else if (filteredOptions.value.length) {
      active.value =
        (active.value + (event.key === 'ArrowDown' ? 1 : -1) + filteredOptions.value.length) %
        filteredOptions.value.length;
    }
  } else if (event.key === 'Enter' && open.value) {
    event.preventDefault();
    const option = filteredOptions.value[active.value];
    if (option !== undefined) {
      select(option);
    }
  }
}

function closeOutside(event: PointerEvent): void {
  if (!root.value?.contains(event.target as Node)) {
    close();
  }
}

watch(() => [props.options, value.value], close);
watch([active, open, filteredOptions], async () => {
  await nextTick();
  popup.value?.children[active.value]?.scrollIntoView({ block: 'nearest' });
});
onMounted(() => document.addEventListener('pointerdown', closeOutside));
onUnmounted(() => document.removeEventListener('pointerdown', closeOutside));
</script>

<template>
  <!-- Stop internal events from being retargeted to the closed editor shadow host. -->
  <div ref="root" class="select-input" @pointerdown.stop>
    <div
      class="trigger moonlight-input"
      @click="input?.focus()"
      :class="{
        open,
        disabled: disabled || !options.length,
        form: appearance === 'form',
      }"
    >
      <input
        ref="input"
        type="text"
        role="combobox"
        autocomplete="off"
        spellcheck="false"
        aria-autocomplete="list"
        :value="open ? query : optionLabel(value)"
        :placeholder="`Search ${label.toLowerCase()}…`"
        aria-haspopup="listbox"
        :aria-label="label"
        :aria-expanded="open"
        :aria-controls="id"
        :aria-activedescendant="open && active >= 0 ? `${id}-${active}` : undefined"
        :disabled="disabled || !options.length"
        @focus="show"
        @click="show"
        @input="search"
        @blur="close"
        @keydown="keydown"
      />
      <ChevronDown :size="14" aria-hidden="true" />
    </div>
    <div v-if="open" :id="id" ref="popup" class="options moonlight-popup ml-popover" role="listbox" :aria-label="label">
      <div
        class="moonlight-item"
        v-for="(option, index) in filteredOptions"
        :id="`${id}-${index}`"
        :key="option"
        role="option"
        :aria-selected="value === option"
        :class="{ active: active === index }"
        @pointerdown.prevent
        @pointermove="active = index"
        @click.prevent="select(option)"
      >
        <span>{{ optionLabel(option) }}</span>
        <Check v-if="value === option" :size="14" aria-hidden="true" />
      </div>
    </div>
    <div v-if="open && !filteredOptions.length" class="empty moonlight-popup ml-popover" role="status">
      No matching {{ label.toLowerCase() }} options.
    </div>
  </div>
</template>

<style scoped>
.select-input {
  position: relative;
  min-width: 0;
  text-transform: none;
  letter-spacing: normal;
}
.trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  box-sizing: border-box;
  width: 100%;
  padding: 6px 8px;
  text-align: left;
  cursor: pointer;
}
.trigger.form {
  padding: 8px 9px;
}
.trigger input {
  flex: 1;
  min-width: 0;
  width: 100%;
  padding: 0;
  border: 0;
  outline: none;
  color: inherit;
  background: transparent;
  font: inherit;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
svg {
  flex-shrink: 0;
}
.trigger svg {
  pointer-events: none;
}
.trigger:focus-within,
.trigger.open {
  outline: none;
  border-color: var(--moonlight-accent, #fb7185);
  box-shadow: 0 0 0 3px rgba(251, 113, 133, 0.14);
}
.trigger.disabled {
  opacity: 0.6;
  cursor: default;
}

.empty {
  padding: 12px;
  color: var(--moonlight-text-muted, #a1a1aa);
}
[role='option'] {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-radius: 5px;
  color: var(--moonlight-text, #e4e4e7);
  cursor: pointer;
}
[role='option'] span {
  flex: 1;
  overflow-wrap: anywhere;
  min-width: 0;
}
[role='option'].active,
[aria-selected='true'] {
  background: rgba(251, 113, 133, 0.14);
}
</style>
