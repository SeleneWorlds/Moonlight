<script setup lang="ts">
defineProps<{ points: string; center: { x: number; y: number }; layer?: 'world' | 'overlay' }>();
</script>
<template>
  <svg class="moonlight-world-preview" :class="{ 'world-layer': layer === 'world' }" aria-hidden="true">
    <polygon :points="points" />
    <circle :cx="center.x" :cy="center.y" r="4" />
  </svg>
</template>
<style scoped>
.moonlight-world-preview {
  position: fixed;
  z-index: 910;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.world-layer {
  z-index: 699;
}
polygon {
  fill: var(--moonlight-accent-soft, #fb718530);
  stroke: var(--moonlight-accent, #fb7185);
  stroke-width: 2;
}
circle {
  fill: var(--moonlight-text-strong, #fafafa);
  stroke: var(--moonlight-accent, #fb7185);
  stroke-width: 2;
}
</style>
