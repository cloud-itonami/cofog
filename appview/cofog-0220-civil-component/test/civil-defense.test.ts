import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  APPROVAL_SCHEMA_VERSION,
  canonicalJson,
  CivilDefenseGovernor,
  eventHash,
  HumanApprovedPublisher,
  InMemoryLedger,
  InMemoryDeliveryLedger,
  JsonlLedger,
  loadAuthorityRegistry,
  runShadow,
  SCHEMA_VERSION,
  type ApprovalPayload,
  type CivilEvent,
  type SignedCivilEvent,
} from "../src/app.ts";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const authorityId = "ua:public-alert-authority:fixture";
const registry = new Map([[authorityId, {
  authorityId,
  publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
  allowedOrigins: ["https://alerts.example.gov.ua"],
}]]);
const now = () => new Date("2026-08-08T12:00:00.000Z");

function event(overrides: Partial<CivilEvent> = {}): CivilEvent {
  return {
    schemaVersion: SCHEMA_VERSION,
    eventId: "evt-001",
    kind: "alert-issued",
    authorityId,
    issuedAt: "2026-08-08T11:59:00.000Z",
    effectiveAt: "2026-08-08T12:00:00.000Z",
    expiresAt: "2026-08-08T12:30:00.000Z",
    area: { kind: "administrative-region", countryCode: "UA", code: "UA-30" },
    sourceUrl: "https://alerts.example.gov.ua/events/evt-001",
    hazard: { kind: "missile-threat", severity: "warning" },
    instructions: ["Follow instructions issued by the competent civil authority."],
    ...overrides,
  };
}

function signed(value: CivilEvent, key = privateKey): SignedCivilEvent {
  return {
    event: value,
    signature: sign(null, Buffer.from(canonicalJson(value), "utf8"), key).toString("base64"),
  };
}

function setup() {
  const ledger = new InMemoryLedger();
  return { ledger, governor: new CivilDefenseGovernor(registry, ledger, now) };
}

test("commits a signed official alert but emits proposal-only output", () => {
  const { ledger, governor } = setup();
  const decision = governor.evaluate(signed(event()));
  assert.equal(decision.outcome, "commit");
  if (decision.outcome === "commit") {
    assert.equal(decision.proposal.effect, "propose");
    assert.equal(decision.proposal.operation, "publish-civilian-warning");
    assert.equal(decision.proposal.requiresHumanApproval, true);
  }
  assert.equal(ledger.entries().length, 1);
  assert.deepEqual(ledger.verify(), { ok: true, brokenAt: null });
});

test("duplicate delivery is idempotent", () => {
  const { ledger, governor } = setup();
  const envelope = signed(event());
  assert.equal(governor.evaluate(envelope).outcome, "commit");
  assert.deepEqual(governor.evaluate(envelope), { outcome: "noop", eventId: "evt-001", reason: "duplicate" });
  assert.equal(ledger.entries().length, 1);
});

test("same event id with changed content is held", () => {
  const { governor } = setup();
  assert.equal(governor.evaluate(signed(event())).outcome, "commit");
  const conflict = governor.evaluate(signed(event({ summary: "changed" })));
  assert.equal(conflict.outcome, "hold");
  if (conflict.outcome === "hold") assert.ok(conflict.reasons.includes("conflicting-event-id"));
});

test("rejects unknown authority, untrusted origin, bad signature and expired event", () => {
  const { governor } = setup();
  const unknown = event({ eventId: "evt-u", authorityId: "unknown" });
  const unknownDecision = governor.evaluate(signed(unknown));
  assert.equal(unknownDecision.outcome, "hold");
  if (unknownDecision.outcome === "hold") assert.ok(unknownDecision.reasons.includes("unknown-authority"));

  const origin = event({ eventId: "evt-o", sourceUrl: "https://example.net/alert" });
  const originDecision = governor.evaluate(signed(origin));
  assert.equal(originDecision.outcome, "hold");
  if (originDecision.outcome === "hold") assert.ok(originDecision.reasons.includes("source-origin-not-allowed"));

  const tampered = signed(event({ eventId: "evt-s" }));
  tampered.event.summary = "modified after signing";
  const signatureDecision = governor.evaluate(tampered);
  assert.equal(signatureDecision.outcome, "hold");
  if (signatureDecision.outcome === "hold") assert.ok(signatureDecision.reasons.includes("invalid-signature"));

  const expired = event({ eventId: "evt-e", effectiveAt: "2026-08-08T10:00:00Z", expiresAt: "2026-08-08T11:00:00Z" });
  const expiredDecision = governor.evaluate(signed(expired));
  assert.equal(expiredDecision.outcome, "hold");
  if (expiredDecision.outcome === "hold") assert.ok(expiredDecision.reasons.includes("expired"));
});

