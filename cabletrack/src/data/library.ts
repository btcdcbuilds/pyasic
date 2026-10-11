import type { CableCategory, CableType, PathwayKind, RackModel, Termination } from '../types';

/*
 * Reference data researched 2026-10-11.
 *
 * IMPORTANT: every value below was taken from web-search extracts of the manufacturer page
 * or PDF given in sourceUrl (direct page fetches were blocked from the build environment).
 * Entries are therefore marked verified: false. Check each value against the current
 * datasheet before relying on it, then tick "verified" in the Cable library.
 * Values the source did not give are left undefined, never estimated.
 * Where a maker gives bend DIAMETER (Corning bulk cable) the radius here is half that figure.
 */

export const SOURCE_NOTE =
  'Values taken from web-search extracts of the linked manufacturer page (researched 2026-10-11). Check against the current datasheet before relying on them.';

const FIBRE_SPLICE = ['rough', 'tie', 'splice', 'test'];
const PRE_TERM = ['rough', 'tie', 'term', 'test'];
const COPPER = ['rough', 'tie', 'term', 'test'];

interface Row {
  brand: string;
  name: string;
  pn?: string;
  cat: CableCategory;
  fibres?: number;
  pairs?: number;
  od?: number;
  bend?: number;
  bendLoad?: number;
  pull?: number;
  kgkm?: number;
  jacket?: string;
  term: Termination;
  fpc?: number;
  ribbon?: number;
  url: string;
  notes?: string;
}

function mk(r: Row, i: number): CableType {
  return {
    id: 'lib-' + i,
    brand: r.brand,
    name: r.name,
    partNumber: r.pn,
    category: r.cat,
    fibreCount: r.fibres,
    pairCount: r.pairs,
    odMm: r.od,
    bendRadiusMm: r.bend,
    bendRadiusLoadedMm: r.bendLoad,
    maxPullN: r.pull,
    weightKgKm: r.kgkm,
    jacket: r.jacket,
    termination: r.term,
    fibresPerConnector: r.fpc,
    ribbonSize: r.ribbon,
    ends: 2,
    stageIds: r.cat === 'copper' ? COPPER : r.term === 'pre-term-mpo' ? PRE_TERM : FIBRE_SPLICE,
    notes: [r.notes, SOURCE_NOTE].filter(Boolean).join(' '),
    sourceUrl: r.url,
    verified: false,
  };
}

