# ADR-0002: Governed relay boundary for R1/R2

## Status

Superseded by ADR-0003. External integrations were never approved by this ADR.

## Context

R0 authenticated civil events and produced proposals, but its in-memory ledger could not
survive restart. It also lacked a machine-enforced boundary between proposal creation and
external dissemination.

## Decision

1. Add a local JSONL event ledger. Every line carries sequence, previous hash, event hash,
   entry hash, and the closed civil event. Opening the file verifies the complete chain and
   fails closed on malformed or altered data.
2. Load authority keys from a closed operator-managed JSON document. Accept only Ed25519
   public keys and exact HTTPS origins. Do not bundle real authority keys.
3. Run feed-adapter candidates through a non-publishing shadow evaluator, backed by a
   dedicated ledger, that reports outcomes, hold reasons, and receive latency.
4. Keep dissemination behind an injected transport. Invoke it only after verifying a
   separate Ed25519 human approval bound to the accepted event hash and operation.
5. Reject expired, future, mismatched, or previously used approvals before transport. Record
   successful receipts in a hash-chained delivery-attestation ledger.

## Supersession

The JSONL and in-memory mechanisms described here were prototypes. ADR-0003 replaces them
with a Kotoba application, a single-value CAS checkpoint, durable-outbox state semantics,
and deny-by-default host capabilities.

## Operational boundary

The local JSONL store assumes a single writer. The approval replay check and delivery append
are not yet a cross-process transaction. Therefore a real connector requires a transactional
outbox or equivalent single-delivery coordinator, hardware-backed operator keys, durable
delivery attestations, and independent security and accessibility review.

No live feed, public-warning channel, military sensor, targeting system, trajectory model,
interception system, or weapon interface is introduced.
