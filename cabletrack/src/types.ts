export type ID = string;

/** How progress on a stage is measured for a cable. */
export type StageMeasure = 'length' | 'fibres' | 'connectors' | 'count';

/** A configurable work activity, e.g. Rough-in, Tie-in, Splice, Terminate, Test. */
export interface Stage {
  id: ID;
  name: string;
  measure: StageMeasure;
  color: string;
}

export type CableCategory = 'fibre' | 'copper' | 'power' | 'other';

export type Termination =
  | 'none'
  | 'ribbon-splice'
  | 'single-splice'
  | 'pre-term-mpo'
  | 'field-connector'
  | 'rj45'
  | 'other';

export interface CableType {
  id: ID;
  brand: string;
  name: string;
  partNumber?: string;
  category: CableCategory;
  /** Fibre strands (fibre) or pairs (copper). */
  fibreCount?: number;
  pairCount?: number;
  odMm?: number;
  weightKgKm?: number;
  /** Minimum installed (static, unloaded) bend radius. */
  bendRadiusMm?: number;
  /** Minimum bend radius during installation (under load). */
  bendRadiusLoadedMm?: number;
  maxPullN?: number;
  jacket?: string;
  termination: Termination;
  /** Fibres per ribbon, for ribbon splice counts (e.g. 12). */
  ribbonSize?: number;
  /** Fibres per connector, for MPO counts (e.g. 16 for MPO-16, 12 for MPO-12, 1 for LC). */
  fibresPerConnector?: number;
  /** Number of cable ends spliced/terminated/tested (usually 2). */
  ends: number;
  /** Stages that apply to this cable type. Empty = all stages. */
  stageIds: ID[];
  notes?: string;
  sourceUrl?: string;
  /** True when spec values were checked against a manufacturer source. */
  verified: boolean;
}

export interface Crew {
  id: ID;
  name: string;
  color: string;
}

export interface Worker {
  id: ID;
  name: string;
  role: string;
  crewId?: ID;
  active: boolean;
}

export interface Point {
  x: number; // mm in floor plan space
  y: number;
}

export interface RackModel {
  id: ID;
  brand: string;
  model: string;
  partNumber?: string;
  heightU: number;
  widthMm: number;
  depthMm: number;
  sourceUrl?: string;
  verified: boolean;
}

export interface RackDevice {
  id: ID;
  name: string;
  uStart: number; // bottom U (1-based)
  uSize: number;
  kind: 'fibre-panel' | 'patch-panel' | 'splice-enclosure' | 'cable-manager' | 'equipment' | 'blank';
  /** Number of ports / connectors the device offers. */
  ports?: number;
}

export interface Rack {
  id: ID;
  name: string;
  building: string;
  room: string;
  row: string;
  modelId?: ID;
  heightU: number;
  widthMm: number;
  depthMm: number;
  x: number; // centre, mm
  y: number;
  rotation: 0 | 90 | 180 | 270;
  devices: RackDevice[];
}

export type PathwayKind = 'wire-basket' | 'solid-tray' | 'ladder' | 'fibre-raceway' | 'conduit' | 'basket-liner';

export interface Pathway {
  id: ID;
  name: string;
  kind: PathwayKind;
  brand?: string;
  widthMm: number;
  depthMm: number;
  /** Max allowed fill percentage of cross-section (design limit). */
  fillLimitPct: number;
  /** Polyline in floor plan space (mm). */
  points: Point[];
  /** Height above finished floor, mm (informational). */
  elevationMm?: number;
  notes?: string;
}

/** A drop from a pathway into a rack (waterfall / drop-out). */
export interface Drop {
  id: ID;
  pathwayId: ID;
  rackId: ID;
  /** Point on the pathway where the drop leaves it. */
  at: Point;
  entry: 'top-left' | 'top-right' | 'top-centre' | 'rear-left' | 'rear-right';
  notes?: string;
}

export interface CableRun {
  id: ID;
  tag: string;
  typeId: ID;
  fromRackId?: ID;
  toRackId?: ID;
  fromLabel: string;
  toLabel: string;
  /** Design / scheduled length in metres. */
  lengthM: number;
  pathwayIds: ID[];
  notes?: string;
}

export interface ProgressEntry {
  id: ID;
  date: string; // YYYY-MM-DD
  crewId: ID;
  cableId: ID;
  stageId: ID;
  /** Quantity in the stage's unit (metres, fibres, connectors or count). */
  qty: number;
  notes?: string;
  createdAt: number;
}

export interface TimeEntry {
  id: ID;
  date: string;
  workerId: ID;
  crewId?: ID;
  hours: number;
  notes?: string;
  createdAt: number;
}

export interface Project {
  name: string;
  client: string;
  site: string;
  startDate: string;
  defaultShiftHours: number;
}

export interface AppData {
  version: number;
  project: Project;
  stages: Stage[];
  cableTypes: CableType[];
  rackModels: RackModel[];
  crews: Crew[];
  workers: Worker[];
  racks: Rack[];
  pathways: Pathway[];
  drops: Drop[];
  cables: CableRun[];
  progress: ProgressEntry[];
  time: TimeEntry[];
}
