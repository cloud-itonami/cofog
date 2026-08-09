# ADR-0004: Passive civil-resilience coverage

## Status

Accepted and implemented offline on 2026-08-09. Live integrations remain disabled.

## Context

Civil-warning availability can fail because one official source becomes stale or revoked,
one delivery provider fails, connectivity is lost, or an operator cannot safely recover an
outbox. Coverage must improve without admitting military sensing or weapon-operation data.

## Decision

1. Compute threat state only at administrative-area granularity from counts and a provenance
   hash supplied by independently verified official sources. Require a quorum of at least two.
2. Report stale and revoked source counts while excluding them from valid quorum evidence.
3. Reject any boundary evidence containing precise coordinates, trajectory, targeting,
   sensor tracks, weapon assignment, weapons/interceptors, military-unit locations, or
   person/device locations.
4. Prepare offline bundles only as proposals, after two distinct valid human approvals.
   Host signing and physical distribution remain outside the application.
5. Propose route plans only when at least two routes and two distinct providers are available,
   including an offline route. Never publish autonomously.
6. Measure synthetic-drill zone/facility coverage, route success, recovery time, stale sources,
   and dead letters without person-level telemetry.
7. Persist resilience transitions through the existing single-key expected-version CAS model.

## Consequences

The component covers feed degradation, communications loss, provider failure, and recovery
exercises while remaining passive and civilian-only. Source adapters must reduce their input
to signed administrative-area notices before crossing this boundary. Raw military data is
not sanitized here; it is rejected and must not be connected.
