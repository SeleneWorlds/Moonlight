<template>
  <div class="moonlight-button-group" role="group"><slot /></div>
</template>

<style scoped>
.moonlight-button-group {
  display: inline-flex;
  align-items: stretch;
  min-width: 0;
}
.moonlight-button-group :deep(> .moonlight-button) {
  position: relative;
}
.moonlight-button-group :deep(> .moonlight-button:not(:first-child)) {
  margin-inline-start: -1px;
  border-start-start-radius: 0;
  border-end-start-radius: 0;
}
.moonlight-button-group :deep(> .moonlight-button:not(:last-child)) {
  border-start-end-radius: 0;
  border-end-end-radius: 0;
}
.moonlight-button-group :deep(> .moonlight-button:hover),
.moonlight-button-group :deep(> .moonlight-button:focus-visible) {
  z-index: 1;
}
</style>
