<script setup lang="ts">
import { ref } from 'vue';

withDefaults(
  defineProps<{
    type?: 'button' | 'submit' | 'reset';
    variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'ghost' | 'tab';
    size?: 'small' | 'medium' | 'icon';
    tone?: 'default' | 'warning';
    selectionStyle?: 'filled' | 'text';
    layout?: 'inline' | 'stacked';
  }>(),
  { type: 'button', variant: 'secondary', size: 'medium', tone: 'default', selectionStyle: 'filled', layout: 'inline' },
);

const element = ref<HTMLButtonElement>();
defineExpose({ focus: () => element.value?.focus() });
</script>

<template>
  <button
    ref="element"
    :type="type"
    class="moonlight-button"
    :class="[`variant-${variant}`, `size-${size}`, `tone-${tone}`, `selection-${selectionStyle}`, `layout-${layout}`]"
  >
    <slot />
  </button>
</template>

<style scoped>
.moonlight-button {
  --moonlight-button-highlight: var(--moonlight-accent, #fb7185);
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 12px;
  border: 1px solid var(--moonlight-border, #3f3f46);
  border-radius: 6px;
  color: var(--moonlight-text-strong, #fafafa);
  background: var(--moonlight-surface, #18181b);
  font: inherit;
  cursor: pointer;
}
.moonlight-button.moonlight-item {
  justify-content: flex-start;
}
.variant-primary {
  border-color: var(--moonlight-accent, #fb7185);
  color: var(--moonlight-text-strong, #fafafa);
  background: color-mix(in srgb, var(--moonlight-accent, #fb7185) 14%, transparent);
}
.moonlight-button.layout-stacked {
  flex-direction: column;
  align-items: stretch;
}
.variant-danger {
  border-color: var(--moonlight-danger, #f87171);
  background: color-mix(in srgb, var(--moonlight-danger, #f87171) 14%, transparent);
}
.variant-success {
  border-color: var(--moonlight-success, #4ade80);
  background: color-mix(in srgb, var(--moonlight-success, #4ade80) 14%, transparent);
}
.variant-ghost {
  border-color: transparent;
  background: transparent;
  color: inherit;
}
.size-small {
  padding: 5px 13px;
}
.size-icon {
  padding: 6px;
}
.moonlight-button:hover:not(:disabled) {
  background: var(
    --moonlight-button-hover-background,
    color-mix(in srgb, var(--moonlight-button-highlight) 24%, transparent)
  );
}
.moonlight-button.selection-filled[aria-selected='true'],
.moonlight-button.selection-filled[aria-pressed='true'] {
  background: color-mix(in srgb, var(--moonlight-button-highlight) 14%, transparent);
}
.moonlight-button.variant-ghost.selection-filled[aria-selected='true'],
.moonlight-button.variant-ghost.selection-filled[aria-pressed='true'] {
  background: color-mix(in srgb, var(--moonlight-button-highlight) 6%, transparent);
}
.moonlight-button.variant-ghost:hover:not(:disabled) {
  background: var(
    --moonlight-button-hover-background,
    color-mix(in srgb, var(--moonlight-button-highlight) 6%, transparent)
  );
}
.moonlight-button:not(.variant-ghost, .variant-tab):hover:not(:disabled),
.moonlight-button:not(.variant-ghost, .variant-tab)[aria-selected='true'],
.moonlight-button:not(.variant-ghost, .variant-tab)[aria-pressed='true'] {
  border-color: var(--moonlight-button-highlight);
}
.moonlight-button.tone-warning {
  --moonlight-button-highlight: var(--moonlight-warning, #fbbf24);
  color: var(--moonlight-text-strong, #fafafa);
}
.moonlight-button.tone-warning[aria-selected='true'],
.moonlight-button.tone-warning[aria-pressed='true'] {
  color: var(--moonlight-warning, #fbbf24);
}
.moonlight-button:focus-visible {
  outline: 2px solid var(--moonlight-button-highlight);
  outline-offset: 2px;
}
.moonlight-button:disabled {
  opacity: 0.5;
  cursor: default;
}
.moonlight-button.variant-tab,
.moonlight-button.variant-tab:hover:not(:disabled),
.moonlight-button.variant-tab[aria-selected='true'] {
  border: 0;
  border-bottom: 2px solid transparent;
  border-radius: 0;
  background: transparent;
}
.moonlight-button.variant-tab[aria-selected='true'],
.moonlight-button.variant-tab[aria-selected='true']:hover:not(:disabled) {
  border-bottom-color: var(--moonlight-accent, #fb7185);
}
</style>
