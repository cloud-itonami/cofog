import { createHash } from "node:crypto";
import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { canonicalJson, validCivilEventShape, type CivilEvent } from "./domain.ts";

export type LedgerEntry = {
  sequence: number;
  previousHash: string;
  eventHash: string;
  entryHash: string;
  event: CivilEvent;
};

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function eventHash(event: CivilEvent): string {
  return sha256(canonicalJson(event));
}

function entryHash(sequence: number, previousHash: string, hash: string): string {
  return sha256(canonicalJson({ sequence, previousHash, eventHash: hash }));
}

export type LedgerVerification = { ok: boolean; brokenAt: number | null };

export interface CivilLedger {
  entries(): readonly LedgerEntry[];
  find(eventId: string): LedgerEntry | undefined;
  append(event: CivilEvent): LedgerEntry;
  verify(): LedgerVerification;
}

export function verifyLedgerEntries(entries: readonly LedgerEntry[]): LedgerVerification {
  let previousHash = "GENESIS";
  for (const [index, entry] of entries.entries()) {
    const expectedSequence = index + 1;
    if (entry === null || typeof entry !== "object" || !validCivilEventShape(entry.event)) {
      return { ok: false, brokenAt: expectedSequence };
    }
    const expectedEventHash = eventHash(entry.event);
    const expectedEntryHash = entryHash(expectedSequence, previousHash, expectedEventHash);
    if (
      entry.sequence !== expectedSequence ||
      entry.previousHash !== previousHash ||
      entry.eventHash !== expectedEventHash ||
      entry.entryHash !== expectedEntryHash
    ) return { ok: false, brokenAt: expectedSequence };
    previousHash = entry.entryHash;
  }
  return { ok: true, brokenAt: null };
}

function nextEntry(entries: readonly LedgerEntry[], event: CivilEvent): LedgerEntry {
  if (!validCivilEventShape(event)) throw new Error("cannot append an invalid civil event");
  const sequence = entries.length + 1;
  const previousHash = entries.at(-1)?.entryHash ?? "GENESIS";
  const hash = eventHash(event);
  return {
    sequence,
    previousHash,
    eventHash: hash,
    entryHash: entryHash(sequence, previousHash, hash),
    event: structuredClone(event),
  };
}

export class InMemoryLedger implements CivilLedger {
  #entries: LedgerEntry[] = [];

  entries(): readonly LedgerEntry[] {
    return structuredClone(this.#entries);
  }

  find(eventId: string): LedgerEntry | undefined {
    const found = this.#entries.find((entry) => entry.event.eventId === eventId);
    return found ? structuredClone(found) : undefined;
  }

  append(event: CivilEvent): LedgerEntry {
    const entry = nextEntry(this.#entries, event);
    this.#entries.push(entry);
    return structuredClone(entry);
  }

  verify(): LedgerVerification {
    return verifyLedgerEntries(this.#entries);
  }
}

/** Local durable ledger. Opening an existing file fails closed on malformed or broken data. */
export class JsonlLedger implements CivilLedger {
  readonly path: string;
  #entries: LedgerEntry[];

  constructor(path: string) {
    if (!path.trim()) throw new Error("ledger path is required");
    this.path = path;
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    if (!existsSync(path)) writeFileSync(path, "", { encoding: "utf8", mode: 0o600, flag: "wx" });
    chmodSync(path, 0o600);
    const lines = readFileSync(path, "utf8").split(/\r?\n/).filter((line) => line.trim());
    try {
      this.#entries = lines.map((line) => JSON.parse(line) as LedgerEntry);
    } catch (error) {
      throw new Error("ledger contains malformed JSON", { cause: error });
    }
    const verification = verifyLedgerEntries(this.#entries);
    if (!verification.ok) throw new Error(`ledger hash chain is broken at sequence ${verification.brokenAt}`);
  }

  entries(): readonly LedgerEntry[] {
    return structuredClone(this.#entries);
  }

  find(eventId: string): LedgerEntry | undefined {
    const found = this.#entries.find((entry) => entry.event.eventId === eventId);
    return found ? structuredClone(found) : undefined;
  }

  append(event: CivilEvent): LedgerEntry {
    const entry = nextEntry(this.#entries, event);
    appendFileSync(this.path, `${canonicalJson(entry)}\n`, { encoding: "utf8", mode: 0o600 });
    this.#entries.push(entry);
    return structuredClone(entry);
  }

  verify(): LedgerVerification {
    return verifyLedgerEntries(this.#entries);
  }
}
