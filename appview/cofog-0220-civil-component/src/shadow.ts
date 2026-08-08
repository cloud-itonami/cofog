import type { Decision, HoldReason, SignedCivilEvent } from "./domain.ts";
import type { CivilDefenseGovernor } from "./governor.ts";

export type ShadowInput = { envelope: SignedCivilEvent; receivedAt: string };

export type ShadowReport = {
  total: number;
  outcomes: { commit: number; noop: number; hold: number };
  holdReasons: Partial<Record<HoldReason, number>>;
  receiveLatencyMs: { min: number; p95: number; max: number } | null;
  decisions: Decision[];
};

function percentile95(values: number[]): number {
  return values[Math.max(0, Math.ceil(values.length * 0.95) - 1)];
}

/** Evaluates saved/feed-adapter inputs without publishing; use a dedicated shadow ledger. */
export function runShadow(inputs: readonly ShadowInput[], governor: CivilDefenseGovernor): ShadowReport {
  const outcomes = { commit: 0, noop: 0, hold: 0 };
  const holdReasons: Partial<Record<HoldReason, number>> = {};
  const latencies: number[] = [];
  const decisions = inputs.map(({ envelope, receivedAt }) => {
    const decision = governor.evaluate(envelope);
    outcomes[decision.outcome] += 1;
    if (decision.outcome === "hold") {
      for (const reason of decision.reasons) holdReasons[reason] = (holdReasons[reason] ?? 0) + 1;
    }
    const latency = Date.parse(receivedAt) - Date.parse(envelope.event.issuedAt);
    if (Number.isFinite(latency) && latency >= 0) latencies.push(latency);
    return decision;
  });
  latencies.sort((a, b) => a - b);
  return {
    total: inputs.length,
    outcomes,
    holdReasons,
    receiveLatencyMs: latencies.length ? {
      min: latencies[0], p95: percentile95(latencies), max: latencies.at(-1)!,
    } : null,
    decisions,
  };
}
