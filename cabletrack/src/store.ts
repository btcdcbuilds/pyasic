import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';
import type { AppData, CollectionKey, ID, Location, Project } from './types';
import { COLLECTIONS } from './types';
import { defaultProject, emptyData } from './seed';

type Collections = Pick<AppData, CollectionKey>;
type ItemOf<K extends CollectionKey> = Collections[K][number];

/** Pending local changes not yet pushed to the cloud, keyed "collection|id". */
export type DirtyMap = Record<string, { deleted?: boolean }>;

export interface LocalMeta {
  /** Who is using this device (used for createdBy / sign-offs when offline). */
  me: string;
  lastPull?: string;
  hydrated?: boolean;
}

interface Store extends AppData {
  dirty: DirtyMap;
  local: LocalMeta;
  setProject: (p: Partial<Project>) => void;
  upsert: <K extends CollectionKey>(key: K, item: ItemOf<K>) => void;
  upsertMany: <K extends CollectionKey>(key: K, items: ItemOf<K>[]) => void;
  remove: <K extends CollectionKey>(key: K, id: ID) => void;
  removeMany: <K extends CollectionKey>(key: K, ids: ID[]) => void;
  /** Replace a whole collection (marks every row dirty). */
  setCollection: <K extends CollectionKey>(key: K, items: ItemOf<K>[]) => void;
  setLocal: (p: Partial<LocalMeta>) => void;
  replaceAll: (data: AppData) => void;
  reset: () => void;
}

export const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);

export const today = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

const markDirty = (dirty: DirtyMap, key: string, ids: ID[], deleted = false): DirtyMap => {
  const next = { ...dirty };
  for (const id of ids) next[key + '|' + id] = deleted ? { deleted: true } : {};
  return next;
};

