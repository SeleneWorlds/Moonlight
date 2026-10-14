import 'moonlight-ui/styles/theme.css';
import 'moonlight-ui/styles/primitives.css';
import { createApp } from 'vue';
import { containDialogEscape } from 'moonlight-ui/keyboard';
import App from './App.vue';
import { createMockSeleneUiApi, seleneKey, type SeleneUiApi } from './selene';

export function mount(root: ParentNode, selene: SeleneUiApi): () => void {
  const target = root.querySelector('#moonlight-admin');
  if (!(target instanceof HTMLElement)) {
    throw new Error('Missing Moonlight Admin mount element.');
  }

  target.classList.add('moonlight-ui');
  const app = createApp(App);
  app.provide(seleneKey, selene);
  app.mount(target);
  const releaseEscape = containDialogEscape(target);
  return () => {
    releaseEscape();
    app.unmount();
  };
}

if (import.meta.env.DEV && document.querySelector('#moonlight-admin')) {
  mount(document, createMockSeleneUiApi());
}
