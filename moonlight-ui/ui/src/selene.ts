import { inject, type InjectionKey } from 'vue';
import { seleneInjectionSymbol } from './injection';

export type ClientNetworkPayload = Record<string, unknown>;

export interface Coordinate {
  x: number;
  y: number;
  z: number;
}

export interface SelenePointerEvent {
  clientX: number;
  clientY: number;
  button: number;
  coordinate: Coordinate;
}

export interface SeleneUiApi {
  readonly http: {
    request(path: string, payload?: ClientNetworkPayload, method?: 'GET' | 'POST' | 'PUT'): Promise<unknown>;
  };
  readonly registries: {
    search(registry: string, query: string, lookup?: boolean): Promise<Record<string, unknown> | null>;
  };
  readonly resolveAsset: (path: string) => Promise<string>;
  readonly visuals: {
    getDefinition(identifier: string): Promise<VisualDefinition>;
  };
  readonly ui: {
    setBundleVisible(bundle: string, visible: boolean): void;
  };
  readonly input: {
    registerBinding(
      definition: {
        id: string;
        label: string;
        category?: string;
        defaultBinding: string | null;
        allowInText?: boolean;
        allowShift?: boolean;
      },
      callback?: (event: KeyboardEvent) => boolean | void,
    ): () => void;
    matchesBinding(id: string, event: KeyboardEvent): boolean;
    captureKeys(...keys: string[]): () => void;
    captureText(): () => void;
    onScroll(callback: (event: { amountY: number }) => void): () => void;
    onPointerDown(callback: (event: SelenePointerEvent) => void): () => void;
    onPointerMove(callback: (event: SelenePointerEvent) => void): () => void;
    onPointerUp(callback: (event: SelenePointerEvent) => void): () => void;
  };
  readonly network: {
    sendToServer(payloadId: string, payload?: ClientNetworkPayload): void;
    onPayload(payloadId: string, callback: (payload: ClientNetworkPayload) => void): () => void;
    onConnected(callback: () => void): () => void;
  };
  readonly world: {
    setTileOcclusionEnabled?(enabled: boolean): void;
    getCameraCoordinate(): Coordinate;
    hasTileAt(coordinate: Coordinate): Promise<boolean>;
    setLightingEnabled(enabled: boolean): Promise<void>;
    isLightingEnabled(): boolean;
    setTileGridVisible(visible: boolean): Promise<void>;
    setCameraZoom(zoom: number): Promise<number>;
    getCameraPosition(): Promise<{ x: number; y: number }>;
    setCameraPosition(position: { x: number; y: number }): Promise<Coordinate>;
    projectCoordinate(coordinate: Coordinate): { x: number; y: number };
    onCameraCoordinateChanged(callback: (coordinate: Coordinate) => void): () => void;
    onMapChanged(callback: (coordinate: Coordinate, width: number, height: number) => void): () => void;
  };
}

export interface VisualFrameDefinition {
  texture?: string;
  flipX?: boolean;
  flipY?: boolean;
}

export interface VisualDefinition extends VisualFrameDefinition {
  textures?: string[];
  frames?: Array<string | VisualFrameDefinition>;
  animations?: Record<
    string,
    VisualFrameDefinition & {
      textures?: string[];
      frames?: Array<string | VisualFrameDefinition>;
    }
  >;
  layers?: VisualDefinition[];
}

export const seleneKey: InjectionKey<SeleneUiApi> = seleneInjectionSymbol;

export const useSelene = (): SeleneUiApi => {
  const selene = inject(seleneKey);
  if (!selene) {
    throw new Error('Selene API was not provided.');
  }
  return selene;
};

const createMockShortcuts = (): Pick<SeleneUiApi['input'], 'registerBinding' | 'matchesBinding'> => {
  const shortcutMatchers = new Map<string, (event: KeyboardEvent) => boolean>();
  return {
    matchesBinding: (id, event) => shortcutMatchers.get(id)?.(event) ?? false,
    registerBinding: (definition, callback) => {
      const matches = (event: KeyboardEvent) => {
        const parts = definition.defaultBinding?.split('+');
        return (
          !!parts &&
          event.key.toLowerCase() === parts[parts.length - 1].toLowerCase() &&
          event.ctrlKey === parts.includes('Ctrl') &&
          event.altKey === parts.includes('Alt') &&
          event.metaKey === parts.includes('Meta') &&
          (definition.allowShift || event.shiftKey === parts.includes('Shift'))
        );
      };
      shortcutMatchers.set(definition.id, matches);
      const listener = (event: KeyboardEvent) => {
        if (!event.repeat && matches(event) && callback && callback(event) !== false) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      };
      window.addEventListener('keydown', listener, true);
      return () => {
        shortcutMatchers.delete(definition.id);
        window.removeEventListener('keydown', listener, true);
      };
    },
  };
};

