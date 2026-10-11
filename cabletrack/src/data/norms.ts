import type { ItpTemplate, PathwayKind } from '../types';

/*
 * Installation norms researched 2026-10-11. All values were taken from web-search extracts
 * of the cited pages (standards themselves are paywalled and were not read). Quoted secondhand
 * unless the source is the standards body. Your project specification takes precedence.
 */

export const PATHWAY_KIND_LABEL: Record<PathwayKind, string> = {
  'wire-basket': 'Wire basket',
  'basket-liner': 'Wire basket with liner',
  'tray-solid': 'Cable tray (solid bottom)',
  'tray-perforated': 'Cable tray (perforated)',
  ladder: 'Cable ladder',
  'fibre-raceway': 'Fibre raceway',
  trunking: 'Trunking / raceway',
  conduit: 'Conduit',
  duct: 'Duct',
  innerduct: 'Innerduct',
  riser: 'Riser sleeve / slot',
  'j-hook': 'J-hooks',
  catenary: 'Catenary',
  'direct-buried': 'Direct buried',
  other: 'Other',
};

export const ROUND_KINDS: PathwayKind[] = ['conduit', 'duct', 'innerduct', 'riser'];
/** Kinds with no meaningful cross-section limit in the app. */
export const OPEN_KINDS: PathwayKind[] = ['j-hook', 'catenary', 'direct-buried'];

/** NEC Chapter 9 Table 1 conduit fill by number of cables (quoted by ExpertCE). */
export function conduitFillLimit(cableCount: number) {
  if (cableCount <= 1) return 53;
  if (cableCount === 2) return 31;
  return 40;
}

export const NORM_SOURCES = {
  conduitFill: 'https://expertce.com/learn-articles/nec-chapter-9-table-1-conduit-fill/',
  trayFill: 'https://www.csemag.com/?p=18463',
  tia569Conduit: 'https://cablinginstall.com/design-install/cabling-installation/article/16468001/some-things-to-remember-when-installing-conduit',
  supports: 'https://www.belden.com/blog/installing-j-hooks-avoid-these-mistakes-to-maintain-network-uptime',
  labelling606: 'https://www.cablinginstall.com/connectivity/article/16465694/boiling-down-the-606-a-labeling-standard',
  identifiers606: 'https://www.slideshare.net/slideshow/network-identification-and-tia606b/22398957',
  lossBudget: 'https://www.thefoa.org/tech/tia568b3.htm',
  tiers: 'https://www.flukenetworks.com/createpdf/en/edocs/olts-otdr-complete-testing-strategy',
  endface: 'https://webstore.iec.ch/en/publication/64254',
  itpDefs: 'https://standards.transport.nsw.gov.au/_entity/annotation/af4f56e6-e0c3-ee11-9079-000d3ad2920b',
  slack: 'https://www.cablinginstall.com/home/article/16469021/service-loops-in-horizontal-cable-runs',
  firestop: 'https://open-exam-prep.com/study-guides/bicsi-inst2-copper/safety-and-professionalism/firestopping-penetrations',
  reelTest: 'https://dot.nv.gov/home/showpublisheddocument/23002/638670905044130000',
  pullGuide: 'https://www.occfiber.com/wp-content/uploads/2017/06/1384377594_OCC-206-2_Installation-General_Guidelines_Rev_B-1.pdf',
  ties: 'https://www.panduit.com/content/dam/panduit/en/products/media/5/75/575/6575/100356575.pdf',
  s009: 'https://www.commsalliance.com.au/wp-content/uploads/2025/06/S009_2020.pdf',
  warrantyCommscope: 'https://zh.commscope.com/globalassets/digizuite/3210-registered-systimax-network-infrastructure-system-tp-113163-en.pdf',
  lengthMarks: 'https://dot.alaska.gov/creg/design/highways/specifications-users/004_CHS_Project_Specific_Specials/By_Topic/SignalInterconnect_Fiber.TrnkRd-662_5-111611.doc',
};

