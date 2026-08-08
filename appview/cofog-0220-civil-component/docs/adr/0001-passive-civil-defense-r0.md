# ADR-0001: Passive civil-defence event governor

## Status

Accepted for R0 implementation on 2026-08-08.

## Context

The COFOG 0220 directories contained metadata and a generic
`ExecuteFunction(function_id, payload)` contract, but no executable civil-defence safety
boundary. That generic contract could neither prove an alert's authority nor prevent an
arbitrary payload from crossing into military tracking, personal tracking, or autonomous
actuation.

The safe repository role is passive civil protection: authenticate official warnings,
maintain ordering and provenance, and propose dissemination and administrative continuity
actions. Active interception, military sensing, targeting, and weapon employment are outside
the repository boundary.

## Decision

Implement the TS-native `cofog-0220-civil-component` as the canonical R0 core.

1. Replace arbitrary function execution with a closed signed-event contract.
2. Admit administrative areas only; never precise coordinates or tracked people.
3. Verify Ed25519 signatures and exact source origins from an injected authority registry.
4. Fail closed on unknown fields, expired or future events, invalid time windows, conflicting
   event IDs, and military/targeting/location attributes or text.
5. Require an existing alert from the same authority and administrative area before accepting
   an update or official cancellation/all-clear.
6. Persist accepted R0 events to a hash-chained in-memory ledger and emit only
   `effect: propose`, with human approval required.

## Allowed operations

- Publish a civilian warning proposal.
- Publish an authority-signed all-clear proposal.
- Publish aggregate shelter availability.
- Publish facility outage status.
- Coordinate water, power, heating, communications, or non-clinical supplies.

## Permanent exclusions

- Sensor tracks, trajectories, predicted impact or intercept points.
- Interceptors, weapons, targets, weapon assignment, launch sites.
- Military-unit or friendly-force locations and military C2.
- Person/device identifiers and user locations.
- AI-generated alerts or inferred all-clear declarations.
- Direct publication or operational actuation from the R0 core.

## Consequences

The component can now be tested as a real passive-protection governor without claiming a
live national warning integration. Production readiness still requires an operator-approved
authority registry, durable append-only storage, shadow-feed measurements, a human approval
surface, delivery attestations, and an independently reviewed publisher.
