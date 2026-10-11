import type { CableRun, CableType, Project } from '../types';

export interface Budget {
  connectors: number;
  splices: number;
  lengthKm: number;
  attenDbKm: number;
  totalDb: number;
  basis: string;
}

/**
 * Fibre link loss budget: connectors x conn loss + splices x splice loss + length x attenuation.
 * Mated pairs: one at each terminated end. Ribbon/single splice: one splice per end (pigtail).
 */
export function linkBudget(c: CableRun, t: CableType | undefined, p: Project, wavelengthNm?: number): Budget | null {
  if (!t || t.category !== 'fibre') return null;
  const ends = t.ends ?? 2;
  const connectors = ends;
  const splices = t.termination === 'ribbon-splice' || t.termination === 'single-splice' ? ends : 0;
  const lengthKm = c.lengthM / 1000;
  const b = p.budget;
  let attenDbKm = b.smIspDbKm;
  let cls = 'SM inside plant';
  if (t.fibreClass === 'sm-osp') { attenDbKm = b.smOspDbKm; cls = 'SM outside plant'; }
  if (t.fibreClass === 'mm') {
    const w1300 = wavelengthNm === 1300;
    attenDbKm = w1300 ? b.mm1300DbKm : b.mm850DbKm;
    cls = `MM @${w1300 ? 1300 : 850} nm`;
  }
  const totalDb = connectors * b.connectorDb + splices * b.spliceDb + lengthKm * attenDbKm;
  return {
    connectors, splices, lengthKm, attenDbKm, totalDb,
    basis: `${connectors} x ${b.connectorDb} dB + ${splices} x ${b.spliceDb} dB + ${lengthKm.toFixed(3)} km x ${attenDbKm} dB/km (${cls})`,
  };
}
