<script lang="ts">
import type { Component } from 'vue';
const modules = import.meta.glob<{ default: Component }>([
  '../../node_modules/@lucide/vue/dist/esm/icons/*.mjs',
  '!../../node_modules/@lucide/vue/dist/esm/icons/index.mjs',
]);
</script>

<script setup lang="ts">
import { computed } from 'vue';
import { resolveRegistryIcon } from './registryIcons';
const props = defineProps<{ name: string }>();
const icon = computed(() => resolveRegistryIcon(props.name, modules));
</script>

<template>
  <component v-if="icon" :is="icon" />
</template>
