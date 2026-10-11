import type { AppData, CableType, RackModel, Stage } from './types';
import { VERIFIED_CABLE_TYPES, VERIFIED_RACK_MODELS } from './data/library';

export const DEFAULT_STAGES: Stage[] = [
  { id: 'rough', name: 'Roughed in', measure: 'length', color: '#2a78d6' },
  { id: 'tie', name: 'Tied in', measure: 'length', color: '#eb6834' },
  { id: 'splice', name: 'Spliced', measure: 'fibres', color: '#1baf7a' },
  { id: 'term', name: 'Terminated', measure: 'connectors', color: '#eda100' },
  { id: 'test', name: 'Tested', measure: 'fibres', color: '#e87ba4' },
];

/**
 * Contract cable types (1728F / 864F / 64F). Spec values (OD, weight, bend radius)
 * are left blank on purpose: set them from the cable manufacturer's datasheet once
 * the exact product is confirmed, or copy them from a verified library entry.
 */
export const CONTRACT_CABLE_TYPES: CableType[] = [
  {
    id: 'ct-1728-mpo16',
    brand: 'TBC',
    name: '1728F SM bulk - pre-term MPO-16',
    category: 'fibre',
    fibreCount: 1728,
    termination: 'pre-term-mpo',
    fibresPerConnector: 16,
    ends: 2,
    stageIds: ['rough', 'tie', 'term', 'test'],
    notes: 'Building-to-building via link bridges. Runs up to 300 m. Confirm manufacturer and enter datasheet values.',
    verified: false,
  },
  {
    id: 'ct-864-ribbon',
    brand: 'TBC',
    name: '864F SM ribbon - 12F ribbon splice to LC',
    category: 'fibre',
    fibreCount: 864,
    termination: 'ribbon-splice',
    ribbonSize: 12,
    fibresPerConnector: 1,
    ends: 2,
    stageIds: ['rough', 'tie', 'splice', 'test'],
    notes: '12-fibre ribbon mass-fusion splice onto LC pigtails. Confirm manufacturer and enter datasheet values.',
    verified: false,
  },
  {
    id: 'ct-64-mpo16',
    brand: 'TBC',
    name: '64F SM - pre-term MPO-16',
    category: 'fibre',
    fibreCount: 64,
    termination: 'pre-term-mpo',
    fibresPerConnector: 16,
    ends: 2,
    stageIds: ['rough', 'tie', 'term', 'test'],
    notes: 'Shorter in-building linkage. Confirm manufacturer and enter datasheet values.',
    verified: false,
  },
];

export const GENERIC_RACK_MODELS: RackModel[] = [
  { id: 'rm-generic-600-1200-42', brand: 'Generic', model: '42U 600 x 1200', heightU: 42, widthMm: 600, depthMm: 1200, verified: false },
  { id: 'rm-generic-800-1200-42', brand: 'Generic', model: '42U 800 x 1200', heightU: 42, widthMm: 800, depthMm: 1200, verified: false },
  { id: 'rm-generic-600-1200-48', brand: 'Generic', model: '48U 600 x 1200', heightU: 48, widthMm: 600, depthMm: 1200, verified: false },
];

export function emptyData(): AppData {
  return {
    version: 1,
    project: {
      name: 'New cabling project',
      client: '',
      site: '',
      startDate: new Date().toISOString().slice(0, 10),
      defaultShiftHours: 10,
    },
    stages: DEFAULT_STAGES.map((s) => ({ ...s })),
    cableTypes: [...CONTRACT_CABLE_TYPES, ...VERIFIED_CABLE_TYPES].map((c) => ({ ...c })),
    rackModels: [...GENERIC_RACK_MODELS, ...VERIFIED_RACK_MODELS].map((r) => ({ ...r })),
    crews: [],
    workers: [],
    racks: [],
    pathways: [],
    drops: [],
    cables: [],
    progress: [],
    time: [],
  };
}
