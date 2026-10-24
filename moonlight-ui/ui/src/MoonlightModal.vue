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
      <div v-if="$slots.headerActions" class="modal-header">
        <h2 :id="titleId">{{ title }}</h2>
        <div class="modal-header-actions">
          <slot name="headerActions" />
        </div>
      </div>
      <h2 v-else :id="titleId">{{ title }}</h2>
      <slot />
      <div v-if="$slots.actions" class="ml-row ml-end ml-gap">
        <slot name="actions" />
      </div>
    </form>
  </dialog>
</template>

<style scoped>
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}
.modal-header h2 {
  margin: 0;
}
.modal-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
</style>