const ROWS: Row[] = [
  // ---- High fibre count ribbon (contract relevant: 1728F / 864F) ----
  { brand: 'Corning', name: 'RocketRibbon XD I/O Riser LSZH 1728F', pn: 'H28ZQZ-14001R20', cat: 'fibre', fibres: 1728, od: 27.6, bend: 414, bendLoad: 414, pull: 2700, kgkm: 628, jacket: 'LSZH, OFNR-LS riser', term: 'ribbon-splice', ribbon: 12, url: 'https://ecatalog.corning.com/optical-communications/US/en/Fiber-Optic-Cables/Indoor-Outdoor/Indoor-Outdoor-Riser-Cables/RocketRibbon%C2%AE-XD-Indoor-Outdoor-Cable-250,-Riser-LSZH/p/H28ZQZ-14001R20', notes: 'Maker states min bend diameter 828 mm (install and operation); radius shown is half. Long-term tension 890 N. 6 subunits x 288F.' },
  { brand: 'Corning', name: 'RocketRibbon XD I/O Riser LSZH 864F', pn: '864ZQZ-14001R20', cat: 'fibre', fibres: 864, od: 22.8, bend: 342, bendLoad: 342, pull: 2700, kgkm: 416, jacket: 'LSZH, OFNR-LS riser', term: 'ribbon-splice', ribbon: 12, url: 'https://ecatalog.corning.com/optical-communications/US/en/Fiber-Optic-Cables/Indoor-Outdoor/Indoor-Outdoor-Riser-Cables/RocketRibbon%C2%AE-XD-Indoor-Outdoor-Cable-250,-Riser-LSZH/p/864ZQZ-14001R20', notes: 'Maker states min bend diameter 684 mm; radius shown is half. Long-term tension 890 N.' },
  { brand: 'Corning', name: 'RocketRibbon XD Cable 250 outdoor duct 1728F', pn: 'H28ZQ4-14101S53', cat: 'fibre', fibres: 1728, od: 26.0, bend: 390, bendLoad: 390, pull: 2700, kgkm: 481.91, jacket: 'PE outdoor (not indoor rated)', term: 'ribbon-splice', ribbon: 12, url: 'https://ecatalog.corning.com/optical-communications/US/en/Fiber-Optic-Cables/Outdoor/Outdoor-Duct-Cables/RocketRibbon%C2%AE-XD-Cable-250/p/H28ZQ4-14101S53', notes: 'Bend diameter 780 mm per Corning page. CONFLICT: a 2020 distributor copy gives 375 mm radius and 452 kg/km.' },
  { brand: 'Corning', name: 'RocketRibbon HD Cable 250 dielectric 864F', pn: '864ZQ4-14700S53', cat: 'fibre', fibres: 864, od: 22.9, pull: 2700, kgkm: 328.1, jacket: 'Outdoor duct', term: 'ribbon-splice', ribbon: 12, url: 'https://ecatalog.corning.com/optical-communications/US/en/Fiber-Optic-Cables/Outdoor/Outdoor-Duct-Cables/RocketRibbon%C2%AE-HD-Cable-250/p/864ZQ4-14700S53', notes: 'Bend figure not clearly stated as radius or diameter, so left blank.' },
  { brand: 'CommScope', name: 'I/O LSZH Riser Rollable Ribbon 1728F', pn: '760244182', cat: 'fibre', fibres: 1728, od: 25.4, bend: 127, bendLoad: 508, pull: 2670, kgkm: 634, jacket: 'LSZH riser', term: 'ribbon-splice', ribbon: 12, url: 'https://www.commscope.com/product-type/cables/fiber-cables/indoor-cables/item760244182/', notes: 'N-1728-LN-RR-F12YL/8G/99H/C. 12F ribbons, G.657.A2. Long-term tension 800 N.' },
  { brand: 'CommScope', name: 'OSP Rollable Ribbon 1728F', pn: '760239389', cat: 'fibre', fibres: 1728, od: 25.1, kgkm: 460, jacket: 'PE OSP', term: 'ribbon-splice', ribbon: 12, url: 'https://www.commscope.com/product-type/cables/fiber-cables/outside-plant-cables/item760239389/' },
  { brand: 'CommScope', name: 'OSP Rollable Ribbon 864F', pn: '760241354', cat: 'fibre', fibres: 864, od: 21.0, kgkm: 315, jacket: 'PE OSP', term: 'ribbon-splice', ribbon: 12, url: 'https://www.commscope.com/product-type/cables/fiber-cables/outside-plant-cables/item760241354/', notes: '6 subunits x 144F.' },
  { brand: 'Sumitomo Electric Lightwave', name: 'Freeform Ribbon Indoor Riser 1728F', pn: 'SE-8RPP1728-B', cat: 'fibre', fibres: 1728, od: 21.5, bend: 215, bendLoad: 430, pull: 2700, kgkm: 475, jacket: 'Riser', term: 'ribbon-splice', ribbon: 12, url: 'https://sumitomoelectriclightwave.com/product/pliable-indoor-rohs-riser-cable/', notes: 'Maker rule 20x OD installing, 10x OD installed (radii computed). Long-term tension 890 N.' },
  { brand: 'AFL', name: 'Wrapping Tube Cable SWR 864F (250um)', pn: 'LWSE-864-X-C-72-12-00N1D-L', cat: 'fibre', fibres: 864, od: 17.5, kgkm: 215, jacket: 'OSP', term: 'ribbon-splice', ribbon: 12, url: 'https://www.AFLglobal.com/-/media/Project/AFL-Global/Product-Specification-Sheet/fiberOpticCable/250um-WTC-SWR-Cable.pdf' },
  { brand: 'Prysmian', name: 'MassLink 1728F ribbon', cat: 'fibre', fibres: 1728, od: 31.5, kgkm: 749, term: 'ribbon-splice', ribbon: 12, url: 'https://www.prysmian.com/sites/www.prysmian.com/files/media/documents/DS105_MASSLINK_1728_06-17_0.pdf', notes: 'Datasheet lists 31.5 mm/749 kg/km and 35.1 mm/965 kg/km variants; assumed smaller = non-armoured. Confirm.' },
  // ---- Pre-terminated MPO ----
  { brand: 'AFL Hyperscale', name: 'UHFC MPO Trunk 1728F (MPO-12/16/24)', cat: 'fibre', fibres: 1728, od: 21.5, bend: 215, pull: 2700, term: 'pre-term-mpo', fpc: 16, url: 'https://www.aflhyperscale.com/product/uhfc-mpo-trunk-assembly/', notes: 'Pulling grip 50 mm OD standard or 40 mm compact. Long-term tension 810 N. Set connector type per order.' },
  { brand: 'Panduit', name: 'MPO-16 APC trunk 16F small diameter', cat: 'fibre', fibres: 16, od: 5.4, bend: 54, bendLoad: 108, pull: 440, jacket: 'Plenum or LSZH', term: 'pre-term-mpo', fpc: 16, url: 'https://www.panduit.com/content/dam/panduit/en/products/media/0/30/230/7230/111327230.pdf', notes: 'Maker rule 20x OD loaded, 10x OD static (computed). CONFLICT: Spanish sheet gives 400 N.' },
  { brand: 'Corning', name: 'EDGE8 MTP Trunk 16F OS2 plenum', pn: 'GE7E716GPNDDU100F', cat: 'fibre', fibres: 16, od: 7.0, bend: 35, bendLoad: 105, pull: 440, jacket: 'Plenum', term: 'pre-term-mpo', fpc: 16, url: 'https://ecatalog.corning.com/optical-communications/US/en/Fiber-Optic-Cable-Assemblies/Indoor-Cable-Assemblies/Multifiber-Indoor-Cable-Assemblies/EDGE8%C2%AE-MTP%C2%AE-Trunk/p/GE7E716GPNDDU100F', notes: 'Not confirmed whether MTP-16 or 2x MTP-8 connectors.' },
  { brand: 'Corning', name: 'EDGE MTP Trunk 12F OS2', pn: 'G909012GPNDDU080F', cat: 'fibre', fibres: 12, od: 5.5, bend: 27.5, bendLoad: 82.5, pull: 440, term: 'pre-term-mpo', fpc: 12, url: 'https://ecatalog.corning.com/optical-communications/US/en/Products/Fiber-Optic-Cable-Assemblies/Multifiber-Cable-Assemblies/EDGE%E2%84%A2-MTP%C2%AE-Trunk/p/G909012GPNDDU080F' },
  { brand: 'Corning', name: 'EDGE MTP Trunk 24F OS2', pn: 'G909024GPNDDU080F', cat: 'fibre', fibres: 24, od: 7.7, bend: 38.5, bendLoad: 115.5, pull: 660, term: 'pre-term-mpo', fpc: 12, url: 'https://ecatalog.corning.com/optical-communications/US/en/Products/Fiber-Optic-Cable-Assemblies/Multifiber-Cable-Assemblies/EDGE%E2%84%A2-MTP%C2%AE-Trunk/p/G909024GPNDDU080F' },
  { brand: 'Corning', name: 'EDGE MTP Trunk 144F OM4', pn: 'G7575E4QPNDDU100F', cat: 'fibre', fibres: 144, od: 12.5, bend: 62.5, bendLoad: 187.5, pull: 660, term: 'pre-term-mpo', fpc: 12, url: 'https://ecatalog.corning.com/optical-communications/US/en/Fiber-Optic-Cable-Assemblies/Indoor-Cable-Assemblies/Multifiber-Indoor-Cable-Assemblies/EDGE%E2%84%A2-MTP%C2%AE-Trunk/p/G7575E4QPNDDU100F' },
  // ---- Other fibre ----
  { brand: 'Corning', name: 'ALTOS Loose Tube Gel-Free 144F OS2', pn: '144EU4-T4100D20', cat: 'fibre', fibres: 144, od: 15.8, bend: 158, bendLoad: 237, pull: 2700, kgkm: 162, jacket: 'PE outdoor', term: 'single-splice', url: 'https://ecatalog.corning.com/optical-communications/US/en/Fiber-Optic-Cables/Outdoor/Outdoor-Duct-Cables/ALTOS%C2%AE-Loose-Tube,-Gel-Free-Cable/p/144EU4-T4100D20', notes: 'Bend diameters 474 mm install / 316 mm operating; radii shown are half.' },
  { brand: 'Corning', name: 'MIC Tight-Buffered Riser 24F OM4', pn: '024T81-33190-24', cat: 'fibre', fibres: 24, od: 7.35, bend: 73.5, bendLoad: 110.25, pull: 1320, kgkm: 47, jacket: 'OFNR riser', term: 'field-connector', fpc: 1, url: 'https://ecatalog.corning.com/optical-communications/US/en/Fiber-Optic-Cables/Indoor/Indoor-Riser-Cables/MIC%C2%AE-Tight-Buffered-Cable,-Riser/p/024T81-33190-24' },
  // ---- Copper ----
  { brand: 'Belden', name: '2412 Cat6+ U/UTP CMR', pn: '2412', cat: 'copper', pairs: 4, od: 5.69, bend: 25, bendLoad: 57.2, pull: 111, kgkm: 33, jacket: 'CMR (PVC)', term: 'rj45', url: 'https://catalog.belden.com/techdata/EN/2412_techdata.pdf', notes: 'Pull 25 lbf converted to N.' },
  { brand: 'Panduit', name: 'TX6000 Cat6 U/UTP CMR', pn: 'PUR6004BU-W', cat: 'copper', pairs: 4, od: 6.2, bend: 24, pull: 110, jacket: 'CMR', term: 'rj45', url: 'https://www.panduit.com/en/products/copper-systems/bulk-copper-cable/enterprise-data-center-copper-cable/pur6004bu-w.html', notes: 'ASEAN listing (PUR6004BU-FE) shows 5.7 mm OD, 22 mm bend.' },
  { brand: 'Excel Networking', name: 'Cat6 U/UTP LSOH Dca', pn: '100-071', cat: 'copper', pairs: 4, od: 6.2, jacket: 'LSOH, Euroclass Dca', term: 'rj45', url: 'https://documents.excel-networking.com/datasheets/100-071' },
  { brand: 'CommScope', name: 'GigaSPEED X10D 2091B Cat6A U/UTP CMP', pn: '2091B', cat: 'copper', pairs: 4, od: 7.239, pull: 111, kgkm: 60.568, jacket: 'CMP', term: 'rj45', url: 'https://www.commscope.com/product-type/cables/twisted-pair-cables/category-6a-cables/2091b/', notes: 'Pull 25 lb converted to N.' },
  { brand: 'Belden', name: '10GXS Cat6A U/UTP CMR', pn: '10GXS12', cat: 'copper', pairs: 4, od: 6.99, bend: 31.8, bendLoad: 69.9, pull: 111, kgkm: 52, jacket: 'CMR', term: 'rj45', url: 'https://catalog.belden.com/techdata/EN/10GXS12_techdata.pdf' },
  { brand: 'Panduit', name: 'TX6A Cat6A U/UTP FEP plenum', pn: 'PUP6AS04 family', cat: 'copper', pairs: 4, od: 6.4, bend: 25.6, pull: 110, jacket: 'CMP (FEP)', term: 'rj45', url: 'https://www.panduit.com/content/dam/panduit/en/products/media/8/08/908/9908/102199908.pdf', notes: 'Maker rule 4x OD (computed).' },
  { brand: 'Excel Networking', name: 'Cat6A U/UTP 23AWG LSOH Dca', pn: '100-219-WT', cat: 'copper', pairs: 4, od: 7.0, kgkm: 48, jacket: 'LSOH, Euroclass Dca', term: 'rj45', url: 'https://documents.excel-networking.com/datasheets/100-219-WT', notes: 'OD stated as approx. 7 mm.' },
  { brand: 'Siemon', name: 'Cat6A F/UTP LSOH (International)', cat: 'copper', pairs: 4, od: 6.99, bend: 27, pull: 110, jacket: 'LSOH', term: 'rj45', url: 'https://files.siemon.com/int-download-product-specsheets/siemon-category6a_futp_cable_international_spec-sheet.pdf' },
  { brand: 'Siemon', name: 'Cat6A U/FTP (International)', cat: 'copper', pairs: 4, od: 7.0, bend: 56, pull: 80, term: 'rj45', url: 'https://files.siemon.com/en/specsheet/siemon-category-6a-u-ftp-cable-international_spec-sheet.pdf' },
  { brand: 'Nexans', name: 'LANmark-6A F1/UTP AWG23 LSZH', pn: 'N100.624G-OD', cat: 'copper', pairs: 4, od: 7.5, bend: 30, bendLoad: 60, pull: 100, kgkm: 52, jacket: 'LSZH', term: 'rj45', url: 'https://telecom-data.nexans.com/en/products/Data-Network-Solutions/Copper-LAN-Systems0/Copper-cables/LANmark-6A29949/product~N100.624G-OD~.html' },
  { brand: 'Leviton / Berk-Tek', name: 'LANmark-10G FTP Cat6A F/UTP plenum', cat: 'copper', pairs: 4, od: 6.985, bend: 27.94, pull: 110, jacket: 'CMP', term: 'rj45', url: 'https://leviton.com/content/dam/leviton/network-solutions/product_documents/product_specification/Leviton-Spec-LANMARK-10G-FTP-Plenum-Cable.pdf', notes: 'Weight on sheet is internally inconsistent, left blank.' },
];

