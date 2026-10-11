import type { AppData, ID, ItpItem, ItpLot } from '../types';

/** Items that hold back a stage: a release item that is a Hold point for either party. */
export const isHold = (it: ItpItem) => it.contractor === 'H' || it.client === 'H';

/** Unreleased hold points that block logging `stageId` on `cableId`. */
export function blockingHolds(data: AppData, cableId: ID, stageId: ID): { lot: ItpLot; item: ItpItem }[] {
  const out: { lot: ItpLot; item: ItpItem }[] = [];
  for (const lot of data.itpLots) {
    if (!lot.cableIds.includes(cableId)) continue;
    const tpl = data.itpTemplates.find((t) => t.id === lot.templateId);
    for (const item of tpl?.items ?? []) {
      if (item.releasesStageId !== stageId || !isHold(item)) continue;
      const s = lot.signoffs[item.id];
      const released = s && (s.status === 'pass' || s.status === 'na') && (item.client !== 'H' || !!s.clientBy);
      if (!released) out.push({ lot, item });
    }
  }
  return out;
}

export function lotProgress(data: AppData, lot: ItpLot) {
  const tpl = data.itpTemplates.find((t) => t.id === lot.templateId);
  const items = tpl?.items ?? [];
  const done = items.filter((i) => ['pass', 'na'].includes(lot.signoffs[i.id]?.status ?? '')).length;
  const failed = items.filter((i) => lot.signoffs[i.id]?.status === 'fail').length;
  const holdsOpen = items.filter((i) => isHold(i) && !['pass', 'na'].includes(lot.signoffs[i.id]?.status ?? '')).length;
  return { total: items.length, done, failed, holdsOpen, pct: items.length ? (done / items.length) * 100 : 0 };
}

export function nextLotNumber(data: AppData) {
  const n = data.itpLots.reduce((m, l) => Math.max(m, Number(l.number.replace(/\D/g, '')) || 0), 0) + 1;
  return 'LOT-' + String(n).padStart(3, '0');
}
