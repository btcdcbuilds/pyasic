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

/** Attenuation class used for loss budgets. */
export type FibreClass = 'sm-isp' | 'sm-osp' | 'mm';

export interface CableType {
  id: ID;
  brand: string;
  name: string;
  partNumber?: string;
  category: CableCategory;
  fibreCount?: number;
  pairCount?: number;
  odMm?: number;
  weightKgKm?: number;
  bendRadiusMm?: number;
  bendRadiusLoadedMm?: number;
  maxPullN?: number;
  jacket?: string;
  termination: Termination;
  ribbonSize?: number;
  fibresPerConnector?: number;
  ends: number;
  fibreClass?: FibreClass;
  stageIds: ID[];
  notes?: string;
  sourceUrl?: string;
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

export type MemberRole = 'admin' | 'supervisor' | 'crew_lead' | 'viewer';

/** A person who uses the app (signs ITPs, logs work). Synced with cloud membership. */
export interface Member {
  id: ID;
  name: string;
  email?: string;
  role: MemberRole;
  company?: string;
  crewId?: ID;
}

export interface Point {
  x: number; // mm in area plan space
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
  uStart: number;
  uSize: number;
  kind: 'fibre-panel' | 'patch-panel' | 'splice-enclosure' | 'cable-manager' | 'equipment' | 'blank';
  ports?: number;
}

/** Areas group things (and can carry a floor plan). Endpoints are where cables start/finish. */
export type LocationKind =
  | 'site'
  | 'building'
  | 'floor'
  | 'room'
  | 'rack'
  | 'cabinet'
  | 'frame'
  | 'splice-enclosure'
  | 'wall-outlet'
  | 'consolidation-point'
  | 'pit'
  | 'manhole'
  | 'pole'
  | 'entry-point'
  | 'junction'
  | 'other';

export const AREA_KINDS: LocationKind[] = ['site', 'building', 'floor', 'room'];
export const RACK_KINDS: LocationKind[] = ['rack', 'cabinet', 'frame'];

export interface FloorPlan {
  attachmentId: ID;
  /** mm per image pixel, from 2-point calibration. */
  mmPerPx: number;
  widthPx: number;
  heightPx: number;
  opacity: number;
}

export interface Location {
  id: ID;
  name: string;
  /** Administration identifier, e.g. TIA-606 style "1A.AD02". */
  code?: string;
  kind: LocationKind;
  parentId?: ID;
  /** Area (building/floor/room) whose plan this point is drawn on. */
  areaId?: ID;
  x?: number;
  y?: number;
  rotation?: 0 | 90 | 180 | 270;
  /** Rack/cabinet properties. */
  modelId?: ID;
  heightU?: number;
  widthMm?: number;
  depthMm?: number;
  devices?: RackDevice[];
  /** Default service loop / slack allowance for cables ending here (m). */
  slackM?: number;
  plan?: FloorPlan;
  notes?: string;
}

export type PathwayKind =
  | 'wire-basket'
  | 'basket-liner'
  | 'tray-solid'
  | 'tray-perforated'
  | 'ladder'
  | 'fibre-raceway'
  | 'trunking'
  | 'conduit'
  | 'duct'
  | 'innerduct'
  | 'riser'
  | 'j-hook'
  | 'catenary'
  | 'direct-buried'
  | 'other';

export interface Pathway {
  id: ID;
  name: string;
  code?: string;
  kind: PathwayKind;
  brand?: string;
  /** Rectangular pathways. */
  widthMm: number;
  depthMm: number;
  /** Round pathways (conduit/duct): internal diameter. */
  diameterMm?: number;
  /** Max fill % (rectangular). Round pathways use NEC Ch.9 Table 1 by cable count unless overridden. */
  fillLimitPct: number;
  fillOverride?: boolean;
  /** Drawn route on an area plan. */
  areaId?: ID;
  points: Point[];
  /** Or a logical link with a measured/estimated length. */
  fromId?: ID;
  toId?: ID;
  lengthM?: number;
  elevationMm?: number;
  notes?: string;
}

/** Where a pathway connects to an endpoint (drop-out, waterfall, conduit entry). */
export interface Drop {
  id: ID;
  pathwayId: ID;
  /** Location id (rack, outlet, pit ...). */
  rackId: ID;
  at: Point;
  entry: 'top-left' | 'top-right' | 'top-centre' | 'rear-left' | 'rear-right' | 'bottom';
  /** Vertical drop length (m) from pathway to entry; added to route length. */
  dropM?: number;
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
  fromPort?: string;
  toPort?: string;
  /** Scheduled / design length in metres. */
  lengthM: number;
  /** Ordered pathways from A to B. */
  pathwayIds: ID[];
  /** Calculated from the route (m), for comparison with the schedule. */
  routeM?: number;
  /** Sequential jacket markings at each end, for measured installed length. */
  markA?: number;
  markB?: number;
  drumId?: ID;
  labelA?: string; // date applied
  labelB?: string;
  notes?: string;
}

export interface Drum {
  id: ID;
  code: string;
  typeId: ID;
  lengthM: number;
  receivedDate?: string;
  /** Receipt inspection (visual / OTDR on reel). */
  receiptTest?: 'pass' | 'fail' | 'not-tested';
  notes?: string;
}

export interface ProgressEntry {
  id: ID;
  date: string;
  crewId: ID;
  cableId: ID;
  stageId: ID;
  qty: number;
  end?: 'A' | 'B';
  notes?: string;
  createdAt: number;
  createdBy?: string;
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

export type TestType = 'olts' | 'otdr' | 'polarity' | 'endface' | 'continuity' | 'copper-cert' | 'splice-loss' | 'reel-otdr' | 'other';

export interface TestResult {
  id: ID;
  cableId: ID;
  date: string;
  type: TestType;
  /** Fibre/pair numbers, e.g. "1-12", "all". */
  fibres?: string;
  direction?: 'A-B' | 'B-A' | 'bi';
  wavelengthNm?: number;
  measuredDb?: number;
  limitDb?: number;
  lengthM?: number;
  result: 'pass' | 'fail' | 'marginal';
  instrument?: string;
  technician?: string;
  notes?: string;
  createdAt: number;
}

export type EntityKind = 'cable' | 'pathway' | 'location' | 'itp' | 'issue' | 'test' | 'diary' | 'project';

export interface Attachment {
  id: ID;
  entity: EntityKind;
  entityId: ID;
  name: string;
  mime: string;
  size: number;
  caption?: string;
  createdAt: number;
  createdBy?: string;
  /** True once the file is in cloud storage. */
  uploaded?: boolean;
}

export type IssueKind = 'defect' | 'punch' | 'ncr' | 'rfi' | 'safety' | 'delay';

export interface Issue {
  id: ID;
  ref: string;
  kind: IssueKind;
  title: string;
  description?: string;
  entity?: EntityKind;
  entityId?: ID;
  status: 'open' | 'in-progress' | 'closed';
  priority: 'low' | 'medium' | 'high';
  raisedBy?: string;
  raisedDate: string;
  assignedCrewId?: ID;
  dueDate?: string;
  closedDate?: string;
  closeout?: string;
}

export interface DiaryEntry {
  id: ID;
  date: string;
  weather?: string;
  notes?: string;
  delays?: string;
  visitors?: string;
  safety?: string;
  createdBy?: string;
}

/** Inspection point codes (meaning set in the template legend). */
export type InspPoint = '' | 'H' | 'W' | 'R' | 'S' | 'I';

export interface ItpItem {
  id: ID;
  ref: string;
  section: string;
  activity: string;
  criteria: string;
  reference: string;
  record: string;
  frequency: string;
  contractor: InspPoint;
  client: InspPoint;
  /** If set, this item must be signed before this stage is logged on the lot's cables. */
  releasesStageId?: ID;
}

export interface ItpTemplate {
  id: ID;
  code: string;
  name: string;
  revision: string;
  scope: string;
  items: ItpItem[];
  notes?: string;
}

export interface ItpSignoff {
  status: 'pending' | 'pass' | 'fail' | 'na';
  by?: string;
  role?: string;
  company?: string;
  date?: string;
  signature?: string; // PNG data URL
  comment?: string;
  clientBy?: string;
  clientDate?: string;
  clientSignature?: string;
}

export interface ItpLot {
  id: ID;
  number: string;
  templateId: ID;
  title: string;
  description?: string;
  cableIds: ID[];
  pathwayIds: ID[];
  locationIds: ID[];
  createdAt: number;
  createdBy?: string;
  signoffs: Record<ID, ItpSignoff>;
  closed?: { by: string; date: string; signature?: string; clientBy?: string; clientDate?: string; clientSignature?: string };
}

export interface Project {
  name: string;
  client: string;
  site: string;
  contractor?: string;
  contractNo?: string;
  startDate: string;
  defaultShiftHours: number;
  /** Loss budget allowances (dB) - defaults from TIA-568.3 as quoted by FOA. */
  budget: { connectorDb: number; spliceDb: number; smIspDbKm: number; smOspDbKm: number; mm850DbKm: number; mm1300DbKm: number };
  /** Default slack per end when an endpoint has none (m). */
  defaultSlackM: number;
  holdPointMode: 'warn' | 'block' | 'off';
  /** Cloud project id once connected. */
  cloudId?: string;
}

export interface AppData {
  version: number;
  project: Project;
  stages: Stage[];
  cableTypes: CableType[];
  rackModels: RackModel[];
  crews: Crew[];
  workers: Worker[];
  members: Member[];
  locations: Location[];
  pathways: Pathway[];
  drops: Drop[];
  cables: CableRun[];
  drums: Drum[];
  progress: ProgressEntry[];
  time: TimeEntry[];
  tests: TestResult[];
  attachments: Attachment[];
  issues: Issue[];
  diary: DiaryEntry[];
  itpTemplates: ItpTemplate[];
  itpLots: ItpLot[];
}

export const COLLECTIONS = [
  'stages',
  'cableTypes',
  'rackModels',
  'crews',
  'workers',
  'members',
  'locations',
  'pathways',
  'drops',
  'cables',
  'drums',
  'progress',
  'time',
  'tests',
  'attachments',
  'issues',
  'diary',
  'itpTemplates',
  'itpLots',
] as const;
export type CollectionKey = (typeof COLLECTIONS)[number];
