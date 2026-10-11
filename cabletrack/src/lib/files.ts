import { createStore, get, set, del } from 'idb-keyval';
import { me, uid, useStore } from '../store';
import type { Attachment, EntityKind } from '../types';

const blobs = createStore('cabletrack-files', 'blobs');

/** Remote fetcher, installed by the sync module when cloud is connected. */
let remoteFetch: ((a: Attachment) => Promise<Blob | null>) | null = null;
export const setRemoteFetch = (f: typeof remoteFetch) => (remoteFetch = f);

/** Downscale photos so a day's worth fits comfortably on a phone. */
async function compressImage(file: File, maxPx = 1600, quality = 0.82): Promise<Blob> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.type === 'image/svg+xml') return file;
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, maxPx / Math.max(bmp.width, bmp.height));
    if (k === 1 && file.size < 600_000) return file;
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    const out = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', quality));
    return out && out.size < file.size ? out : file;
  } catch {
    return file;
  }
}

export async function addFile(file: File, entity: EntityKind, entityId: string, caption?: string, opts: { compress?: boolean } = {}) {
  const blob = opts.compress === false ? file : await compressImage(file);
  const id = uid();
  await set(id, blob, blobs);
  const a: Attachment = {
    id,
    entity,
    entityId,
    name: blob === file ? file.name : file.name.replace(/\.[^.]+$/, '') + '.jpg',
    mime: blob.type || file.type || 'application/octet-stream',
    size: blob.size,
    caption,
    createdAt: Date.now(),
    createdBy: me(),
  };
  useStore.getState().upsert('attachments', a);
  return a;
}

export async function getBlob(a: Attachment): Promise<Blob | null> {
  const local = await get<Blob>(a.id, blobs).catch(() => undefined);
  if (local) return local;
  if (remoteFetch) {
    const b = await remoteFetch(a);
    if (b) await set(a.id, b, blobs).catch(() => {});
    return b;
  }
  return null;
}

export const getLocalBlob = (id: string) => get<Blob>(id, blobs).catch(() => undefined);

export async function removeFile(a: Attachment) {
  await del(a.id, blobs).catch(() => {});
  useStore.getState().remove('attachments', a.id);
}

export async function blobUrl(a: Attachment) {
  const b = await getBlob(a);
  return b ? URL.createObjectURL(b) : null;
}

export const fmtSize = (n: number) => (n > 1e6 ? (n / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1e3)) + ' kB');
