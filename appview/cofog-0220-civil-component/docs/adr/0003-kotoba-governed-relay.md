# ADR-0003: Kotoba governed relay and atomic outbox

## Status

Accepted and implemented offline on 2026-08-09. Live integrations are not approved.

## Context

The TypeScript prototype established a civilian-only boundary but split ledger, approval
replay, and delivery state across process-local mechanisms. It also did not express ambient
authority through Kotoba capability admission.

## Decision

1. Implement application semantics in `.kotoba`; do not retain a TypeScript application path.
2. Keep `govern`, `approve`, shadow evaluation, outbox transitions, and attestations pure and
   deterministic. The host supplies correlated clock, registry, signature, and state evidence.
3. Verify authority signatures only through an operator-owned `:identity/verify` provider.
   Application input selects `authority-id`, never a public key.
4. Atomically represent event-ledger append, approval consumption, and outbox enqueue in one
   document stored at `:cofog-0220-state` with expected-version CAS.
5. Dispatch only leased outbox entries. Bind transport calls to an outbox idempotency key,
   retry failures up to a host policy limit, then enter dead-letter state.
6. Record successful delivery as a hash-chained attestation in the next CAS checkpoint.
7. Admit no capabilities to the core. Authority and storage adapters each require an explicit,
   least-authority policy. No transport provider is bundled or enabled.

## Consequences

Approval replay and outbox enqueue cannot partially commit when the configured storage
provider implements the single-value CAS contract. Delivery remains at-least-once at the
host boundary, with idempotency delegated to the reviewed transport provider. A CAS conflict
must reload the aggregate and recompute the command; it must not be overwritten.

The repository can verify the pure core as restricted ESM and verify capability admission
offline. Production readiness still requires real providers, operational recovery tests,
operator UX review, and a working Kotoba WASM compilation path for this typed document model.

The permanent exclusions from ADR-0001 remain unchanged: no sensors, precise tracking,
trajectory or impact prediction, targeting, interception, weapons, military C2, autonomous
alert generation, or inferred all-clear.