/** Inspection point legend. Definitions from TfNSW quality spec (restating Q6). */
export const POINT_LEGEND: { code: string; name: string; meaning: string }[] = [
  { code: 'H', name: 'Hold point', meaning: 'Work must not proceed past this point without written release by the nominated party.' },
  { code: 'W', name: 'Witness point', meaning: 'Prior notice is given so the party can attend; work may proceed if they do not attend.' },
  { code: 'R', name: 'Review point', meaning: 'Document review (test report, certificate) with no site attendance.' },
  { code: 'S', name: 'Surveillance', meaning: 'Random or periodic monitoring by the party.' },
  { code: 'I', name: 'Inspection', meaning: 'Inspection by the responsible party, recorded on this ITP.' },
];

const it = (
  ref: string,
  section: string,
  activity: string,
  criteria: string,
  reference: string,
  record: string,
  frequency: string,
  contractor: ItpTemplate['items'][number]['contractor'],
  client: ItpTemplate['items'][number]['client'],
  releasesStageId?: string,
) => ({ id: 'itp-' + ref.replace('.', '-'), ref, section, activity, criteria, reference, record, frequency, contractor, client, releasesStageId });

/**
 * Default structured-cabling ITP. Criteria cite their source. Inspection point codes are
 * SUGGESTIONS only (not from any standard) and must be agreed with the client.
 */
