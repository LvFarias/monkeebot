const normalizeKey = value => String(value ?? '')
  .toLowerCase()
  .replaceAll(/[^a-z0-9]/g, '');

export const DEFLECTOR_OPTIONS = [
  { name: 'T4L Defl.', slots: 2, deflectorPercent: 20, siabPercent: 0 },
  { name: 'T4E Defl.', slots: 2, deflectorPercent: 19, siabPercent: 0 },
  { name: 'T4R Defl.', slots: 1, deflectorPercent: 17, siabPercent: 0 },
  { name: 'T4C Defl.', slots: 0, deflectorPercent: 15, siabPercent: 0 },
  { name: 'T3R Defl.', slots: 1, deflectorPercent: 13, siabPercent: 0 },
  { name: 'T3C Defl.', slots: 0, deflectorPercent: 12, siabPercent: 0 },
  { name: 'T2C Defl.', slots: 0, deflectorPercent: 8, siabPercent: 0 },
  { name: 'T1C Defl.', slots: 0, deflectorPercent: 5, siabPercent: 0 },
  { name: '3 Slot', slots: 3, deflectorPercent: 0, siabPercent: 0 },
];

export const METRO_OPTIONS = [
  { name: 'T4L Metro', slots: 3, elrMult: 1.35 },
  { name: 'T4E Metro', slots: 2, elrMult: 1.3 },
  { name: 'T4R Metro', slots: 1, elrMult: 1.27 },
  { name: 'T4C Metro', slots: 0, elrMult: 1.25 },
  { name: 'T3E Metro', slots: 2, elrMult: 1.2 },
  { name: '3 Slot', slots: 3, elrMult: 1 },
  { name: 'T3R Metro', slots: 1, elrMult: 1.17 },
  { name: 'T3C Metro', slots: 0, elrMult: 1.15 },
  { name: 'T2R Metro', slots: 1, elrMult: 1.12 },
  { name: 'T2C Metro', slots: 0, elrMult: 1.1 },
  { name: 'T1C Metro', slots: 0, elrMult: 1.05 },
  { name: 'T4L SIAB', slots: 2, elrMult: 1, siabPercent: 100 },
  { name: 'T4E SIAB', slots: 2, elrMult: 1, siabPercent: 90 },
  { name: 'T4R SIAB', slots: 1, elrMult: 1, siabPercent: 80 },
];

export const COMPASS_OPTIONS = [
  { name: 'T4L Compass', slots: 2, srMult: 1.5 },
  { name: 'T4E Compass', slots: 2, srMult: 1.4 },
  { name: 'T4R Compass', slots: 1, srMult: 1.35 },
  { name: 'T4C Compass', slots: 0, srMult: 1.3 },
  { name: 'T3R Compass', slots: 1, srMult: 1.22 },
  { name: 'T3C Compass', slots: 0, srMult: 1.2 },
  { name: 'T2C Compass', slots: 0, srMult: 1.1 },
  { name: 'T1C Compass', slots: 0, srMult: 1.05 },
  { name: '3 Slot', slots: 3, srMult: 1 },
  { name: 'T4L SIAB', slots: 2, srMult: 1, siabPercent: 100 },
  { name: 'T4E SIAB', slots: 2, srMult: 1, siabPercent: 90 },
  { name: 'T4R SIAB', slots: 1, srMult: 1, siabPercent: 80 },
];

export const GUSSET_OPTIONS = [
  { name: 'T4L Gusset', slots: 3, chickMult: 1.25, siabPercent: 0 },
  { name: 'T4E Gusset', slots: 2, chickMult: 1.22, siabPercent: 0 },
  { name: 'T2E Gusset', slots: 2, chickMult: 1.12, siabPercent: 0 },
  { name: '3 Slot', slots: 3, chickMult: 1, siabPercent: 0 },
  { name: 'T4C Gusset', slots: 0, chickMult: 1.2, siabPercent: 0 },
  { name: 'T3R Gusset', slots: 1, chickMult: 1.16, siabPercent: 0 },
  { name: 'T3C Gusset', slots: 0, chickMult: 1.15, siabPercent: 0 },
  { name: 'T2C Gusset', slots: 0, chickMult: 1.1, siabPercent: 0 },
  { name: 'T1C Gusset', slots: 0, chickMult: 1.05, siabPercent: 0 },
  { name: 'T4L SIAB', slots: 2, chickMult: 1, siabPercent: 100 },
  { name: 'T4E SIAB', slots: 2, chickMult: 1, siabPercent: 90 },
  { name: 'T4R SIAB', slots: 1, chickMult: 1, siabPercent: 80 },
];

export const IHR_CHALICE_OPTIONS = [
  { name: 'T4L Chalice', slots: 3, ihrMult: 1.4 },
  { name: 'T4E Chalice', slots: 2, ihrMult: 1.35 },
  { name: 'T4C Chalice', slots: 0, ihrMult: 1.3 },
  { name: 'T3E Chalice', slots: 2, ihrMult: 1.25 },
  { name: 'T3R Chalice', slots: 1, ihrMult: 1.23 },
  { name: 'T3C Chalice', slots: 0, ihrMult: 1.2 },
  { name: 'T2E Chalice', slots: 2, ihrMult: 1.15 },
  { name: 'T2C Chalice', slots: 0, ihrMult: 1.1 },
  { name: 'T1C Chalice', slots: 0, ihrMult: 1.05 },
];

