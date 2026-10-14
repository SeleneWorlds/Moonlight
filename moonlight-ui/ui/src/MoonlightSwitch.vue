<script setup lang="ts">
import MoonlightButton from './MoonlightButton.vue';
defineProps<{ checked: boolean; disabled?: boolean }>();
</script>
<template>
  <MoonlightButton variant="ghost" role="switch" :aria-checked="checked" :disabled="disabled" class="moonlight-switch">
    <span class="track" aria-hidden="true"><span class="thumb" /></span><slot />
  </MoonlightButton>
</template>
<style scoped>
.moonlight-switch {
  gap: 8px;
  padding: 2px;
  border: 0;
  background: transparent;
}
.track {
  display: block;
  flex: none;
  width: 32px;
  height: 18px;
  padding: 2px;
  border-radius: 999px;
  background: var(--moonlight-border, #3f3f46);
}
.thumb {
  display: block;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--moonlight-text-strong, #fafafa);
  transition: transform 120ms ease;
}
[aria-checked='true'] .track {
  background: var(--moonlight-accent, #fb7185);
}
[aria-checked='true'] .thumb {
  transform: translateX(14px);
}
@media (prefers-reduced-motion: reduce) {
  .thumb {
    transition: none;
  }
}
</style>
