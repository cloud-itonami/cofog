export const SCHEMA_VERSION = "cofog-0220/v1" as const;

export const EVENT_KINDS = [
  "alert-issued",
  "alert-updated",
  "alert-cancelled",
  "shelter-status",
  "facility-outage",
  "resource-request",
] as const;

export type EventKind = (typeof EVENT_KINDS)[number];

export const HAZARD_KINDS = [
  "air-raid",
  "missile-threat",
  "explosion-risk",
  "infrastructure-outage",
  "all-hazards",
] as const;

export type HazardKind = (typeof HAZARD_KINDS)[number];

export type AdministrativeArea = {
  kind: "administrative-region";
  countryCode: string;
  code: string;
};

export type CivilEvent = {
  schemaVersion: typeof SCHEMA_VERSION;
  eventId: string;
  kind: EventKind;
  authorityId: string;
  issuedAt: string;
  effectiveAt: string;
  expiresAt: string;
  area: AdministrativeArea;
  sourceUrl: string;
  hazard?: {
    kind: HazardKind;
    severity: "advisory" | "warning" | "extreme";
  };
  instructions?: string[];
  referencesEventId?: string;
  status?: "available" | "limited" | "unavailable";
  capacityBand?: "none" | "low" | "medium" | "high";
  resourceKind?: "water" | "power" | "heating" | "communications" | "nonclinical-supplies";
  summary?: string;
};

export type SignedCivilEvent = {
  event: CivilEvent;
  signature: string;
};

export type Authority = {
  authorityId: string;
  publicKeyPem: string;
  allowedOrigins: string[];
};

export type AuthorityRegistry = ReadonlyMap<string, Authority>;

export type HoldReason =
  | "invalid-shape"
  | "prohibited-field"
  | "unknown-authority"
  | "source-origin-not-allowed"
  | "invalid-signature"
  | "invalid-time-window"
  | "expired"
  | "issued-in-future"
  | "conflicting-event-id"
  | "referenced-alert-not-found"
  | "reference-authority-mismatch"
  | "reference-area-mismatch"
  | "reference-time-regression";

export type Decision =
  | { outcome: "commit"; event: CivilEvent; proposal: DisseminationProposal }
  | { outcome: "noop"; eventId: string; reason: "duplicate" }
  | { outcome: "hold"; eventId?: string; reasons: HoldReason[] };

export type DisseminationProposal = {
  effect: "propose";
  operation:
    | "publish-civilian-warning"
    | "publish-official-all-clear"
    | "publish-shelter-status"
    | "publish-facility-outage"
    | "coordinate-nonclinical-resource";
  eventId: string;
  area: AdministrativeArea;
  expiresAt: string;
  requiresHumanApproval: boolean;
};

export const PROHIBITED_KEYS = new Set([
  "latitude",
  "longitude",
  "lat",
  "lon",
  "coordinates",
  "trajectory",
  "predictedimpact",
  "interceptpoint",
  "interceptor",
  "weapon",
  "weaponassignment",
  "target",
  "targetcoordinates",
  "launchsite",
  "sensortrack",
  "militaryunit",
  "friendlyforce",
  "personid",
  "deviceid",
  "userlocation",
]);

const PROHIBITED_TEXT = [
  /\btrajectory\b/i,
  /\bintercept(?:or|ion| point)?\b/i,
  /\btarget coordinates?\b/i,
  /\bweapon assignment\b/i,
  /\blaunch site\b/i,
  /\bsensor track\b/i,
  /\bmilitary unit\b/i,
  /\bfriendly force\b/i,
];

const BASE_EVENT_KEYS = new Set([
  "schemaVersion", "eventId", "kind", "authorityId", "issuedAt", "effectiveAt", "expiresAt",
  "area", "sourceUrl", "hazard", "instructions", "referencesEventId", "status", "capacityBand",
  "resourceKind", "summary",
]);