test("prohibited military tracking and personal-location fields are unrepresentable", () => {
  for (const prohibited of [
    { trajectory: [{ latitude: 50, longitude: 30 }] },
    { targetCoordinates: "fixture" },
    { interceptor: "fixture" },
    { militaryUnit: "fixture" },
    { personId: "fixture" },
    { userLocation: "fixture" },
  ]) {
    const { governor } = setup();
    const unsafe = { ...event({ eventId: `unsafe-${Object.keys(prohibited)[0]}` }), ...prohibited } as CivilEvent;
    const decision = governor.evaluate(signed(unsafe));
    assert.equal(decision.outcome, "hold");
    if (decision.outcome === "hold") assert.ok(decision.reasons.includes("prohibited-field"));
  }

  const { governor } = setup();
  const embedded = event({ eventId: "unsafe-text", summary: "Compute an intercept point from the sensor track." });
  const decision = governor.evaluate(signed(embedded));
  assert.equal(decision.outcome, "hold");
  if (decision.outcome === "hold") assert.ok(decision.reasons.includes("prohibited-field"));
});

test("schema is closed and rejects unknown fields and invalid status values", () => {
  const { governor } = setup();
  const unknown = { ...event({ eventId: "unknown-field" }), arbitraryPayload: "not admitted" } as CivilEvent;
  const unknownDecision = governor.evaluate(signed(unknown));
  assert.equal(unknownDecision.outcome, "hold");
  if (unknownDecision.outcome === "hold") assert.ok(unknownDecision.reasons.includes("invalid-shape"));

  const invalidStatus = event({ eventId: "bad-status", kind: "shelter-status", hazard: undefined,
    instructions: undefined, status: "open" as CivilEvent["status"] });
  const statusDecision = governor.evaluate(signed(invalidStatus));
  assert.equal(statusDecision.outcome, "hold");
  if (statusDecision.outcome === "hold") assert.ok(statusDecision.reasons.includes("invalid-shape"));
});

test("all-clear requires a signed, existing alert from the same authority and area", () => {
  const { governor } = setup();
  const base = event();
  assert.equal(governor.evaluate(signed(base)).outcome, "commit");

  const cancellation = event({
    eventId: "evt-002",
    kind: "alert-cancelled",
    referencesEventId: base.eventId,
    hazard: undefined,
    instructions: undefined,
    issuedAt: "2026-08-08T12:05:00Z",
    effectiveAt: "2026-08-08T12:05:00Z",
  });
  const decision = governor.evaluate(signed(cancellation));
  assert.equal(decision.outcome, "commit");
  if (decision.outcome === "commit") assert.equal(decision.proposal.operation, "publish-official-all-clear");

  const missing = event({
    eventId: "evt-003",
    kind: "alert-cancelled",
    referencesEventId: "missing",
    hazard: undefined,
    instructions: undefined,
  });
  const missingDecision = governor.evaluate(signed(missing));
  assert.equal(missingDecision.outcome, "hold");
  if (missingDecision.outcome === "hold") assert.ok(missingDecision.reasons.includes("referenced-alert-not-found"));

  const wrongArea = event({
    eventId: "evt-004",
    kind: "alert-cancelled",
    referencesEventId: base.eventId,
    hazard: undefined,
    instructions: undefined,
    area: { kind: "administrative-region", countryCode: "UA", code: "UA-32" },
  });
  const wrongAreaDecision = governor.evaluate(signed(wrongArea));
  assert.equal(wrongAreaDecision.outcome, "hold");
  if (wrongAreaDecision.outcome === "hold") assert.ok(wrongAreaDecision.reasons.includes("reference-area-mismatch"));
});

