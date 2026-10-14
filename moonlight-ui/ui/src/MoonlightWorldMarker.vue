<script setup lang="ts">
import MoonlightButton from './MoonlightButton.vue';
import GizmoVisual from './GizmoVisual.vue';
defineProps<{ label: string; visual?: string; interactive?: boolean }>();
</script>
<template>
  <MoonlightButton variant="ghost" class="moonlight-world-marker" :class="{ interactive }" :title="label">
    <span class="marker"><GizmoVisual v-if="visual" :identifier="visual" /></span>
    <span class="label">{{ label }}</span>
  </MoonlightButton>
</template>
<style scoped>
.moonlight-world-marker {
  --moonlight-button-hover-background: rgba(0, 0, 0, 0.9);
  position: absolute;
  gap: 5px;
  padding: 3px 6px;
  transform: translate(-19px, -50%);
  border: 0;
  border-radius: 10px;
  color: var(--moonlight-text-strong, #fafafa);
  background: var(--moonlight-surface, #18181b);
  white-space: nowrap;
  pointer-events: none;
}
.interactive {
  pointer-events: auto;
}
.marker {
  position: relative;
  width: 26px;
  height: 26px;
  flex: none;
  border: 2px solid var(--moonlight-text-strong, #fafafa);
  border-radius: 50%;
  background: var(--gizmo-color, var(--moonlight-accent, #fb7185));
  box-shadow: 0 0 0 2px #0008;
  overflow: hidden;
}
.label {
  display: none;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.moonlight-world-marker:hover .label,
.moonlight-world-marker:focus-visible .label {
  display: block;
}
</style>