export function canonicalJson(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

export function findProhibitedKeys(value: unknown, found = new Set<string>()): string[] {
  if (typeof value === "string") {
    if (PROHIBITED_TEXT.some((pattern) => pattern.test(value))) found.add("prohibited-text");
    return [...found].sort();
  }
  if (value === null || typeof value !== "object") return [...found].sort();
  if (Array.isArray(value)) {
    value.forEach((item) => findProhibitedKeys(item, found));
    return [...found].sort();
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const normalized = key.toLowerCase().replace(/[-_]/g, "");
    if (PROHIBITED_KEYS.has(normalized)) found.add(key);
    findProhibitedKeys(child, found);
  }
  return [...found].sort();
}

function isIsoInstant(value: unknown): value is string {
  return typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    Number.isFinite(Date.parse(value));
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isHttpsUrl(value: unknown): value is string {
  if (!nonEmptyString(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function validCivilEventShape(value: unknown): value is CivilEvent {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const event = value as Partial<CivilEvent>;
  const presentKeys = Object.keys(record).filter((key) => record[key] !== undefined);
  if (presentKeys.some((key) => !BASE_EVENT_KEYS.has(key))) return false;
  if (
    event.schemaVersion !== SCHEMA_VERSION ||
    !nonEmptyString(event.eventId) || event.eventId.length > 128 ||
    !EVENT_KINDS.includes(event.kind as EventKind) ||
    !nonEmptyString(event.authorityId) || event.authorityId.length > 128 ||
    !isIsoInstant(event.issuedAt) ||
    !isIsoInstant(event.effectiveAt) ||
    !isIsoInstant(event.expiresAt) ||
    !isHttpsUrl(event.sourceUrl)
  ) return false;

  const commonKeys = ["schemaVersion", "eventId", "kind", "authorityId", "issuedAt", "effectiveAt", "expiresAt", "area", "sourceUrl", "summary"];
  const kindKeys: Record<EventKind, string[]> = {
    "alert-issued": ["hazard", "instructions"],
    "alert-updated": ["hazard", "instructions", "referencesEventId"],
    "alert-cancelled": ["referencesEventId", "instructions"],
    "shelter-status": ["status", "capacityBand", "instructions"],
    "facility-outage": ["status", "resourceKind", "instructions"],
    "resource-request": ["resourceKind", "instructions"],
  };
  const allowedForKind = new Set([...commonKeys, ...kindKeys[event.kind as EventKind]]);
  if (presentKeys.some((key) => !allowedForKind.has(key))) return false;

  if (
    !event.area ||
    Object.keys(event.area).some((key) => !["kind", "countryCode", "code"].includes(key)) ||
    event.area.kind !== "administrative-region" ||
    !/^[A-Z]{2}$/.test(event.area.countryCode ?? "") ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{1,63}$/.test(event.area.code ?? "")
  ) return false;

  if (event.instructions && (!Array.isArray(event.instructions) || event.instructions.length > 8 ||
      event.instructions.some((x) => !nonEmptyString(x) || x.length > 500))) {
    return false;
  }
  if (event.summary && event.summary.length > 1000) return false;

  if (["alert-issued", "alert-updated"].includes(event.kind)) {
    if (!event.hazard || Object.keys(event.hazard).some((key) => !["kind", "severity"].includes(key))) return false;
    if (!HAZARD_KINDS.includes(event.hazard.kind)) return false;
    if (!["advisory", "warning", "extreme"].includes(event.hazard.severity)) return false;
    if (!event.instructions?.length) return false;
  }
  if (["alert-updated", "alert-cancelled"].includes(event.kind) && !nonEmptyString(event.referencesEventId)) return false;
  if (["shelter-status", "facility-outage"].includes(event.kind) && !["available", "limited", "unavailable"].includes(event.status ?? "")) return false;
  if (event.capacityBand && !["none", "low", "medium", "high"].includes(event.capacityBand)) return false;
  if (event.kind === "shelter-status" && !event.capacityBand) return false;
  if (event.kind === "facility-outage" && !event.resourceKind) return false;
  if (event.kind === "resource-request" && !["water", "power", "heating", "communications", "nonclinical-supplies"].includes(event.resourceKind ?? "")) return false;
  return true;
}

export function sameArea(a: AdministrativeArea, b: AdministrativeArea): boolean {
  return a.kind === b.kind && a.countryCode === b.countryCode && a.code === b.code;
}