export const createMockSeleneUiApi = (): SeleneUiApi => ({
  http: {
    request: async (path, payload = {}, method = 'GET') => {
      const url = new URL(path, window.location.href);
      if (method === 'GET') {
        for (const [key, value] of Object.entries(payload)) {
          if (value !== undefined && value !== null) {
            url.searchParams.set(key, String(value));
          }
        }
      }
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        ...(method === 'GET' ? {} : { body: JSON.stringify(payload) }),
      });
      if (!response.ok) {
        throw new Error(`HTTP operation failed: ${response.status}`);
      }
      return response.json();
    },
  },
  registries: {
    search: async (registry, query, lookup = false) => {
      const response = await fetch(
        `/client/registries/${encodeURIComponent(registry.includes(':') ? registry : `selene:${registry}`)}`,
      );
      if (response.status === 404) {
        return null;
      }
      if (!response.ok) {
        throw new Error(`Registry lookup failed: ${response.status}`);
      }
      const snapshot = (await response.json()) as {
        entries: Record<string, Record<string, unknown>>;
      };
      const options = Object.entries(snapshot.entries)
        .flatMap(([value, fields]) => {
          const metadata = (fields.metadata as Record<string, unknown> | undefined) ?? {};
          const label = String(metadata.name ?? fields.name ?? value);
          const matches = lookup
            ? value.toLowerCase() === query.toLowerCase()
            : label.toLowerCase().includes(query.toLowerCase()) || value.toLowerCase().includes(query.toLowerCase());
          const visual =
            typeof metadata.visual === 'string'
              ? metadata.visual
              : typeof fields.visual === 'string'
                ? fields.visual
                : registry === 'entities' || registry === 'selene:entities'
                  ? value
                  : null;
          return matches ? [{ value, label, visual }] : [];
        })
        .sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0))
        .slice(0, 50);
      return { registry, query, lookup, options };
    },
  },
  resolveAsset: async (path) => `/${path.replace(/^client\/ui\/dist\//, '')}`,
  visuals: {
    getDefinition: async (identifier) => {
      const response = await fetch('/client/registries/selene:visuals');
      const snapshot = (await response.json()) as {
        entries?: Record<string, VisualDefinition>;
      };
      const definition = snapshot.entries?.[identifier];
      if (!definition) {
        throw new Error(`Visual not found: ${identifier}`);
      }
      return definition;
    },
  },
  ui: {
    setBundleVisible: () => undefined,
  },
  input: {
    ...createMockShortcuts(),
    captureKeys: () => () => undefined,
    captureText: () => () => undefined,
    onScroll: () => () => undefined,
    onPointerDown: () => () => undefined,
    onPointerMove: () => () => undefined,
    onPointerUp: () => () => undefined,
  },
  network: {
    onConnected: (callback) => {
      callback();
      return () => undefined;
    },
    sendToServer: (payloadId, payload) => console.info('[Selene UI]', payloadId, payload),
    onPayload: () => () => undefined,
  },
  world: {
    getCameraCoordinate: () => ({ x: 0, y: 0, z: 0 }),
    hasTileAt: async () => false,
    setLightingEnabled: async () => undefined,
    isLightingEnabled: () => true,
    setTileGridVisible: async () => undefined,
    setCameraZoom: async (zoom) => zoom,
    getCameraPosition: async () => ({ x: 0, y: 0 }),
    setCameraPosition: async () => ({ x: 0, y: 0, z: 0 }),
    projectCoordinate: ({ x, y, z }) => ({
      x: (x + y) * 38,
      y: -((x - y) * 19 + z * 114),
    }),
    onCameraCoordinateChanged: () => () => undefined,
    onMapChanged: () => () => undefined,
  },
});
