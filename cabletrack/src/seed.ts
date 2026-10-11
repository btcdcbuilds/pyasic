import type { AppData, CableType, Project, RackModel, Stage } from './types';
import { VERIFIED_CABLE_TYPES, VERIFIED_RACK_MODELS } from './data/library';
import { DEFAULT_ITP } from './data/norms';

export const DEFAULT_STAGES: Stage[] = [
  { id: 'rough', name: 'Roughed in', measure: 'length', color: '#2a78d6' },
  { id: 'tie', name: 'Tied in', measure: 'length', color: '#eb6834' },
  { id: 'splice', name: 'Spliced', measure: 'fibres', color: '#1baf7a' },
  { id: 'term', name: 'Terminated', measure: 'connectors', color: '#eda100' },
  { id: 'test', name: 'Tested', measure: 'fibres', color: '#e87ba4' },
];

/**
 * Example contract cable types (1728F / 864F / 64F). Spec values are left blank on purpose:
 * copy them from a library entry or the datasheet once the product is confirmed.
 */
export const CONTRACT_CABLE_TYPES: CableType[] = [
  { id: 'ct-1728-mpo16', brand: 'TBC', name: '1728F SM bulk - pre-term MPO-16', category: 'fibre', fibreCount: 1728, termination: 'pre-term-mpo', fibresPerConnector: 16, ends: 2, fibreClass: 'sm-isp', stageIds: ['rough', 'tie', 'term', 'test'], notes: 'Confirm manufacturer and enter datasheet values.', verified: false },
  { id: 'ct-864-ribbon', brand: 'TBC', name: '864F SM ribbon - 12F ribbon splice to LC', category: 'fibre', fibreCount: 864, termination: 'ribbon-splice', ribbonSize: 12, fibresPerConnector: 1, ends: 2, fibreClass: 'sm-isp', stageIds: ['rough', 'tie', 'splice', 'test'], notes: '12-fibre ribbon mass-fusion splice onto LC pigtails. Confirm manufacturer and enter datasheet values.', verified: false },
  { id: 'ct-64-mpo16', brand: 'TBC', name: '64F SM - pre-term MPO-16', category: 'fibre', fibreCount: 64, termination: 'pre-term-mpo', fibresPerConnector: 16, ends: 2, fibreClass: 'sm-isp', stageIds: ['rough', 'tie', 'term', 'test'], notes: 'Confirm manufacturer and enter datasheet values.', verified: false },
];

export const GENERIC_RACK_MODELS: RackModel[] = [
  { id: 'rm-generic-600-1200-42', brand: 'Generic', model: '42U 600 x 1200', heightU: 42, widthMm: 600, depthMm: 1200, verified: false },
  { id: 'rm-generic-800-1200-42', brand: 'Generic', model: '42U 800 x 1200', heightU: 42, widthMm: 800, depthMm: 1200, verified: false },
  { id: 'rm-generic-600-1200-48', brand: 'Generic', model: '48U 600 x 1200', heightU: 48, widthMm: 600, depthMm: 1200, verified: false },
];

export function defaultProject(): Project {
  return {
    name: 'New cabling project',
    client: '',
    site: '',
    startDate: new Date().toISOString().slice(0, 10),
    defaultShiftHours: 10,
    // TIA-568.3 maximum allowances as quoted by FOA (see Standards tab).
    budget: { connectorDb: 0.75, spliceDb: 0.3, smIspDbKm: 1.0, smOspDbKm: 0.5, mm850DbKm: 3.5, mm1300DbKm: 1.5 },
    defaultSlackM: 3,
    holdPointMode: 'warn',
  };
}

export function emptyData(): AppData {
  return {
    version: 2,
    project: defaultProject(),
    stages: DEFAULT_STAGES.map((s) => ({ ...s })),
    cableTypes: [...CONTRACT_CABLE_TYPES, ...VERIFIED_CABLE_TYPES].map((c) => ({ ...c })),
    rackModels: [...GENERIC_RACK_MODELS, ...VERIFIED_RACK_MODELS].map((r) => ({ ...r })),
    crews: [],
    workers: [],
    members: [],
    locations: [],
    pathways: [],
    drops: [],
    cables: [],
    drums: [],
    progress: [],
    time: [],
    tests: [],
    attachments: [],
    issues: [],
    diary: [],
    itpTemplates: [structuredClone(DEFAULT_ITP)],
    itpLots: [],
  };
}

/** Job templates: stages + cable-type stage mapping for common job kinds. */
export const JOB_TEMPLATES: { id: string; name: string; description: string; stages: Stage[] }[] = [
  { id: 'fibre', name: 'Fibre backbone (splice / pre-term)', description: 'Roughed in, tied in, spliced, terminated, tested.', stages: DEFAULT_STAGES },
  {
    id: 'copper',
    name: 'Copper horizontal (Cat6/6A)',
    description: 'Roughed in, dressed, terminated (both ends), labelled, certified.',
    stages: [
      { id: 'rough', name: 'Roughed in', measure: 'length', color: '#2a78d6' },
      { id: 'tie', name: 'Dressed', measure: 'length', color: '#eb6834' },
      { id: 'term', name: 'Terminated', measure: 'connectors', color: '#eda100' },
      { id: 'label', name: 'Labelled', measure: 'count', color: '#1baf7a' },
      { id: 'test', name: 'Certified', measure: 'count', color: '#e87ba4' },
    ],
  },
  {
    id: 'power',
    name: 'Power / general cable',
    description: 'Installed, terminated, tested.',
    stages: [
      { id: 'rough', name: 'Installed', measure: 'length', color: '#2a78d6' },
      { id: 'term', name: 'Terminated', measure: 'count', color: '#eda100' },
      { id: 'test', name: 'Tested', measure: 'count', color: '#e87ba4' },
    ],
  },
];
