# Maturity

## Offline boundary — implemented and verified

- Kotoba の closed records による civil-event、evidence、approval、delivery contract。
- capability-free governor と proposal-only output。
- exact origin、authority、signature evidence、期限、順序、重複、参照整合性の検査。
- operator-owned `:identity/verify` と single-key `:storage/transact` capability adapter。
- event append、approval consumption、outbox enqueue の CAS checkpoint。
- outbox lease、attempt、retry、dead-letter、delivery attestation hash chain。
- shadow observation と restricted ESM conformance fixtures。
- administrative-area quorum、stale/revocation、offline bundle、route redundancy。
- synthetic drill coverage と passive-resilience CAS checkpoint。
- effect modules が空 policy では拒否される deny-by-default 検証。

## Not claimed

- live Ukraine または他国の official feed は未接続。
- real authority/approver key、hardware-backed signing、operator UI は未実装。
- external warning transport と operational CAS provider は未設定。
- 警報は配信していない。
- `component.wasm` は未生成。現在の verification artifact は restricted ESM。
- sensor、trajectory、interception、targeting、military C2 capability は存在しない。

## Production gates

1. 保存済み official-feed fixtures で read-only adapter を評価し、latency、duplicate、
   update/cancellation ordering、outage recovery を測定する。
2. 独立審査済み authority registry provider と hardware-backed approver key を接続する。
3. operational CAS store で conflict、restart、crash recovery、outbox lease recovery、
   dead-letter replay を検証する。
4. accessibility/security review 済み operator UI と transport を明示的に enable する。
5. Kotoba WASM backend の typed record/document path を解決し、multi-runtime conformance
   を通してから runtime promotion を判断する。