/** IndexedDB storage, falling back to reading v1 data from localStorage once. */
const idbStorage: StateStorage = {
  getItem: async (name) => {
    try {
      const v = await idbGet<string>(name);
      if (v) return v;
    } catch {
      /* fall through */
    }
    try {
      return localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: async (name, value) => {
    try {
      await idbSet(name, value);
    } catch {
      try {
        localStorage.setItem(name, value);
      } catch {
        /* storage full or blocked */
      }
    }
  },
  removeItem: async (name) => {
    await idbDel(name).catch(() => {});
  },
};

/** v1 -> v2: racks become Locations; add new collections and project fields. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function migrateV1(old: any): Partial<AppData> {
  const base = emptyData();
  const locations: Location[] = [];
  const parents = new Map<string, string>();
  const area = (name: string, kind: Location['kind'], parentId?: string) => {
    const k = kind + ':' + (parentId ?? '') + ':' + name;
    if (!parents.has(k)) {
      const id = uid();
      parents.set(k, id);
      locations.push({ id, name, kind, parentId });
    }
    return parents.get(k)!;
  };
  const mainArea = area('Main floor', 'floor');
  for (const r of old.racks ?? []) {
    const b = r.building ? area(r.building, 'building') : undefined;
    const room = r.room ? area(r.room, 'room', b) : undefined;
    locations.push({
      id: r.id, name: r.name, kind: 'rack', parentId: room ?? b, areaId: mainArea, x: r.x, y: r.y, rotation: r.rotation,
      modelId: r.modelId, heightU: r.heightU, widthMm: r.widthMm, depthMm: r.depthMm, devices: r.devices ?? [], code: r.row ? undefined : undefined,
    });
  }
  return {
    ...base,
    ...old,
    version: 2,
    project: { ...defaultProject(), ...(old.project ?? {}) },
    locations,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pathways: (old.pathways ?? []).map((p: any) => ({ ...p, areaId: p.points?.length ? mainArea : undefined })),
    racks: undefined,
  } as Partial<AppData>;
}

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      ...emptyData(),
      dirty: {},
      local: { me: '' },
      setProject: (p) => set((s) => ({ project: { ...s.project, ...p }, dirty: { ...s.dirty, 'project|project': {} } })),
      upsert: (key, item) =>
        set((s) => {
          const list = s[key] as { id: ID }[];
          const id = (item as { id: ID }).id;
          const i = list.findIndex((x) => x.id === id);
          const next = i === -1 ? [...list, item] : list.map((x, j) => (j === i ? item : x));
          return { [key]: next, dirty: markDirty(s.dirty, key, [id]) } as Partial<Store>;
        }),
      upsertMany: (key, items) =>
        set((s) => {
          if (items.length === 0) return {};
          const map = new Map((s[key] as { id: ID }[]).map((x) => [x.id, x]));
          for (const it of items as { id: ID }[]) map.set(it.id, it);
          return { [key]: [...map.values()], dirty: markDirty(s.dirty, key, (items as { id: ID }[]).map((x) => x.id)) } as Partial<Store>;
        }),
      remove: (key, id) =>
        set((s) => ({ [key]: (s[key] as { id: ID }[]).filter((x) => x.id !== id), dirty: markDirty(s.dirty, key, [id], true) }) as Partial<Store>),
      removeMany: (key, ids) =>
        set((s) => {
          if (ids.length === 0) return {};
          const del = new Set(ids);
          return { [key]: (s[key] as { id: ID }[]).filter((x) => !del.has(x.id)), dirty: markDirty(s.dirty, key, ids, true) } as Partial<Store>;
        }),
      setCollection: (key, items) =>
        set((s) => {
          const prev = (s[key] as { id: ID }[]).map((x) => x.id);
          const nextIds = new Set((items as { id: ID }[]).map((x) => x.id));
          let dirty = markDirty(s.dirty, key, [...nextIds]);
          dirty = markDirty(dirty, key, prev.filter((id) => !nextIds.has(id)), true);
          return { [key]: items, dirty } as Partial<Store>;
        }),
      setLocal: (p) => set((s) => ({ local: { ...s.local, ...p } })),
      replaceAll: (data) => {
        const d = (data.version ?? 1) < 2 ? { ...emptyData(), ...migrateV1(data) } : { ...emptyData(), ...data };
        const dirty: DirtyMap = { 'project|project': {} };
        for (const c of COLLECTIONS) for (const r of (d[c] as { id: ID }[]) ?? []) dirty[c + '|' + r.id] = {};
        set({ ...d, dirty });
      },
      reset: () => set({ ...emptyData(), dirty: {}, local: { me: get().local.me, hydrated: true } }),
    }),
    {
      name: 'cabletrack-data',
      version: 2,
      storage: createJSONStorage(() => idbStorage),
      partialize: (s) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { setProject, upsert, upsertMany, remove, removeMany, setCollection, setLocal, replaceAll, reset, ...rest } = s;
        return { ...rest, local: { ...rest.local, hydrated: undefined } };
      },
      migrate: (persisted, version) => {
        if (version < 2) return migrateV1(persisted) as unknown as Store;
        return persisted as Store;
      },
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<Store>;
        const base = emptyData();
        const out = { ...current, ...p } as Store;
        // Make sure collections added in later versions exist.
        for (const c of COLLECTIONS) if (!Array.isArray(out[c])) (out as unknown as Record<string, unknown>)[c] = base[c];
        out.project = { ...base.project, ...(p.project ?? {}) };
        out.project.budget = { ...base.project.budget, ...(p.project?.budget ?? {}) };
        out.dirty = p.dirty ?? {};
        out.local = { me: '', ...(p.local ?? {}) };
        return out;
      },
      onRehydrateStorage: () => (state) => {
        state?.setLocal({ hydrated: true });
      },
    },
  ),
);

/** Snapshot of just the data (no actions), for export/backup. */
export function exportData(): AppData {
  const s = useStore.getState();
  const out = { version: 2, project: s.project } as AppData;
  for (const c of COLLECTIONS) (out as unknown as Record<string, unknown>)[c] = s[c];
  return out;
}

/** Display name of the person using this device. */
export const me = () => useStore.getState().local.me || 'Unknown user';
