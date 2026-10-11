import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AppData, ID, Project } from './types';
import { emptyData } from './seed';

type Collections = Omit<AppData, 'version' | 'project'>;
type CollectionKey = keyof Collections;
type ItemOf<K extends CollectionKey> = Collections[K][number];

interface Store extends AppData {
  setProject: (p: Partial<Project>) => void;
  upsert: <K extends CollectionKey>(key: K, item: ItemOf<K>) => void;
  upsertMany: <K extends CollectionKey>(key: K, items: ItemOf<K>[]) => void;
  remove: <K extends CollectionKey>(key: K, id: ID) => void;
  removeMany: <K extends CollectionKey>(key: K, ids: ID[]) => void;
  replaceAll: (data: AppData) => void;
  reset: () => void;
}

export const uid = () =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36));

export const today = () => {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
};

export const useStore = create<Store>()(
  persist(
    (set) => ({
      ...emptyData(),
      setProject: (p) => set((s) => ({ project: { ...s.project, ...p } })),
      upsert: (key, item) =>
        set((s) => {
          const list = s[key] as { id: ID }[];
          const i = list.findIndex((x) => x.id === (item as { id: ID }).id);
          const next = i === -1 ? [...list, item] : list.map((x, j) => (j === i ? item : x));
          return { [key]: next } as Partial<Store>;
        }),
      upsertMany: (key, items) =>
        set((s) => {
          const map = new Map((s[key] as { id: ID }[]).map((x) => [x.id, x]));
          for (const it of items as { id: ID }[]) map.set(it.id, it);
          return { [key]: [...map.values()] } as Partial<Store>;
        }),
      remove: (key, id) =>
        set((s) => ({ [key]: (s[key] as { id: ID }[]).filter((x) => x.id !== id) }) as Partial<Store>),
      removeMany: (key, ids) =>
        set((s) => {
          const del = new Set(ids);
          return { [key]: (s[key] as { id: ID }[]).filter((x) => !del.has(x.id)) } as Partial<Store>;
        }),
      replaceAll: (data) => set({ ...emptyData(), ...data }),
      reset: () => set(emptyData()),
    }),
    {
      name: 'cabletrack-data',
      version: 1,
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

/** Snapshot of just the data (no actions), for export. */
export function exportData(): AppData {
  const s = useStore.getState();
  return {
    version: s.version,
    project: s.project,
    stages: s.stages,
    cableTypes: s.cableTypes,
    rackModels: s.rackModels,
    crews: s.crews,
    workers: s.workers,
    racks: s.racks,
    pathways: s.pathways,
    drops: s.drops,
    cables: s.cables,
    progress: s.progress,
    time: s.time,
  };
}