export const VERIFIED_CABLE_TYPES: CableType[] = ROWS.map(mk);

const VR = 'https://www.vertiv.com/globalassets/products/facilities-enclosures-and-racks/racks-and-containment/vertiv-vr-rack-emea-en.pdf';
export const VERIFIED_RACK_MODELS: RackModel[] = (
  [
    ['Vertiv', 'VR Rack VR3100', 'VR3100', 42, 600, 1100, 'https://www.vertiv.com/en-us/products-catalog/facilities-enclosures-and-racks/racks-and-containment/vr3100/'],
    ['Vertiv', 'VR Rack VR3300', 'VR3300', 42, 600, 1200, VR],
    ['Vertiv', 'VR Rack VR3107', 'VR3107', 48, 600, 1100, VR],
    ['Vertiv', 'VR Rack VR3307', 'VR3307', 48, 600, 1200, VR],
    ['Vertiv', 'VR Rack VR3150 (networking)', 'VR3150', 42, 800, 1100, 'https://www.vertiv.com/495e5c/globalassets/products/facilities-enclosures-and-racks/racks-and-containment/vertiv-vr-rack2/vertiv-vr3150-submittal-drawing.pdf'],
    ['APC', 'NetShelter SX AR3100', 'AR3100', 42, 600, 1070, 'https://www.se.com/us/en/product/AR3100/apc-netshelter-sx-server-rack-enclosure-42u-black-1991h-x-600w-x-1070d-mm-taa/'],
    ['APC', 'NetShelter SX AR3150', 'AR3150', 42, 750, 1070, 'https://www.se.com/us/en/product/AR3150/apc-netshelter-sx-server-rack-enclosure-42u-black-1991-4h-x-750w-x-1070d-mm/'],
    ['APC', 'NetShelter SX AR3300', 'AR3300', 42, 600, 1200, 'https://www.se.com/us/en/product/AR3300/taa-baacots-apc-netshelter-sx-server-rack-enclosure-42u-black-1991h-x-600w-x-1200d-mm/'],
    ['APC', 'NetShelter SX AR3350', 'AR3350', 42, 750, 1200, 'https://www.se.com/us/en/product/AR3350/apc-netshelter-sx-server-rack-enclosure-42u-black-1991h-x-750w-x-1200d-mm-taa/'],
    ['APC', 'NetShelter SX AR3107', 'AR3107', 48, 600, 1070, 'https://www.apc.com/us/en/product/AR3107/apc-netshelter-sx-server-rack-enclosure-48u-black-2258h-x-600w-x-1070d-mm-taa/'],
    ['APC', 'NetShelter SX AR3307', 'AR3307', 48, 600, 1200, 'https://www.se.com/us/en/product/AR3307/apc-netshelter-sx-server-rack-enclosure-48u-black-2258h-x-600w-x-1200d-mm-taa/'],
    ['Panduit', 'FlexFusion XG 600 x 48RU x 1200', 'XG64822BS0001', 48, 600, 1200, 'https://www.panduit.com/en/products/cabinets-thermal-management-racks-enclosures/cabinets-accessories/cabinets/xg64822bs0001.html'],
    ['Panduit', 'FlexFusion XG 800 x 42RU x 1200', 'XG84222BS0001', 42, 800, 1200, 'https://www.panduit.com/en/products/cabinets-thermal-management-racks-enclosures/cabinets-accessories/cabinets/xg84222bs0001.html'],
    ['Rittal', 'TS IT 42U server cabinet', '5510110', 42, 597, 1224, 'https://se.rs-online.com/web/p/server-cabinets/8262760'],
  ] as const
).map(([brand, model, pn, u, w, d, url], i) => ({ id: 'rm-lib-' + i, brand, model, partNumber: pn, heightU: u, widthMm: w, depthMm: d, sourceUrl: url, verified: false }));