export const IHR_MONOCLE_OPTIONS = [
  { name: 'T4L Monocle', slots: 3, ihrMult: 1.3 },
  { name: 'T4E Monocle', slots: 2, ihrMult: 1.25 },
  { name: 'T4C Monocle', slots: 0, ihrMult: 1.2 },
  { name: 'T3C Monocle', slots: 0, ihrMult: 1.15 },
  { name: 'T2C Monocle', slots: 0, ihrMult: 1.1 },
  { name: 'T1C Monocle', slots: 0, ihrMult: 1.05 },
];

export const IHR_DEFLECTOR_OPTIONS = [
  { name: 'T4L Defl.', slots: 2 },
  { name: 'T4E Defl.', slots: 2 },
  { name: 'T4R Defl.', slots: 1 },
  { name: 'T4C Defl.', slots: 0 },
  { name: 'T3R Defl.', slots: 1 },
  { name: 'T3C Defl.', slots: 0 },
  { name: 'T2C Defl.', slots: 0 },
  { name: 'T1C Defl.', slots: 0 },
  { name: '3 Slot', slots: 3 },
  { name: '2 Slot', slots: 2 },
];

export const IHR_SIAB_OPTIONS = [
  { name: 'T4L SIAB', slots: 2, siabPercent: 100 },
  { name: 'T4E SIAB', slots: 2, siabPercent: 90 },
  { name: 'T4R SIAB', slots: 1, siabPercent: 80 },
  { name: 'T4C SIAB', slots: 0, siabPercent: 70 },
  { name: 'T3R SIAB', slots: 1, siabPercent: 60 },
  { name: 'T3C SIAB', slots: 0, siabPercent: 50 },
  { name: '3 Slot', slots: 3, siabPercent: 0 },
  { name: '2 Slot', slots: 2, siabPercent: 0 },
];

const buildLookup = options => new Map(options.map(option => [normalizeKey(option.name), option]));

const DEFLECTOR_LOOKUP = buildLookup(DEFLECTOR_OPTIONS);
const METRO_LOOKUP = buildLookup(METRO_OPTIONS);
const COMPASS_LOOKUP = buildLookup(COMPASS_OPTIONS);
const GUSSET_LOOKUP = buildLookup(GUSSET_OPTIONS);
const IHR_CHALICE_LOOKUP = buildLookup(IHR_CHALICE_OPTIONS);
const IHR_MONOCLE_LOOKUP = buildLookup(IHR_MONOCLE_OPTIONS);
const IHR_DEFLECTOR_LOOKUP = buildLookup(IHR_DEFLECTOR_OPTIONS);
const IHR_SIAB_LOOKUP = buildLookup(IHR_SIAB_OPTIONS);

export const DEFAULT_DEFLECTOR = 'T4L Defl.';
export const DEFAULT_METRO = 'T4L Metro';
export const DEFAULT_COMPASS = 'T4L Compass';
export const DEFAULT_GUSSET = 'T4L Gusset';
export const DEFAULT_IHR_CHALICE = 'T4L Chalice';
export const DEFAULT_IHR_MONOCLE = 'T4L Monocle';
export const DEFAULT_IHR_DEFLECTOR = 'T4L Defl.';
export const DEFAULT_IHR_SIAB = 'T4L SIAB';

export function listArtifactOptions(options) {
  return options.map(option => option.name).join(', ');
}

function findOption(options, lookup, input, fallbackName) {
  const value = String(input ?? '').trim();
  if (!value) return lookup.get(normalizeKey(fallbackName));
  const normalized = normalizeKey(value);
  if (!normalized) return lookup.get(normalizeKey(fallbackName));
  const exact = lookup.get(normalized);
  if (exact) return exact;
  const partialMatches = options.filter(option => normalizeKey(option.name).includes(normalized));
  if (partialMatches.length === 1) return partialMatches[0];
  return null;
}

export function parseDeflector(input) {
  return findOption(DEFLECTOR_OPTIONS, DEFLECTOR_LOOKUP, input, DEFAULT_DEFLECTOR);
}

export function parseMetro(input) {
  return findOption(METRO_OPTIONS, METRO_LOOKUP, input, DEFAULT_METRO);
}

export function parseCompass(input) {
  return findOption(COMPASS_OPTIONS, COMPASS_LOOKUP, input, DEFAULT_COMPASS);
}

export function parseGusset(input) {
  return findOption(GUSSET_OPTIONS, GUSSET_LOOKUP, input, DEFAULT_GUSSET);
}

export function parseIhrChalice(input) {
  return findOption(IHR_CHALICE_OPTIONS, IHR_CHALICE_LOOKUP, input, DEFAULT_IHR_CHALICE);
}

export function parseIhrMonocle(input) {
  return findOption(IHR_MONOCLE_OPTIONS, IHR_MONOCLE_LOOKUP, input, DEFAULT_IHR_MONOCLE);
}

export function parseIhrDeflector(input) {
  return findOption(IHR_DEFLECTOR_OPTIONS, IHR_DEFLECTOR_LOOKUP, input, DEFAULT_IHR_DEFLECTOR);
}

export function parseIhrSiab(input) {
  return findOption(IHR_SIAB_OPTIONS, IHR_SIAB_LOOKUP, input, DEFAULT_IHR_SIAB);
}

export function parseTe(input) {
  const raw = String(input ?? '').trim();
  if (!raw) return 0;
  const cleaned = raw.replaceAll(/[^0-9.-]/g, '');
  if (!cleaned) return 0;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}
