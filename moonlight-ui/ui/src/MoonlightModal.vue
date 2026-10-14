<script setup lang="ts">
import { shallowRef, useId } from 'vue';
defineProps<{ title: string }>();
const emit = defineEmits<{ submit: [event: Event] }>();
const element = shallowRef<HTMLDialogElement>();
const titleId = useId();
defineExpose({
  showModal: () => element.value?.showModal(),
  close: () => element.value?.close(),
});
</script>

<template>
  <dialog ref="element" class="moonlight-dialog" :aria-labelledby="titleId" @keydown.esc.stop>
    <form class="ml-stack ml-gap" @submit.prevent="emit('submit', $event)">
      <h2 :id="titleId">{{ title }}</h2>
      <slot />
      <div v-if="$slots.actions" class="ml-row ml-end ml-gap">
        <slot name="actions" />
      </div>
    </form>
  </dialog>
</template>
