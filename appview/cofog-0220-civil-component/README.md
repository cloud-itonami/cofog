# COFOG 0220 — Passive Civil Defence

Kotoba 言語で実装した、狭い範囲の民間警報ガバナーです。登録済み公的機関の
署名付きイベントを検証し、行政区域単位のデータだけを扱い、外部配信ではなく
人間承認が必要な提案を生成します。

## 実装済み

- 閉じた civil-event schema と禁止データ・禁止文言の fail-closed 検査。
- 発行時刻、期限、未来時刻、重複、event-id 衝突、更新・解除参照の検査。
- authority、exact HTTPS origin、署名結果を入力証拠として扱う純粋な governor。
- authority key をアプリに渡さない `:identity/verify` capability 境界。
- proposal と event/hash/operation に束縛された一回限りの人間承認。
- event ledger append、approval consumption、outbox enqueue を一つの
  `:cofog-0220-state` CAS 更新にまとめる checkpoint。
- outbox の lease、attempt、retry、dead-letter、冪等性キー。
- 配達結果の hash-chain attestation と、非配信 shadow observation。
- 行政区域限定の multi-source quorum、stale/revocation observation。
- 二者承認された offline bundle と複数 provider route の failover 提案。
- synthetic drill の区域・施設到達率、route 成功率、復旧時間 metrics。
- 座標、trajectory、targeting、sensor track、weapon assignment 等の reason-mask 拒否。
- capability-free core の restricted ESM conformance fixture。

## 安全境界

このコンポーネントは民間被害の低減専用で、迎撃・攻撃システムではありません。
精密座標、trajectory、intercept、target、launch site、sensor track、military unit、
friendly-force location、weapon assignment、person/device identifier、user location を
拒否します。AI による警報・解除の生成も行いません。

公開 transport は同梱していません。authority verification、clock、CAS storage、
transport、credentials は host が所有し、Kotoba application は ambient authority を
持ちません。既定 policy は空で、effectful adapter は個別 policy がなければ拒否されます。

## 検証

```bash
npm test
```

検証は Kotoba compiler の check、effect module の deny-by-default、restricted ESM
compile、conformance fixture `main=42` を実行します。生成物は `target/` に置かれ、
repository には追加されません。

署名対象は `canonical-event` / `approval-canonical` が返す canonical document bytes の
lowercase hexadecimal 表現です。時刻は Unix milliseconds の `i64` です。

## 構成

- `src/cofog/civil_defense.kotoba` — 純粋な state/event decision、approval、outbox。
- `src/cofog/civil_resilience.kotoba` — quorum、offline/failover、drill coverage、安全境界。
- `src/cofog/authority_verifier.kotoba` — operator registry を所有する署名検証 capability。
- `src/cofog/checkpoint_store.kotoba` — 単一キー CAS 永続化 capability。
- `config/authority-registry.edn` — 実 key を含まない fail-closed 設定。
- `config/providers.edn` — provider を無効化した host wiring 契約。
- `proto/civil_defense.proto` — arbitrary execute-function を持たない wire contract。
- `scripts/verify.cljs` — nbb/CLJS 検証オーケストレーター。
- `docs/adr/0003-kotoba-governed-relay.md` — 現行アーキテクチャ決定。
- `docs/adr/0004-passive-resilience-coverage.md` — 民間防護 coverage 拡張。

## 非主張

live official feed、実 authority/approver key、operator UI、外部 transport、運用 CAS
provider は未接続です。restricted ESM は検証済みですが `component.wasm` は未生成で、
実警報を配信したという主張もありません。
