import { createPublicKey } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Authority, AuthorityRegistry } from "./domain.ts";

export const AUTHORITY_REGISTRY_SCHEMA_VERSION = "cofog-0220-authorities/v1" as const;

function validOrigin(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && url.origin === value;
  } catch {
    return false;
  }
}

function validEd25519PublicKey(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    return createPublicKey(value).asymmetricKeyType === "ed25519";
  } catch {
    return false;
  }
}

function validAuthority(value: unknown): value is Authority {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).every((key) => ["authorityId", "publicKeyPem", "allowedOrigins"].includes(key)) &&
    typeof record.authorityId === "string" && record.authorityId.trim().length > 0 && record.authorityId.length <= 128 &&
    validEd25519PublicKey(record.publicKeyPem) &&
    Array.isArray(record.allowedOrigins) && record.allowedOrigins.length > 0 &&
    record.allowedOrigins.every(validOrigin) && new Set(record.allowedOrigins).size === record.allowedOrigins.length;
}

export function loadAuthorityRegistry(value: unknown): AuthorityRegistry {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid authority registry");
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).some((key) => !["schemaVersion", "authorities"].includes(key)) ||
    record.schemaVersion !== AUTHORITY_REGISTRY_SCHEMA_VERSION ||
    !Array.isArray(record.authorities)
  ) throw new Error("invalid authority registry");

  const result = new Map<string, Authority>();
  for (const candidate of record.authorities) {
    if (!validAuthority(candidate)) throw new Error("invalid authority entry");
    if (result.has(candidate.authorityId)) throw new Error(`duplicate authority id: ${candidate.authorityId}`);
    result.set(candidate.authorityId, structuredClone(candidate));
  }
  return result;
}

export function loadAuthorityRegistryFile(path: string): AuthorityRegistry {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error("authority registry is not valid JSON", { cause: error });
  }
  return loadAuthorityRegistry(value);
}
