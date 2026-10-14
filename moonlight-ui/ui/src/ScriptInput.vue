<script setup lang="ts">
import MoonlightButton from './MoonlightButton.vue';
import { ref, useId, watch } from 'vue';
import { useSelene } from './selene';

const props = defineProps<{
  value: string;
  required: boolean;
  readonly?: boolean;
}>();
const emit = defineEmits<{ select: [value: string] }>();
const selene = useSelene();
const id = useId();
const open = ref(false);
const query = ref(props.value);
const options = ref<string[]>([]);
const loading = ref(false);
const error = ref('');
const active = ref(-1);
const searchRequest = ref<{ query: string } | null>(null);

watch(
  () => props.value,
  (value) => {
    query.value = value;
  },
);
watch(
  searchRequest,
  async (request, _, onCleanup) => {
    if (!request) {
      return;
    }
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      cancelled = true;
      loading.value = false;
      error.value = 'Script search timed out. Focus the field or edit the search to retry.';
    }, 10000);
    onCleanup(() => {
      cancelled = true;
      window.clearTimeout(timeout);
    });

    try {
      const result = (await selene.http.request('/scripts', request)) as {
        options: string[];
      };
      if (!cancelled) {
        options.value = result.options;
      }
    } catch (reason: unknown) {
      if (!cancelled) {
        error.value = reason instanceof Error ? reason.message : String(reason);
      }
    } finally {
      window.clearTimeout(timeout);
      if (!cancelled) {
        loading.value = false;
      }
    }
  },
  { flush: 'sync' },
);

function search(value: string): void {
  if (props.readonly) {
    return;
  }
  query.value = value;
  open.value = true;
  loading.value = true;
  error.value = '';
  options.value = [];
  active.value = -1;
  searchRequest.value = { query: value };
}

function close(): void {
  searchRequest.value = null;
  loading.value = false;
  open.value = false;
  query.value = props.value;
}

function select(value: string): void {
  if (props.readonly) {
    return;
  }
  emit('select', value);
  close();
  query.value = value;
}

function keydown(event: KeyboardEvent): void {
  if (props.readonly) {
    return;
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    close();
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    if (!open.value) {
      search(props.value);
    }
    if (options.value.length) {
      active.value =
        (active.value + (event.key === 'ArrowDown' ? 1 : -1) + options.value.length) % options.value.length;
    }
  } else if (event.key === 'Enter' && open.value) {
    event.preventDefault();
    const value = options.value[active.value];
    if (value !== undefined) {
      select(value);
    }
  }
}
</script>

<template>
  <div class="script-input">
    <input
      class="moonlight-input"
      :readonly="readonly"
      :value="query"
      type="text"
      role="combobox"
      autocomplete="off"
      :required="required"
      :aria-expanded="open"
      :aria-controls="id"
      :aria-activedescendant="active >= 0 ? `${id}-${active}` : undefined"
      aria-autocomplete="list"
      placeholder="Search Lua scripts…"
      @focus="search(value)"
      @input="search(($event.target as HTMLInputElement).value)"
      @blur="close"
      @keydown="keydown"
    />
    <div v-if="open && !readonly" :id="id" class="options moonlight-popup ml-popover" role="listbox">
      <MoonlightButton
        class="moonlight-item"
        variant="ghost"
        v-for="(option, index) in options"
        :id="`${id}-${index}
`"
        :key="option"
        type="button"
        role="option"
        :aria-selected="value === option"
        :class="{ active: active === index }"
        @mousedown.prevent
        @click="select(option)"
      >
        {{ option }}
      </MoonlightButton>
      <p v-if="!options.length" role="status">
        {{ loading ? 'Loading scripts…' : error || 'No matching scripts.' }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.script-input {
  position: relative;
  min-width: 0;
}
input {
  box-sizing: border-box;
  width: 100%;
}

button {
  display: block;
  width: 100%;
  text-align: left;
  overflow-wrap: anywhere;
}
button:hover,
button.active,
button[aria-selected='true'] {
  background: rgba(251, 113, 133, 0.14);
}
p {
  margin: 8px;
  color: var(--moonlight-text-subtle, #71717a);
}
</style>