test("alert updates require an existing alert from the same authority and area", () => {
  const { governor } = setup();
  const missingReference = event({ eventId: "update-missing", kind: "alert-updated" });
  const missingReferenceDecision = governor.evaluate(signed(missingReference));
  assert.equal(missingReferenceDecision.outcome, "hold");
  if (missingReferenceDecision.outcome === "hold") assert.ok(missingReferenceDecision.reasons.includes("invalid-shape"));

  const base = event();
  assert.equal(governor.evaluate(signed(base)).outcome, "commit");
  const update = event({
    eventId: "update-1",
    kind: "alert-updated",
    referencesEventId: base.eventId,
    issuedAt: "2026-08-08T12:03:00Z",
    effectiveAt: "2026-08-08T12:03:00Z",
    instructions: ["Continue following instructions issued by the competent civil authority."],
  });
  const updateDecision = governor.evaluate(signed(update));
  assert.equal(updateDecision.outcome, "commit");

  const regressed = event({
    eventId: "update-regressed",
    kind: "alert-updated",
    referencesEventId: update.eventId,
    issuedAt: "2026-08-08T12:02:00Z",
    effectiveAt: "2026-08-08T12:02:00Z",
  });
  const regressedDecision = governor.evaluate(signed(regressed));
  assert.equal(regressedDecision.outcome, "hold");
  if (regressedDecision.outcome === "hold") assert.ok(regressedDecision.reasons.includes("reference-time-regression"));
});

test("rejects invalid chronology, excessive future skew, ambiguous timestamps, and non-HTTPS sources", () => {
  const { governor } = setup();
  const chronology = event({ eventId: "bad-chronology", effectiveAt: "2026-08-08T12:30:00Z", expiresAt: "2026-08-08T12:20:00Z" });
  const chronologyDecision = governor.evaluate(signed(chronology));
  assert.equal(chronologyDecision.outcome, "hold");
  if (chronologyDecision.outcome === "hold") assert.ok(chronologyDecision.reasons.includes("invalid-time-window"));

  const future = event({ eventId: "future", issuedAt: "2026-08-08T12:06:00Z", effectiveAt: "2026-08-08T12:06:00Z" });
  const futureDecision = governor.evaluate(signed(future));
  assert.equal(futureDecision.outcome, "hold");
  if (futureDecision.outcome === "hold") assert.ok(futureDecision.reasons.includes("issued-in-future"));

  const ambiguous = event({ eventId: "ambiguous-time", issuedAt: "2026-08-08 11:59:00" });
  const ambiguousDecision = governor.evaluate(signed(ambiguous));
  assert.equal(ambiguousDecision.outcome, "hold");
  if (ambiguousDecision.outcome === "hold") assert.ok(ambiguousDecision.reasons.includes("invalid-shape"));

  const insecure = event({ eventId: "http", sourceUrl: "http://alerts.example.gov.ua/events/http" });
  const insecureDecision = governor.evaluate(signed(insecure));
  assert.equal(insecureDecision.outcome, "hold");
  if (insecureDecision.outcome === "hold") assert.ok(insecureDecision.reasons.includes("invalid-shape"));
});

test("shelter, facility and nonclinical resource events stay administrative", () => {
  const { governor } = setup();
  const shelter = event({
    eventId: "shelter-1", kind: "shelter-status", hazard: undefined, instructions: undefined,
    status: "limited", capacityBand: "low",
  });
  const facility = event({
    eventId: "facility-1", kind: "facility-outage", hazard: undefined, instructions: undefined,
    status: "unavailable", resourceKind: "power",
  });
  const resource = event({
    eventId: "resource-1", kind: "resource-request", hazard: undefined, instructions: undefined,
    resourceKind: "nonclinical-supplies",
  });
  for (const [value, operation] of [
    [shelter, "publish-shelter-status"],
    [facility, "publish-facility-outage"],
    [resource, "coordinate-nonclinical-resource"],
  ] as const) {
    const decision = governor.evaluate(signed(value));
    assert.equal(decision.outcome, "commit");
    if (decision.outcome === "commit") assert.equal(decision.proposal.operation, operation);
  }
});

test("loads only closed, operator-managed Ed25519 authority registries", () => {
  const value = {
    schemaVersion: "cofog-0220-authorities/v1",
    authorities: [{
      authorityId,
      publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
      allowedOrigins: ["https://alerts.example.gov.ua"],
    }],
  };
  const loaded = loadAuthorityRegistry(value);
  assert.equal(loaded.get(authorityId)?.allowedOrigins[0], "https://alerts.example.gov.ua");
  assert.throws(() => loadAuthorityRegistry({ ...value, arbitrary: true }), /invalid authority registry/);
  assert.throws(() => loadAuthorityRegistry({
    ...value,
    authorities: [{ ...value.authorities[0], allowedOrigins: ["https://alerts.example.gov.ua/path"] }],
  }), /invalid authority entry/);
  assert.throws(() => loadAuthorityRegistry({
    ...value,
    authorities: [...value.authorities, value.authorities[0]],
  }), /duplicate authority id/);
});

