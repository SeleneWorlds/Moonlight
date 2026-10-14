<script setup lang="ts">
import { shallowRef } from 'vue';
const element = shallowRef<HTMLElement>();
defineExpose({ element });
withDefaults(defineProps<{ as?: string; variant?: 'panel' | 'card' | 'popup' | 'status' }>(), {
  as: 'div',
  variant: 'panel',
});
</script>

<template>
  <component ref="element" :is="as" class="moonlight-surface" :class="`surface-${variant}`"><slot /></component>
</template>
