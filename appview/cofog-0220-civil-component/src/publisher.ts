import { createHash, verify } from "node:crypto";
import { canonicalJson, type Decision, type DisseminationProposal } from "./domain.ts";
import { eventHash } from "./ledger.ts";

export const APPROVAL_SCHEMA_VERSION = "cofog-0220-approval/v1" as const;

export type ApprovalPayload = {
  schemaVersion: typeof APPROVAL_SCHEMA_VERSION;
  approvalId: string;
  approverId: string;
  eventId: string;
  eventHash: string;
  operation: DisseminationProposal["operation"];
  approvedAt: string;
  expiresAt: string;
};

export type SignedApproval = { approval: ApprovalPayload; signature: string };
export type Approver = { approverId: string; publicKeyPem: string };
export type ApproverRegistry = ReadonlyMap<string, Approver>;
export type DeliveryReceipt = { channel: string; externalId: string };

export interface ProposalTransport {
  deliver(proposal: DisseminationProposal): Promise<DeliveryReceipt>;
}

export type DeliveryAttestation = {
  sequence: number;
  previousHash: string;
  attestationHash: string;
  approvalId: string;
  eventId: string;
  eventHash: string;
  operation: DisseminationProposal["operation"];
  channel: string;
  externalId: string;
  deliveredAt: string;
};

export class InMemoryDeliveryLedger {
  #entries: DeliveryAttestation[] = [];

  entries(): readonly DeliveryAttestation[] {
    return structuredClone(this.#entries);
  }

  findApproval(approvalId: string): DeliveryAttestation | undefined {
    const found = this.#entries.find((entry) => entry.approvalId === approvalId);
    return found ? structuredClone(found) : undefined;
  }

  append(value: Omit<DeliveryAttestation, "sequence" | "previousHash" | "attestationHash">): DeliveryAttestation {
    const sequence = this.#entries.length + 1;
    const previousHash = this.#entries.at(-1)?.attestationHash ?? "GENESIS";
    const attestationHash = createHash("sha256")
      .update(canonicalJson({ sequence, previousHash, ...value }), "utf8").digest("hex");
    const entry = { sequence, previousHash, attestationHash, ...structuredClone(value) };
    this.#entries.push(entry);
    return structuredClone(entry);
  }

  verify(): { ok: boolean; brokenAt: number | null } {
    let previousHash = "GENESIS";
    for (const [index, entry] of this.#entries.entries()) {
      const sequence = index + 1;
      const { attestationHash, ...value } = entry;
      const expected = createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
      if (entry.sequence !== sequence || entry.previousHash !== previousHash || attestationHash !== expected) {
        return { ok: false, brokenAt: sequence };
      }
      previousHash = attestationHash;
    }
    return { ok: true, brokenAt: null };
  }
}

export type PublishResult =
  | { outcome: "delivered"; attestation: DeliveryAttestation }
  | { outcome: "hold"; reasons: string[] };

function isoInstant(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    Number.isFinite(Date.parse(value));
}

function validApprovalShape(value: unknown): value is ApprovalPayload {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const keys = ["schemaVersion", "approvalId", "approverId", "eventId", "eventHash", "operation", "approvedAt", "expiresAt"];
  return Object.keys(record).every((key) => keys.includes(key)) && keys.every((key) => key in record) &&
    record.schemaVersion === APPROVAL_SCHEMA_VERSION &&
    [record.approvalId, record.approverId, record.eventId].every((item) => typeof item === "string" && item.length > 0 && item.length <= 128) &&
    typeof record.eventHash === "string" && /^[a-f0-9]{64}$/.test(record.eventHash) &&
    ["publish-civilian-warning", "publish-official-all-clear", "publish-shelter-status", "publish-facility-outage", "coordinate-nonclinical-resource"].includes(record.operation as string) &&
    isoInstant(record.approvedAt) && isoInstant(record.expiresAt);
}

export class HumanApprovedPublisher {
  private readonly approvers: ApproverRegistry;
  private readonly transport: ProposalTransport;
  private readonly deliveries: InMemoryDeliveryLedger;
  private readonly now: () => Date;

  constructor(
    approvers: ApproverRegistry,
    transport: ProposalTransport,
    deliveries: InMemoryDeliveryLedger,
    now: () => Date = () => new Date(),
  ) {
    this.approvers = approvers;
    this.transport = transport;
    this.deliveries = deliveries;
    this.now = now;
  }

  async publish(decision: Decision, envelope: SignedApproval): Promise<PublishResult> {
    const reasons: string[] = [];
    if (decision.outcome !== "commit") return { outcome: "hold", reasons: ["decision-not-committed"] };
    if (!validApprovalShape(envelope?.approval) || typeof envelope?.signature !== "string") {
      return { outcome: "hold", reasons: ["invalid-approval-shape"] };
    }
    const approval = envelope.approval;
    const approver = this.approvers.get(approval.approverId);
    if (!approver) reasons.push("unknown-approver");
    else {
      try {
        if (!verify(null, Buffer.from(canonicalJson(approval), "utf8"), approver.publicKeyPem, Buffer.from(envelope.signature, "base64"))) {
          reasons.push("invalid-approval-signature");
        }
      } catch {
        reasons.push("invalid-approval-signature");
      }
    }
    const now = this.now().getTime();
    if (Date.parse(approval.approvedAt) > now || Date.parse(approval.expiresAt) <= now || Date.parse(approval.approvedAt) >= Date.parse(approval.expiresAt)) {
      reasons.push("invalid-approval-window");
    }
    if (Date.parse(decision.proposal.expiresAt) <= now) reasons.push("proposal-expired");
    if (approval.eventId !== decision.event.eventId || approval.eventHash !== eventHash(decision.event) ||
        approval.operation !== decision.proposal.operation) reasons.push("approval-binding-mismatch");
    if (this.deliveries.findApproval(approval.approvalId)) reasons.push("approval-already-used");
    if (reasons.length) return { outcome: "hold", reasons: [...new Set(reasons)] };

    const receipt = await this.transport.deliver(structuredClone(decision.proposal));
    if (!receipt.channel.trim() || !receipt.externalId.trim()) return { outcome: "hold", reasons: ["invalid-delivery-receipt"] };
    const attestation = this.deliveries.append({
      approvalId: approval.approvalId,
      eventId: approval.eventId,
      eventHash: approval.eventHash,
      operation: approval.operation,
      channel: receipt.channel,
      externalId: receipt.externalId,
      deliveredAt: this.now().toISOString(),
    });
    return { outcome: "delivered", attestation };
  }
}
