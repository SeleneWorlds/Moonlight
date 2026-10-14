import type { SchemaDefinition } from 'moonlight-ui/schema';

function parseEntry(contents: string): Record<string, unknown> {
  const value: unknown = JSON.parse(contents);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Registry entry must be a JSON object.');
  }
  return value as Record<string, unknown>;
}

export function scenarioFromContents(contents: string): string | undefined {
  try {
    const metadata = parseEntry(contents).metadata;
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return undefined;
    }
    const scenario = (metadata as Record<string, unknown>).scenario;
    return typeof scenario === 'string' && scenario.trim() ? scenario : undefined;
  } catch {
    return undefined;
  }
}

export function withScenario(contents: string, scenario: string): string {
  const value = parseEntry(contents);
  const metadata = value.metadata;
  if (metadata !== undefined && (!metadata || typeof metadata !== 'object' || Array.isArray(metadata))) {
    throw new Error('Entry metadata must be a JSON object.');
  }
  value.metadata = { ...(metadata as Record<string, unknown> | undefined) };
  const updated = value.metadata as Record<string, unknown>;
  if (scenario) {
    updated.scenario = scenario;
  } else {
    delete updated.scenario;
  }
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function withEnabled(
  contents: string,
  schema: Record<string, SchemaDefinition> | null | undefined,
  enabled: boolean,
): string {
  const field = Object.entries(schema ?? {}).find(
    ([, definition]) => (typeof definition === 'string' ? definition : definition.type) === 'enabled',
  )?.[0];
  if (!field) {
    throw new Error('This registry has no enabled field.');
  }
  const value = parseEntry(contents);
  value[field] = enabled;
  return `${JSON.stringify(value, null, 2)}\n`;
}

// Limit resource requests when a bundle contains thousands of registry entries.
export async function mapResources<T, R>(values: readonly T[], map: (value: T) => Promise<R>): Promise<R[]> {
  const result: R[] = new Array(values.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(8, values.length) }, async () => {
      while (cursor < values.length) {
        const index = cursor++;
        result[index] = await map(values[index]!);
      }
    }),
  );
  return result;
}
