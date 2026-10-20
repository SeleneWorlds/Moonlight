<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import MoonlightModal from 'moonlight-ui/MoonlightModal.vue';
import MoonlightButton from 'moonlight-ui/MoonlightButton.vue';
import SelectInput from 'moonlight-ui/SelectInput.vue';
import { useSelene, requestEditorOperation } from './selene';

const selene = useSelene();
const modal = ref<InstanceType<typeof MoonlightModal>>();
const bundles = ref<string[]>([]);
const BUNDLE_STORAGE_KEY = 'moonlight-editor.localization.bundle';
function loadBundle(): string {
  try {
    return window.localStorage.getItem(BUNDLE_STORAGE_KEY) ?? '';
  } catch {
    // Selection still works when browser storage is unavailable.
    return '';
  }
}
const bundle = ref(loadBundle());
const paths = ref<string[]>([]);
const path = ref('');
const drafts = ref<Record<string, { contents: string; original: string }>>({});
const current = computed(() => drafts.value[path.value]);
const dirty = computed(() => !!current.value && current.value.contents !== current.value.original);
const busy = ref(false);
const canSave = ref(false);
const status = ref('');
const error = ref(false);
let releaseText: (() => void) | undefined;
let releaseKeys: (() => void) | undefined;

async function run(action: () => Promise<void>): Promise<void> {
  busy.value = true;
  error.value = false;
  status.value = '';
  try {
    await action();
  } catch (cause) {
    status.value = cause instanceof Error ? cause.message : String(cause);
    error.value = true;
  } finally {
    busy.value = false;
  }
}
async function selectBundle(): Promise<void> {
  try {
    window.localStorage.setItem(BUNDLE_STORAGE_KEY, bundle.value);
  } catch {
    // Selection still works when browser storage is unavailable.
  }
  path.value = '';
  paths.value = [];
  await run(async () => {
    paths.value = (await selene.http.request(`/localization/bundles/${encodeURIComponent(bundle.value)}`)) as string[];
    if (!paths.value.length) {
      status.value = 'No messages files in this bundle.';
    }
  });
}
function fileUrl(): string {
  return `/localization/files/${path.value.split('/').map(encodeURIComponent).join('/')}`;
}
async function selectFile(): Promise<void> {
  canSave.value = false;
  await run(async () => {
    if (!current.value) {
      const file = (await selene.http.request(fileUrl())) as { contents: string };
      drafts.value[path.value] = { contents: file.contents, original: file.contents };
    }
    const allowed = (await selene.http.request(
      '/resources/permissions',
      {
        checks: [{ operation: 'save-localization', request: { path: path.value } }],
      },
      'POST',
    )) as boolean[];
    canSave.value = allowed[0] === true;
  });
}
async function reload(): Promise<void> {
  await run(async () => {
    const file = (await selene.http.request(fileUrl())) as { contents: string };
    drafts.value[path.value] = { contents: file.contents, original: file.contents };
  });
}
async function save(): Promise<void> {
  if (!current.value || !dirty.value || !canSave.value || busy.value) {
    return;
  }
  await run(async () => {
    const file = (await selene.http.request(
      fileUrl(),
      {
        contents: current.value!.contents,
        originalContents: current.value!.original,
      },
      'PUT',
    )) as { contents: string };
    drafts.value[path.value] = { contents: file.contents, original: file.contents };
    status.value = 'Changes persisted to bundle.';
  });
}
function close(): void {
  if (busy.value) {
    return;
  }
  modal.value?.close();
  releaseText?.();
  releaseKeys?.();
  releaseText = releaseKeys = undefined;
}
async function open(): Promise<void> {
  modal.value?.showModal();
  releaseText ??= selene.input.captureText();
  releaseKeys ??= selene.input.captureKeys('Escape');
  await run(async () => {
    const result = (await requestEditorOperation(selene, 'request-bundles')) as { bundles: string[] };
    bundles.value = result.bundles;
    if (!bundles.value.includes(bundle.value)) {
      bundle.value = '';
      path.value = '';
      paths.value = [];
    }
  });
  if (!error.value && bundle.value && !paths.value.length) {
    await selectBundle();
  }
}
onBeforeUnmount(() => {
  modal.value?.close();
  releaseText?.();
  releaseKeys?.();
});
defineExpose({ open });
</script>

<template>
  <MoonlightModal
    ref="modal"
    class="moonlight-dialog-wide"
    title="Localization Editor"
    @submit="save"
    @cancel.prevent="close"
  >
    <div class="localization-editor ml-stack ml-gap">
      <div class="ml-row ml-gap">
        <label class="moonlight-field ml-grow">
          <span>Bundle</span>
          <SelectInput v-model="bundle" :options="bundles" label="Bundle" :disabled="busy" @change="selectBundle" />
        </label>
        <label class="moonlight-field ml-grow">
          <span>Messages file</span>
          <SelectInput
            v-model="path"
            :options="paths"
            label="Messages file"
            :disabled="busy || !paths.length"
            @change="selectFile"
          />
        </label>
      </div>
      <label v-if="current" class="moonlight-field ml-grow">
        <span>{{ path }}{{ dirty ? ' · Unsaved changes' : '' }}</span>
        <textarea
          v-model="current.contents"
          class="moonlight-input moonlight-code moonlight-code-editor"
          :readonly="busy || !canSave"
          spellcheck="false"
          aria-label="Messages contents"
        />
      </label>
      <p v-else class="moonlight-empty">Select a bundle and messages file.</p>
      <p v-if="current && !canSave && !busy" class="moonlight-description">
        You have read-only access to this messages file.
      </p>
      <p v-if="status" :class="error ? 'moonlight-error' : 'moonlight-description'" :role="error ? 'alert' : 'status'">
        {{ status }}
      </p>
      <p v-if="busy" role="status">Loading…</p>
    </div>
    <template #actions>
      <MoonlightButton type="button" :disabled="busy" @click="close">Close</MoonlightButton>
      <MoonlightButton
        type="button"
        :disabled="busy || !dirty"
        @click="current && (current.contents = current.original)"
        >Discard edits</MoonlightButton
      >
      <MoonlightButton type="button" :disabled="busy || !current || dirty" @click="reload">Reload file</MoonlightButton>
      <MoonlightButton variant="primary" type="submit" :disabled="busy || !dirty || !canSave"
        >Save to bundle</MoonlightButton
      >
    </template>
  </MoonlightModal>
</template>
