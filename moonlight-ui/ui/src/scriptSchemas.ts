import type { SeleneUiApi } from './selene';
import type { SchemaDefinition } from './schema';

export async function fetchScriptSchema(
  http: SeleneUiApi['http'],
  module: string,
  functionName = 'schema',
): Promise<Record<string, SchemaDefinition>> {
  const result = await http.request('/scripts/schema', { module, functionName }, 'GET');
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new Error('Schema provider must return a schema object.');
  }
  return result as Record<string, SchemaDefinition>;
}
