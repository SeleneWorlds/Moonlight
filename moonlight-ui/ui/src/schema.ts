import type { Coordinate } from './selene';

export function isRegistryValueReference(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.prototype.hasOwnProperty.call(value, '$ref')
  );
}

export interface DistancePick {
  field: string;
  coordinate: Coordinate;
  distance: number;
  min?: number;
  max?: number;
}

export type SchemaDefinition =
  | string
  | {
      type: string;
      editor?: string;
      optional?: boolean;
      min?: number;
      max?: number;
      values?: Array<{ value: unknown; label: string }>;
      registry?: string;
      reference?: string;
      coordinate?: string;
      property?: string;
      module?: string;
      function?: string;
      variants?: Record<string, SchemaDefinition>;
      properties?: Record<string, SchemaDefinition>;
      keyType?: SchemaDefinition;
      valueType?: SchemaDefinition;
    };

export function defaultSchemaValue(definition: SchemaDefinition): unknown {
  const type = typeof definition === 'string' ? definition : definition.type;
  switch (type) {
    case 'integer':
    case 'number':
      return 0;
    case 'distance':
      return typeof definition === 'string' ? 0 : (definition.min ?? 0);
    case 'boolean':
    case 'enabled':
      return false;
    case 'range':
      return {
        min: typeof definition === 'string' ? 0 : (definition.min ?? Math.min(0, definition.max ?? 0)),
        max: typeof definition === 'string' ? 0 : (definition.min ?? Math.min(0, definition.max ?? 0)),
      };
    case 'area':
      return { include: [], exclude: [] };
    case 'coordinate':
      return { x: 0, y: 0, z: 0 };
    case 'scripted_schema_lookup':
    case 'object':
    case 'map':
      return {};
    case 'array':
      return [];
    case 'any':
      return null;
    case 'enum':
      return typeof definition === 'string' ? '' : (definition.values?.[0]?.value ?? '');
    default:
      return '';
  }
}

// Select a field definition using a sibling property, retaining wrapper metadata.
export function resolveSchemaField(definition: SchemaDefinition, contents: Record<string, unknown>): SchemaDefinition {
  if (typeof definition === 'string' || definition.type !== 'schema_lookup') {
    return definition;
  }
  const selected = definition.property ? contents[definition.property] : undefined;
  const variant =
    typeof selected === 'string' && Object.prototype.hasOwnProperty.call(definition.variants ?? {}, selected)
      ? definition.variants![selected]!
      : 'any';
  return {
    optional: definition.optional,
    ...(typeof variant === 'string' ? { type: variant } : variant),
  };
}
