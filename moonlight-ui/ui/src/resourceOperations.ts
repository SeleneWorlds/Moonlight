import type { ClientNetworkPayload, SeleneUiApi } from './selene';

export function editorHttpRequest(
  operation: string,
  payload: ClientNetworkPayload = {},
): {
  path: string;
  payload: ClientNetworkPayload;
  method: 'GET' | 'POST' | 'PUT';
} {
  const body = { ...payload };
  const segment = (key: string): string => {
    const value = body[key];
    delete body[key];
    if (typeof value !== 'string' || !value) {
      throw new Error(`Missing ${key}`);
    }
    return encodeURIComponent(value);
  };
  const filePath = (): string => {
    const value = body.path;
    delete body.path;
    if (typeof value !== 'string' || !value) {
      throw new Error('Missing path');
    }
    return value.split('/').map(encodeURIComponent).join('/');
  };
  let path: string;
  let method: 'GET' | 'POST' | 'PUT' = 'GET';
  switch (operation) {
    case 'request-bundles':
      path = '/resources/bundles';
      break;
    case 'request-bundle-registries':
      path = `/resources/bundles/${segment('bundle')}/registries`;
      break;
    case 'request-project':
      path = `/resources/bundles/${segment('bundle')}/registries/${segment('registry')}`;
      break;
    case 'registry-field-options':
      path = `/registries/${segment('registry')}/field-options`;
      break;
    case 'search-registry':
      path = `/registries/${segment('registry')}/entries`;
      break;
    case 'search-scripts':
      path = '/scripts';
      break;
    case 'open-file':
      path = `/resources/files/${filePath()}`;
      break;
    case 'save-file':
      path = `/resources/files/${filePath()}`;
      method = 'PUT';
      break;
    case 'rename-file':
      path = `/resources/rename/${filePath()}`;
      method = 'POST';
      break;
    case 'create-file':
      path = `/resources/bundles/${segment('bundle')}/registries/${segment('registry')}/files`;
      method = 'POST';
      break;
    case 'persist-changes':
    case 'discard-changes':
      path = `/resources/changes/${operation === 'persist-changes' ? 'persist' : 'discard'}`;
      if (body.path) {
        path += `/${filePath()}`;
      }
      method = 'POST';
      break;
    case 'pending-changes':
      path = '/resources/changes';
      break;
    default:
      throw new Error(`Unknown editor operation: ${operation}`);
  }
  return { path, payload: body, method };
}

export async function requestEditorOperation(
  selene: Pick<SeleneUiApi, 'registries' | 'http'>,
  operation: string,
  payload: ClientNetworkPayload = {},
): Promise<unknown> {
  if (operation === 'search-registry') {
    const localResult = await selene.registries.search(
      String(payload.registry),
      String(payload.query ?? ''),
      payload.lookup === true,
    );
    if (localResult !== null) {
      return localResult;
    }
  }
  const request = editorHttpRequest(operation, payload);
  return selene.http.request(request.path, request.payload, request.method);
}