export interface PathwayPreset {
  brand: string;
  productLine: string;
  widthMm: number;
  depthMm: number;
  kind: PathwayKind;
  sourceUrl: string;
  note?: string;
}

const CABLOFIL = 'https://assets.gordonelectricsupply.com/datasheets/ts/LegrandNorthAmerica-Cablofil_00347_A4-A7_A11_A84_CAT.pdf';
const BLINE = 'https://www.eaton.com/content/dam/eaton/products/support-systems/cable-management/flextray-wire-basket-section-cable-tray-catalog.pdf';
const range = (brand: string, line: string, widths: number[], depth: number, kind: PathwayKind, url: string, note?: string): PathwayPreset[] =>
  widths.map((w) => ({ brand, productLine: line, widthMm: w, depthMm: depth, kind, sourceUrl: url, note }));

export const PATHWAY_PRESETS: PathwayPreset[] = [
  ...range('Legrand Cablofil', 'CF54', [50, 100, 150, 200, 300, 450, 500, 600], 54, 'wire-basket', CABLOFIL),
  ...range('Legrand Cablofil', 'CF105', [100, 150, 200, 300, 450, 500, 600], 105, 'wire-basket', CABLOFIL),
  ...range('OBO Bettermann', 'GR-Magic 55', [50, 100, 150, 200, 300, 400, 450, 500, 600], 55, 'wire-basket', 'https://kz.obo-bettermann.com/en/products/mesh-cable-tray-gr-magic-55-g-3000-150-55-3-9-63-yes-6001444.html'),
  ...range('OBO Bettermann', 'GR-Magic 105', [100, 150, 200, 300, 400, 500, 600], 105, 'wire-basket', 'https://www.obo-bettermann.com/en-xi/products/mesh-cable-tray-gr-magic-105-g-3000-200-105-4-8-175-no-6002406.html'),
  ...range('Eaton B-Line', 'Flextray 2in (min/max width)', [50, 800], 60, 'wire-basket', BLINE, 'Catalogue gives a width range; enter your exact width.'),
  ...range('Eaton B-Line', 'Flextray 4in (min/max width)', [100, 750], 111, 'wire-basket', BLINE, 'Catalogue gives a width range; enter your exact width.'),
  ...range('Eaton B-Line', 'Flextray 6in (min/max width)', [200, 600], 162, 'wire-basket', BLINE, 'Catalogue gives a width range; enter your exact width.'),
  ...range('Panduit', 'Wyr-Grid (overall height)', [203, 305, 457, 610, 762], 53.1, 'wire-basket', 'https://www.panduit.com/en/products/wire-routing-management-protection/wire-mesh-cable-tray-systems/wire-mesh-pathways/wg18bl10.html', 'Height is overall pathway height; optional sidewalls 50/102/152 mm.'),
  { brand: 'Panduit', productLine: 'FiberRunner 4x4 (overall)', widthMm: 139.7, depthMm: 112.8, kind: 'fibre-raceway', sourceUrl: 'https://www.panduit.com/en/products/wire-routing-management-protection/fiber-routing-systems/fiber-routing-channel-covers/fr4x4yl6.html', note: 'Overall, not internal. Spec sheet gives 128.3 mm width (conflict).' },
  { brand: 'Panduit', productLine: 'FiberRunner 6x4 (overall)', widthMm: 167.1, depthMm: 112.8, kind: 'fibre-raceway', sourceUrl: 'https://www.panduit.com/en/products/wire-routing-management-protection/fiber-routing-systems/fiber-routing-channel-covers/fr6x4yl6.html', note: 'Overall, not internal.' },
  { brand: 'Panduit', productLine: 'FiberRunner 12x4 (overall)', widthMm: 341.9, depthMm: 113, kind: 'fibre-raceway', sourceUrl: 'https://www.panduit.com/en/products/wire-routing-management-protection/fiber-routing-systems/fiber-routing-channel-covers/fr12x4yl6.html', note: 'Overall, not internal.' },
];

