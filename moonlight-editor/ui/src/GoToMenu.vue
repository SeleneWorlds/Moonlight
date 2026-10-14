<script setup lang="ts">
import MoonlightSurface from 'moonlight-ui/MoonlightSurface.vue';
import MoonlightButton from 'moonlight-ui/MoonlightButton.vue';
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { MapPin } from '@lucide/vue';
import GizmoVisual from 'moonlight-ui/GizmoVisual.vue';
import { useSelene, type Coordinate } from './selene';
interface GoToTarget {
  name: string;
  type: string;
  coordinate: Coordinate;
  visual?: string;
}
const selene = useSelene();
const open = ref(false);
const loading = ref(false);
const search = ref('');
const targets = ref<GoToTarget[]>([]);
const input = ref<HTMLInputElement>();
const root = ref<HTMLElement>();
let releaseText: (() => void) | undefined;
let releaseKeys: (() => void) | undefined;
const matches = computed(() =>
  targets.value.filter((target) =>
    `${target.name} ${target.type} ${target.coordinate.x}, ${target.coordinate.y}, ${target.coordinate.z}`
      .toLowerCase()
      .includes(search.value.trim().toLowerCase()),
  ),
);
function close(): void {
  open.value = false;
  releaseText?.();
  releaseKeys?.();
  releaseText = undefined;
  releaseKeys = undefined;
}
function toggle(): void {
  if (open.value) {
    return close();
  }
  open.value = true;
  loading.value = true;
  search.value = '';
  releaseText = selene.input.captureText();
  releaseKeys = selene.input.captureKeys('Escape');
  selene.network.sendToServer('moonlight-editor:request-go-to-targets');
  void nextTick(() => input.value?.focus());
}
function goTo(target: GoToTarget): void {
  selene.network.sendToServer('moonlight-editor:go-to', { ...target.coordinate });
  close();
}
function outside(event: Event): void {
  if (open.value && root.value && !event.composedPath().includes(root.value)) {
    close();
  }
}
function keydown(event: KeyboardEvent): void {
  if (open.value && event.key === 'Escape') {
    event.preventDefault();
    event.stopImmediatePropagation();
    close();
  }
}
const releases = [
  selene.network.onPayload('moonlight-editor:go-to-targets-start', () => {
    targets.value = [];
  }),
  selene.network.onPayload('moonlight-editor:go-to-targets', (payload) => {
    if (Array.isArray(payload.targets)) {
      targets.value.push(...(payload.targets as GoToTarget[]));
    }
  }),
  selene.network.onPayload('moonlight-editor:go-to-targets-end', () => {
    loading.value = false;
  }),
];
let menuEventRoot: Node | undefined;
onMounted(() => {
  // Listen inside the closed shadow root, where the event path includes the menu.
  menuEventRoot = root.value?.getRootNode();
  menuEventRoot?.addEventListener('pointerdown', outside);
  // Events outside the shadow host are visible at document level.
  document.addEventListener('pointerdown', outsideHost);
});
function outsideHost(event: PointerEvent): void {
  if (menuEventRoot instanceof ShadowRoot && event.composedPath().includes(menuEventRoot.host)) {
    return;
  }
  outside(event);
}
window.addEventListener('keydown', keydown, true);
onBeforeUnmount(() => {
  close();
  releases.forEach((release) => release());
  menuEventRoot?.removeEventListener('pointerdown', outside);
  document.removeEventListener('pointerdown', outsideHost);
  window.removeEventListener('keydown', keydown, true);
});
</script>
<template>
  <div ref="root" class="go-to-menu ml-relative">
    <MoonlightButton
      class="go-to-toggle"
      type="button"
      :aria-expanded="open"
      aria-controls="go-to-dropdown"
      @click="toggle"
    >
      <MapPin :size="16" aria-hidden="true" /> Go To
    </MoonlightButton>
    <MoonlightSurface
      as="div"
      variant="popup"
      v-if="open"
      id="go-to-dropdown"
      class="go-to-dropdown moonlight-popup ml-popover-end"
    >
      <input
        class="moonlight-input"
        ref="input"
        v-model="search"
        type="search"
        placeholder="Search destinations…"
        aria-label="Search destinations"
      />
      <div class="go-to-results ml-scroll">
        <p v-if="loading" role="status">Loading targets…</p>
        <p v-else-if="!matches.length" role="status">No destinations found.</p>
        <MoonlightButton
          v-for="(target, index) in matches"
          :key="index"
          type="button"
          class="go-to-target moonlight-item"
          @click="goTo(target)"
        >
          <span v-if="target.visual" class="go-to-visual ml-visual-small"
            ><GizmoVisual :identifier="target.visual"
          /></span>
          <span class="go-to-text moonlight-description"
            ><strong>{{ target.name }}</strong
            ><small
              >{{ target.type }} · {{ target.coordinate.x }}, {{ target.coordinate.y }},
              {{ target.coordinate.z }}</small
            ></span
          >
        </MoonlightButton>
      </div>
    </MoonlightSurface>
  </div>
</template>
