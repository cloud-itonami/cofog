import { verify } from "node:crypto";
import {
  canonicalJson,
  findProhibitedKeys,
  sameArea,
  validCivilEventShape,
  type AuthorityRegistry,
  type CivilEvent,
  type Decision,
  type DisseminationProposal,
  type HoldReason,
  type SignedCivilEvent,
} from "./domain.ts";
import { eventHash, type CivilLedger } from "./ledger.ts";

const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;

function operationFor(event: CivilEvent): DisseminationProposal["operation"] {
  switch (event.kind) {
    case "alert-issued":
    case "alert-updated": return "publish-civilian-warning";
    case "alert-cancelled": return "publish-official-all-clear";
    case "shelter-status": return "publish-shelter-status";
    case "facility-outage": return "publish-facility-outage";
    case "resource-request": return "coordinate-nonclinical-resource";
  }
}

function proposalFor(event: CivilEvent): DisseminationProposal {
  return {
    effect: "propose",
    operation: operationFor(event),
    eventId: event.eventId,
    area: structuredClone(event.area),
    expiresAt: event.expiresAt,
    requiresHumanApproval: true,
  };
}

function allowedOrigin(sourceUrl: string, origins: string[]): boolean {
  try {
    return origins.includes(new URL(sourceUrl).origin);
  } catch {
    return false;
  }
}

export class CivilDefenseGovernor {
  private readonly authorities: AuthorityRegistry;
  private readonly ledger: CivilLedger;
  private readonly now: () => Date;

  constructor(
    authorities: AuthorityRegistry,
    ledger: CivilLedger,
    now: () => Date = () => new Date(),
  ) {
    this.authorities = authorities;
    this.ledger = ledger;
    this.now = now;
  }

  evaluate(envelope: SignedCivilEvent): Decision {
    const eventId = envelope?.event?.eventId;
    const reasons: HoldReason[] = findProhibitedKeys(envelope?.event).length ? ["prohibited-field"] : [];
    if (!validCivilEventShape(envelope?.event) || typeof envelope?.signature !== "string") {
      reasons.push("invalid-shape");
      return { outcome: "hold", eventId, reasons: [...new Set(reasons)] };
    }

    const event = envelope.event;

    const authority = this.authorities.get(event.authorityId);
    if (!authority) {
      reasons.push("unknown-authority");
    } else {
      if (!allowedOrigin(event.sourceUrl, authority.allowedOrigins)) reasons.push("source-origin-not-allowed");
      let signatureValid = false;
      try {
        signatureValid = verify(
          null,
          Buffer.from(canonicalJson(event), "utf8"),
          authority.publicKeyPem,
          Buffer.from(envelope.signature, "base64"),
        );
      } catch {
        signatureValid = false;
      }
      if (!signatureValid) reasons.push("invalid-signature");
    }

    const issuedAt = Date.parse(event.issuedAt);
    const effectiveAt = Date.parse(event.effectiveAt);
    const expiresAt = Date.parse(event.expiresAt);
    const now = this.now().getTime();
    if (!(issuedAt <= effectiveAt && effectiveAt < expiresAt)) reasons.push("invalid-time-window");
    if (expiresAt <= now) reasons.push("expired");
    if (issuedAt > now + MAX_FUTURE_SKEW_MS) reasons.push("issued-in-future");

    const existing = this.ledger.find(event.eventId);
    if (existing) {
      if (existing.eventHash === eventHash(event)) {
        if (reasons.length) return { outcome: "hold", eventId, reasons: [...new Set(reasons)] };
        return { outcome: "noop", eventId, reason: "duplicate" };
      }
      reasons.push("conflicting-event-id");
    }

    if (["alert-updated", "alert-cancelled"].includes(event.kind)) {
      const referenced = this.ledger.find(event.referencesEventId!);
      if (!referenced || !["alert-issued", "alert-updated"].includes(referenced.event.kind)) {
        reasons.push("referenced-alert-not-found");
      } else {
        if (referenced.event.authorityId !== event.authorityId) reasons.push("reference-authority-mismatch");
        if (!sameArea(referenced.event.area, event.area)) reasons.push("reference-area-mismatch");
        if (Date.parse(event.issuedAt) < Date.parse(referenced.event.issuedAt)) reasons.push("reference-time-regression");
      }
    }

    if (reasons.length) return { outcome: "hold", eventId, reasons: [...new Set(reasons)] };
    this.ledger.append(event);
    return { outcome: "commit", event: structuredClone(event), proposal: proposalFor(event) };
  }
}
