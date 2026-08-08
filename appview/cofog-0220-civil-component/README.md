# COFOG 0220 — Passive Civil Defence

R0 core plus R1/R2 safety-boundary implementation for a narrow civil-warning governor.
It verifies signed events from registered public authorities, enforces an
administrative-region-only data model, records accepted events in a hash-chained ledger,
and emits a typed dissemination **proposal**. Publication is possible only through an
injected transport after a separately signed human approval is verified.

## What is implemented

- Ed25519 verification against an injected authority registry.
- Exact source-origin allowlists.
- Closed event schema for official warnings, official cancellations, shelter status,
  facility outages, and non-clinical resource requests.
- Expiry, future-skew, ordering, duplicate, and conflicting-event-id checks.
- Official all-clear requires an existing alert from the same authority and area.
- Alert updates also require an existing alert from the same authority and area.
- Append-only, hash-chained in-memory and local JSONL ledgers with restart verification.
- Closed JSON authority-registry loader requiring Ed25519 keys and exact HTTPS origins.
- Non-publishing shadow evaluation with outcome, hold-reason, and receive-latency metrics;
  callers provide a dedicated shadow ledger.
- Proposal-only output with human approval required.
- Approval signatures bound to the event hash and proposed operation, expiry checks,
  one-time approval IDs, and hash-chained delivery attestations.

## Constitutional boundary

This component reduces civilian consequences. It is not an air-defence weapon system.
The schema rejects precise coordinates, trajectories, intercept points, interceptors,
targets, launch sites, sensor tracks, military units, friendly-force locations, weapon
assignment, person identifiers, device identifiers, and user locations. Unknown fields
are rejected rather than silently retained.

No AI-generated alert or all-clear is permitted. The publisher boundary can relay only the
governor-clean proposal produced from an authority-signed event and a matching human approval.
No real transport implementation is bundled.

## Run

```bash
npm test
```

Node's built-in TypeScript strip-only runtime and test runner are sufficient; the R0 core
has no runtime dependency on the workspace SDK.

Signatures cover the UTF-8 bytes of the event's canonical JSON representation: object keys
are recursively sorted lexicographically, undefined object properties are omitted, and array
order is preserved. `canonicalJson` is exported so adapters and test fixtures use the same
encoding.

## Layout

- `src/domain.ts` — closed contracts, canonical encoding, prohibited-field gate.
- `src/governor.ts` — signature, source, time, idempotency, and cancellation governance.
- `src/ledger.ts` — hash-chained append-only R0 ledger.
- `src/registry.ts` — fail-closed operator authority-registry loader.
- `src/shadow.ts` — non-publishing evaluation and metrics.
- `src/publisher.ts` — signed human-approval gate, injected transport, delivery attestation.
- `proto/civil_defense.proto` — typed wire contract; no arbitrary execute-function payload.
- `test/civil-defense.test.ts` — executable boundary and happy-path tests.
- `docs/adr/0001-passive-civil-defense-r0.md` — passive-protection decision boundary.
- `docs/adr/0002-r1-r2-governed-relay-boundary.md` — durable/shadow/approval design.

## Maturity

The implementation remains offline: no live official feed, real authority key, operator UI,
or external delivery connector is bundled, and no `component.wasm` is claimed as built.
The JSONL ledger is a single-process local durability option, not a replicated production
store. Shadow adapters and transports must be independently reviewed before connection.