/** Default design limit for pathway fill. */
export const DEFAULT_FILL_LIMIT_PCT = 50;

export const FILL_GUIDANCE =
  'Fill = total cable cross-section area / usable pathway area. Default limit 50%: TIA-569 (as quoted by Leviton) designs for 25% initial fill with growth to 50% max; NEC 392.22 allows 50% for data cable in ventilated tray (40% solid bottom); EN 50174-2 sets 40% initial. TIA-569 also limits fill depth to 150 mm. Pills turn amber above 80% of your limit and red above it. Set the limit per pathway to suit your spec.';

export interface Guidance {
  topic: string;
  rule: string;
  source: string;
  url: string;
}

export const STANDARDS: Guidance[] = [
  { topic: 'Tray fill', rule: 'Design and install to max 25% fill, allow growth to max 50%. No standard for cable managers; Leviton recommends 35% rear / 30% front.', source: 'TIA-569, quoted by Leviton app note', url: 'https://leviton.com/content/dam/leviton/network-solutions/product_documents/application_note/Leviton_AppNote_MaxCableFillRatiosinCableManagers.pdf' },
  { topic: 'Tray fill depth', rule: 'Maximum fill depth of any cable tray is 150 mm (6 in).', source: 'TIA-569, quoted in DoD UFC 3-580-01', url: 'https://www.wbdg.org/FFC/DOD/UFC/ARCHIVES/ufc_3_580_01_2016_c1.pdf' },
  { topic: 'Tray fill (NEC)', rule: 'Data/control cable: total cable area no more than 50% of ladder/ventilated tray area; 40% for solid bottom.', source: 'NEC 392.22(A)(2)/(A)(4), quoted by Legrand', url: 'https://submittalbuilder.legrand.us/loadtable/' },
  { topic: 'Pathway fill (EN)', rule: 'Initial cable quantity no more than 40% of usable pathway cross-section, cables kept below sidewalls.', source: 'BS EN 50174-2:2009+A2:2014 (secondhand copy)', url: 'https://www.slideshare.net/slideshow/bs-en-5017422009-a22014pdf/259819422' },
  { topic: 'Bend radius default (EN)', rule: 'Where the maker gives none: 8x OD for 4-pair balanced cable, 10x OD for optical fibre and coax.', source: 'BS EN 50174-2 (secondhand copy)', url: 'https://www.slideshare.net/slideshow/bs-en-5017422009-a22014pdf/259819422' },
  { topic: 'Bend radius - fibre', rule: 'Inside plant 2/4F: 25 mm no load, 50 mm pulling. Premises backbone: 10x OD no load, 15x OD at rated tension. OSP: 10x OD no load, 20x OD at rated tension.', source: 'TIA-568-B.3, quoted by Fiber Optic Association', url: 'https://www.thefoa.org/tech/tia568b3.htm' },
  { topic: 'Bend radius - ribbon', rule: 'Stranded ribbon cables 1728-3456F: min bend radius 15x OD during installation and operation.', source: 'Corning generic spec PGS178', url: 'https://www.corning.com/catalog/coc/documents/generic-specifications/PGS178.pdf' },
  { topic: 'Bend radius - copper', rule: '4-pair UTP: 4x OD minimum (no load). Patch cords: 4x cord diameter.', source: 'TIA-568, quoted by Elliott Electric and Siemon', url: 'https://www.elliottelectric.com/StaticPages/ElectricalReferences/DataComm/minimum_bending.aspx' },
  { topic: 'Ties / hook-and-loop', rule: 'Apply hook-and-loop ties loosely and at random intervals to avoid pinching or crushing jackets. No numeric spacing is given by the maker; follow the project spec.', source: 'Panduit installation guideline (TIA-568-C.2 / TIA-569-C)', url: 'https://www.panduit.com/content/dam/panduit/en/products/media/5/75/575/6575/100356575.pdf' },
  { topic: 'Power separation (EN 50174-2:2000)', rule: 'Unscreened power vs unscreened IT: 200 mm no divider, 100 mm aluminium divider, 50 mm steel divider. Later editions use segregation classes; check current edition and BS 6701.', source: 'UK guidance summary of EN 50174-2:2000', url: 'https://www.cablemonkey.co.uk/img/cms/ElectricalDistance.pdf' },
  { topic: 'MPO-16 connector', rule: '16 fibres per row at 0.25 mm pitch; guide pin pitch 5.3 mm vs 4.6 mm on standard 12F MT, same external footprint. TIA-604-18 (FOCIS 18).', source: 'US Conec MTP-16 handout', url: 'https://www.usconec.com/media/1i4pg2b5/mtp-16_connector_handout.pdf' },
  { topic: 'Ribbon splice trays', rule: 'Corning OSE-ST-3-TQ: up to 12 mass-fusion 12F ribbon splices (144 fibres) per tray; OSE-ST-3: 6. TE/CommScope FOSC A/B tray 72F, C tray 144F.', source: 'Corning eCatalog; TE datasheet', url: 'https://ecatalog.corning.com/optical-communications/US/en/Fiber-Optic-Hardware/Cabinets/Optical-Splice-Enclosure-(OSE)-Universal/p/optical-splice-enclosure-ose-universal' },
];
