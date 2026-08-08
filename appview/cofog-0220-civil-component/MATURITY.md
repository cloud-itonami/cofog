# Maturity

## R0 — implemented and verified

- Closed TypeScript contracts.
- Ed25519 authority signatures and source-origin allowlist.
- Independent governor returning `commit | noop | hold`.
- Proposal-only dissemination; human approval remains mandatory.
- Hash-chained in-memory ledger.
- Offline tests for signatures, expiry, idempotency, conflicting IDs, prohibited fields,
  closed-schema behavior, official all-clear, shelters, facilities, and resources.

## R1/R2 boundaries — implemented and verified offline

- Fail-closed operator authority-registry loader.
- Local JSONL hash-chain ledger that verifies on restart and rejects tampering.
- Non-publishing shadow evaluation metrics using a dedicated injected ledger.
- Signed human approval bound to event hash and operation.
- Approval expiry and replay checks before the injected transport is invoked.
- Hash-chained in-memory delivery attestations.

## Not claimed

- No live Ukraine or other national alert feed is connected.
- No official authority keys are bundled; tests use an ephemeral fixture key.
- No warning has been published.
- No replicated or concurrent production ledger and no `component.wasm` has been built.
- No live feed adapter, operator approval UI, external transport, or durable delivery
  attestation store is bundled.
- No sensor, trajectory, interception, targeting, or military C2 capability exists.

## Next gates

1. Connect an independently reviewed read-only adapter to saved official-feed fixtures;
   measure latency, duplicates, update/cancellation ordering, and source outages.
2. Add an operator approval UI, hardware-backed approver keys, a transactional outbox, and
   durable delivery attestations before any external transport is enabled.
3. R3 supervised relay: automatic relay only for cryptographically authenticated official
   events; all-clear remains source-derived and never inferred.