export const DEFAULT_ITP: ItpTemplate = {
  id: 'itp-cabling-default',
  code: 'ITP-CAB-01',
  name: 'Structured cabling - fibre & copper installation',
  revision: 'A (draft)',
  scope: 'Supply, installation, termination and testing of communications cabling and pathways',
  notes: 'DRAFT. Inspection point codes are suggestions and must be agreed with the client. Criteria are quoted secondhand from the cited sources; the project specification takes precedence.',
  items: [
    it('1.1', 'Preliminaries', 'Materials approved', 'Cable, connectivity and pathway products match approved submittals / datasheets', 'Project specification', 'Approved submittal register', 'Each product', 'R', 'R'),
    it('1.2', 'Preliminaries', 'Installer registration', 'Installers hold current cabling registration with the endorsements needed for the work (e.g. ACMA Open registration with Optical Fibre / Structured Cabling endorsements)', 'AS/CA S009:2020; Telecommunications (Cabling Provider) Rules', 'Registration card copies', 'Each installer', 'R', 'R'),
    it('2.1', 'Material receipt', 'Drum / reel receipt inspection', 'Visual inspection on delivery; continuity or OTDR of fibres on the reel; length consistent with marking. Reject reel on failure (per project spec)', 'Project spec; e.g. Nevada DOT / FOA practice', 'Drum register; reel test results', 'Each drum', 'I', 'R'),
    it('3.1', 'Pathways', 'Pathway installation', 'Type, size and route per drawings; supports secure; non-continuous supports (J-hooks) at max 1.5 m spacing', 'Drawings; TIA-569 (via Belden / nVent)', 'Inspection photos; this ITP', 'Each pathway section', 'I', 'H', 'rough'),
    it('3.2', 'Pathways', 'Pathway fill', 'Tray/basket fill within 50%; conduit fill per NEC Ch.9 Table 1 (1 cable 53%, 2 cables 31%, >2 cables 40%); stack depth max 150 mm', 'TIA-569-D cl. 9.7.1.1 (via CSE); NEC Ch.9 T1; TIA-569 via UFC 3-580-01', 'App fill report', 'Each pathway', 'I', 'R'),
    it('3.3', 'Pathways', 'Conduit runs', 'Max 30 m and max two 90 degree bends between pull points; bend radius at least 6x internal diameter (10x above 50 mm)', 'TIA-569 (older edition, quoted secondhand)', 'Inspection photos', 'Each conduit run', 'I', 'S'),
    it('3.4', 'Pathways', 'Separation from power', 'Separation from power cabling and EMI sources per the applicable rule (AS/CA S009, EN 50174-2 or project spec)', 'AS/CA S009; EN 50174-2; project spec', 'Inspection photos', 'Each pathway', 'I', 'S'),
    it('3.5', 'Pathways', 'Bonding of metallic pathways', 'Metallic pathways bonded to the telecom bonding system per project spec', 'Project spec; TIA-607', 'Inspection photos', 'Each pathway', 'I', 'S'),
    it('3.6', 'Pathways', 'Firestopping', 'Every rated penetration uses a listed firestop system installed to its tested system detail; firestop labelled on each side', 'Listed system detail; TIA-606 (via cablinginstall / AndCable)', 'Firestop register; photos', 'Each penetration', 'I', 'H'),
    it('4.1', 'Cable installation', 'Pre-pull check', 'Route, cable type, drum and length confirmed; pulling plan uses swivel/breakaway rated at or below the cable installation load', 'Cable datasheet; OCC installation guideline', 'Pull sheet; drum no.', 'Each pull', 'I', '', 'rough'),
    it('4.2', 'Cable installation', 'Pulling', 'Max pulling tension and loaded bend radius per datasheet not exceeded (fallback 15x OD premises / 20x OD OSP under tension)', 'Cable datasheet; TIA-568-B.3 (via FOA)', 'Pull sheet', 'Each pull', 'I', 'S'),
    it('4.3', 'Cable installation', 'Dressing and tie-in', 'Installed bend radius per datasheet (fallback 10x OD); hook-and-loop ties applied loosely; no crushing', 'Cable datasheet; Panduit installation guideline', 'Photos', 'Each pathway section', 'I', 'S'),
    it('4.4', 'Cable installation', 'Slack / service loops', 'Slack left at each end as specified (BICSI TDMM guidance: 3 m in telecom room, 1 m at outlet for fibre)', 'Project spec; BICSI TDMM (via cablinginstall)', 'Photos', 'Each cable', 'I', 'S'),
    it('4.5', 'Cable installation', 'Labelling', 'Both ends labelled with machine-printed labels within 300 mm of the jacket end; identifiers per labelling scheme', 'TIA-606 (606-A wording via cablinginstall); project labelling scheme', 'Labelling schedule; photos', 'Each cable', 'I', 'R'),
    it('4.6', 'Cable installation', 'Installed length', 'Jacket length markings recorded at both ends; installed length = difference of marks', 'Cable marking (e.g. Alaska DOT spec)', 'Cable schedule (marks A/B)', 'Each cable', 'I', 'R'),
    it('5.1', 'Splicing & termination', 'Fusion splicing', 'Splice loss within project limit (TIA-568.3 max 0.3 dB per splice); OTDR splice loss averaged bidirectionally', 'TIA-568.3 (via FOA); Corning AEN003', 'Splice records / OTDR traces', 'Each splice tray', 'I', 'R'),
    it('5.2', 'Splicing & termination', 'Termination / pre-terminated connectors', 'Correct connector type and polarity method; connectors fully seated; dust caps fitted', 'Project spec; polarity method A/B/C', 'Termination schedule', 'Each panel', 'I', 'S'),
    it('5.3', 'Splicing & termination', 'End-face inspection', 'Connector end-faces inspected and clean before mating', 'IEC 61300-3-35', 'Inspection images / report', 'Each connector', 'I', 'R', 'test'),
    it('6.1', 'Testing', 'Tier 1 fibre test (OLTS)', 'Link loss at or below calculated budget (0.75 dB per mated pair, 0.3 dB per splice, attenuation per km); length and polarity recorded', 'TIA-568.3 / AS/NZS 14763.3 (via FOA, Fluke)', 'Tester reports (electronic)', '100% of links', 'I', 'W'),
    it('6.2', 'Testing', 'Tier 2 fibre test (OTDR)', 'Where specified: OTDR traces show event loss and reflectance within project limits', 'Project spec; Fluke testing strategy', 'OTDR traces (.sor)', 'As specified', 'I', 'R'),
    it('6.3', 'Testing', 'Copper permanent link certification', 'PASS to the specified category; permanent link max 90 m', 'TIA-568.2 / AS 11801 (via BICSI study guides)', 'Certification reports', '100% of links', 'I', 'W'),
    it('7.1', 'Handover', 'As-built documentation', 'Cable schedule, test results (electronic), labelling schedule and as-built drawings submitted', 'Project spec', 'Handover pack', 'Once', 'I', 'H'),
    it('7.2', 'Handover', 'Manufacturer warranty registration', 'Where a system warranty applies: registered with BOM and test results within the maker\'s deadline (e.g. CommScope 90 days)', 'Manufacturer warranty terms', 'Warranty certificate', 'Once', 'I', 'R'),
    it('7.3', 'Handover', 'Final inspection', 'All punch list items closed; areas clean', 'Contract', 'Punch list; this ITP', 'Once', 'I', 'H'),
  ],
};

