# civil-defense Capability (COFOG 0220)

> Compatibility metadata scaffold. The canonical implementation is
> `../cofog-0220-civil-component`: a signed, human-approved passive civil-defence relay boundary.
> The earlier generic `ExecuteFunction(function_id, payload)` contract is retired; see the typed
> `proto/service.proto`. No live feed, external transport, military sensing, targeting, or
> interception is implemented.

## COFOG Classification
- **Division**: 02
- **Group**: 2
- **Class**: 0
- **Description**: Civil defence

## cross-actor Agent
- **Agent ID**: cofog-0220
- **Entity Type**: Service (Capability)
- **Framework**: Kotoba governed component
- **Scope**: Passive civilian warning and administrative continuity only

## Technology Stack
- **Language**: Kotoba (`.kotoba`), checked by the canonical compiler
- **Signature**: operator-owned Ed25519 verification capability
- **State**: single-value CAS checkpoint with ledger, consumed approvals, and outbox
- **Output**: proposal plus separately signed human approval; transport is not bundled
- **Verification**: restricted ESM conformance through the canonical component's CLJS harness