test("JSONL ledger survives restart and fails closed on tampering", () => {
  const directory = mkdtempSync(join(tmpdir(), "cofog-0220-ledger-"));
  const path = join(directory, "events.jsonl");
  try {
    const ledger = new JsonlLedger(path);
    const governor = new CivilDefenseGovernor(registry, ledger, now);
    assert.equal(governor.evaluate(signed(event())).outcome, "commit");
    assert.deepEqual(ledger.verify(), { ok: true, brokenAt: null });

    const reopened = new JsonlLedger(path);
    assert.equal(reopened.entries().length, 1);
    assert.deepEqual(reopened.verify(), { ok: true, brokenAt: null });

    writeFileSync(path, readFileSync(path, "utf8").replace("evt-001", "evt-tampered"), "utf8");
    assert.throws(() => new JsonlLedger(path), /hash chain is broken/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("shadow evaluation reports decisions, hold reasons and receive latency without publishing", () => {
  const { governor } = setup();
  const good = signed(event());
  const bad = signed(event({ eventId: "shadow-bad" }));
  bad.event.summary = "changed after signing";
  const report = runShadow([
    { envelope: good, receivedAt: "2026-08-08T12:00:00Z" },
    { envelope: good, receivedAt: "2026-08-08T12:00:01Z" },
    { envelope: bad, receivedAt: "2026-08-08T12:00:02Z" },
  ], governor);
  assert.deepEqual(report.outcomes, { commit: 1, noop: 1, hold: 1 });
  assert.equal(report.holdReasons["invalid-signature"], 1);
  assert.deepEqual(report.receiveLatencyMs, { min: 60_000, p95: 62_000, max: 62_000 });
});

test("publisher requires a valid human approval bound to the committed proposal", async () => {
  const decision = setup().governor.evaluate(signed(event()));
  assert.equal(decision.outcome, "commit");
  const { publicKey: approverPublic, privateKey: approverPrivate } = generateKeyPairSync("ed25519");
  const approverId = "operator:fixture";
  const approvers = new Map([[approverId, {
    approverId,
    publicKeyPem: approverPublic.export({ type: "spki", format: "pem" }).toString(),
  }]]);
  let calls = 0;
  const transport = {
    async deliver() {
      calls += 1;
      return { channel: "fixture-channel", externalId: `delivery-${calls}` };
    },
  };
  const deliveries = new InMemoryDeliveryLedger();
  const publisher = new HumanApprovedPublisher(approvers, transport, deliveries, now);
  assert.equal(decision.outcome, "commit");
  if (decision.outcome !== "commit") return;

  const approval: ApprovalPayload = {
    schemaVersion: APPROVAL_SCHEMA_VERSION,
    approvalId: "approval-001",
    approverId,
    eventId: decision.event.eventId,
    eventHash: eventHash(decision.event),
    operation: decision.proposal.operation,
    approvedAt: "2026-08-08T12:00:00Z",
    expiresAt: "2026-08-08T12:10:00Z",
  };
  const envelope = {
    approval,
    signature: sign(null, Buffer.from(canonicalJson(approval), "utf8"), approverPrivate).toString("base64"),
  };

  const bad = structuredClone(envelope);
  bad.approval.eventHash = "0".repeat(64);
  const held = await publisher.publish(decision, bad);
  assert.equal(held.outcome, "hold");
  assert.equal(calls, 0);

  const delivered = await publisher.publish(decision, envelope);
  assert.equal(delivered.outcome, "delivered");
  assert.equal(calls, 1);
  assert.equal(deliveries.entries().length, 1);
  assert.deepEqual(deliveries.verify(), { ok: true, brokenAt: null });

  const replay = await publisher.publish(decision, envelope);
  assert.deepEqual(replay, { outcome: "hold", reasons: ["approval-already-used"] });
  assert.equal(calls, 1);
});

test("publisher holds expired approvals before touching the transport", async () => {
  const decision = setup().governor.evaluate(signed(event()));
  let calls = 0;
  const publisher = new HumanApprovedPublisher(new Map(), {
    async deliver() { calls += 1; return { channel: "fixture", externalId: "never" }; },
  }, new InMemoryDeliveryLedger(), now);
  const approval: ApprovalPayload = {
    schemaVersion: APPROVAL_SCHEMA_VERSION,
    approvalId: "expired",
    approverId: "missing",
    eventId: "evt-001",
    eventHash: "0".repeat(64),
    operation: "publish-civilian-warning",
    approvedAt: "2026-08-08T11:00:00Z",
    expiresAt: "2026-08-08T11:30:00Z",
  };
  const result = await publisher.publish(decision, { approval, signature: "invalid" });
  assert.equal(result.outcome, "hold");
  assert.equal(calls, 0);
});