/** Reference notes shown in the Standards tab (in addition to library STANDARDS). */
export const EXTRA_STANDARDS = [
  { topic: 'Labelling identifiers', rule: 'TIA-606: space fs (e.g. 1A); rack fs.xy (1A.AD02, floor grid); panel fs.xy-r; port fs.xy-r:p (ranges allowed, e.g. 1A.AJ05-35:01-06). Labels only need enough of the identifier to be unique in the space.', source: 'TIA-606-B (Panduit deck / cablinginstall)', url: NORM_SOURCES.identifiers606 },
  { topic: 'Label placement', rule: 'Label both ends within 300 mm of the jacket end; machine printed, not handwritten.', source: 'TIA-606-A wording via cablinginstall (not confirmed for -C/-D)', url: NORM_SOURCES.labelling606 },
  { topic: 'Termination colours', rule: 'Orange demarc, green network, purple common equipment, white 1st-level backbone, grey 2nd-level backbone, blue horizontal, brown inter-building, yellow auxiliary, red key telephone (recommended, not required).', source: 'TIA-606-B via cablinginstall / Black Box', url: 'https://www.cablinginstall.com/home/article/16467013/color-coding-cabling' },
  { topic: 'Conduit fill', rule: '1 cable 53%, 2 cables 31%, more than 2 cables 40% of internal area.', source: 'NEC Chapter 9 Table 1 via ExpertCE', url: NORM_SOURCES.conduitFill },
  { topic: 'Conduit runs', rule: 'Max 30 m and two 90 degree bends between pull points; bend radius 6x ID (10x above 50 mm, always 10x for fibre).', source: 'TIA-569 older edition, quoted secondhand', url: NORM_SOURCES.tia569Conduit },
  { topic: 'Supports', rule: 'Non-continuous supports (J-hooks) at max 1.5 m (BICSI 1.2-1.5 m).', source: 'TIA-569-C cl. 9.7 via Belden / nVent', url: NORM_SOURCES.supports },
  { topic: 'Loss budget', rule: 'Link loss = connectors x 0.75 dB + splices x 0.3 dB + length x attenuation (SM inside plant 1.0 dB/km, SM outside plant 0.5 dB/km, MM 3.5 dB/km @850 / 1.5 @1300). Wavelengths: SM 1310/1550, MM 850/1300.', source: 'TIA-568.3 values quoted by FOA (568-B.3 era)', url: NORM_SOURCES.lossBudget },
  { topic: 'Test tiers', rule: 'Tier 1 = OLTS loss vs budget + length + polarity (minimum). Tier 2 = Tier 1 + OTDR trace.', source: 'Fluke / Excel Networking', url: NORM_SOURCES.tiers },
  { topic: 'Splice loss practice', rule: 'Fusion splices typically under 0.1 dB; measure bidirectionally with OTDR and average.', source: 'Corning AN103 / AEN003', url: 'https://www.corning.com/media/worldwide/coc/documents/Fiber/application-notes/AN103.pdf' },
  { topic: 'Slack', rule: 'BICSI guidance: 3 m at telecom room end, 1 m fibre / 0.3 m copper at outlet. TIA-568 does not mandate slack.', source: 'BICSI TDMM via cablinginstall', url: NORM_SOURCES.slack },
  { topic: 'Vertical rise', rule: 'Max vertical rise = (0.5 x long-term load) / cable weight per unit length.', source: 'Corning AEN137', url: 'https://www.corning.com/catalog/coc/documents/application-engineering-notes/AEN137.pdf' },
  { topic: 'Hold / witness / review', rule: 'Hold: do not proceed without written release. Witness: notice given, may proceed if party does not attend. Review: document check.', source: 'TfNSW (restating Q6)', url: NORM_SOURCES.itpDefs },
  { topic: 'Lots', rule: 'A lot is part of the works built under uniform conditions; unless specified, no more than one day\'s production.', source: 'Austroads ATS 1120 / VicRoads Sec 173', url: 'https://austroads.gov.au/__data/assets/word_doc/0036/673839/ATS-1120-21_Quality_Management_Requirements.docx' },
];
