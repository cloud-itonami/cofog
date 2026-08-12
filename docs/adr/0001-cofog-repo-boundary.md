# ADR-0001: この repo の役割と、COFOG を名乗る隣接 repo との境界

## Status

Accepted (2026-08-12)

`appview/cofog-0220-civil-component/docs/adr/` の ADR 群はその component 内部の
決定で、この ADR は repo 全体の位置づけを扱う。番号空間は別。

## Context

この workspace には COFOG（UN 政府機能分類）を名乗る repo が 4 系統ある。

- `cloud-itonami/org-un-cofog` — 分類そのものの機械可読 mirror
- `kotoba-lang/cofog` — COFOG code → 必要技術 capability の registry ライブラリ
- `cloud-itonami/cloud-itonami-cofog-XX.X` — group ごとの実装済み actor
- `cloud-itonami/cofog` — **この repo**

この repo だけが README.md を持っておらず、名前も `cofog` としか言っていなかった。
そのため中身を見ないと役割が判別できず、実測でも自動化された成熟度計測が
`:repo/kind "unclassified"` として扱っていた。

中身は次のとおり（`scripts/inventory.cljs` の実測値、2026-08-12）:

- `appview/` に 202 ディレクトリ — component 面 101 / legacy service 面 101
- 両面は同じ 97 個の COFOG code を覆う（0310 が国別窓口 5 本に分かれるため
  101 対 97）
- **`src/` を持つ component は 1 本だけ**（`cofog-0220-civil-component`）。
  残り 100 本は `kotodama.jsonld` + `package.json` だけの在庫項目で、
  `main` は存在しない `src/app.ts` を指している
- legacy service 面は全 101 本が git-subrepo で、上流は `etzhayyimcojp` org の
  個別 repo

由来は repo 自身の canonical EDN が持っている。`migration.edn` の
`:verification :exact-source-tree-plus-canonical-edn` は、2026-07-20 に
etzhayyim の `60-apps/etzhayyim-project-cofog`（source revision `4d24eba6`）から
**source tree をそのまま複製し canonical EDN 2 枚を足しただけ**であることを意味する。

## Decision

1. **この repo は在庫カタログであり、actor ではない。** README.md 冒頭でそう名乗り、
   上記 3 系統との境界を表で示す。名前が役割を示さない repo は README 冒頭で
   名乗る、という workspace 規則（ADR-2608040100 / concept 索引）の適用。
2. **新しい COFOG 事業をここに足さない。** 動く actor は
   `cloud-itonami-cofog-XX.X` が 1 group 1 repo で持つ。ここは「かつて何が宣言
   されていたか」を失わないために在る。
3. **分類そのものをここに複製しない。** COFOG の定義は `org-un-cofog` が正本で、
   この repo は使う側。`scripts/inventory.cljs` の突き合わせも、差を報告するだけで
   失敗にしない — あちらは 96 class 中 10 class までの途中の mirror なので、
   差は「このカタログの誤り」ではなく「あちらの未公開」。
4. **カタログが 1 対 1 の写しであることを機械で固定する。**
   `scripts/inventory.cljs` が (a) `appview/` 直下の素性 (b) `kotodama.jsonld` の
   可読性 (c) manifest の `name` とディレクトリ名の一致 (d) **component 面と
   legacy service 面の COFOG code 集合の一致** を検査し、違反で exit 1 にする。
   (d) がこの repo の成立条件そのもの。
5. **`appview/etzhayyim-performer-…` を直接編集しない。** git-subrepo の複製で、
   上流は `etzhayyimcojp` の個別 repo。ここでの修正は上流に戻らない。

## Consequences

- 202 ディレクトリの中で 1 本だけが実装であることが、README と
  `nbb scripts/inventory.cljs` の 1 行目から読める。ファイル数で実装量を測ると
  `cofog-0111-executive-component`（38 ファイル中 36 が全部同一内容 194 バイトの
  `empty.s` プレースホルダ）を実装と誤読するが、`src/` の有無で測ればしない。
- 1 対 1 の写しが崩れたとき、目視ではなく exit 1 で分かる。
- 分類の更新は `org-un-cofog` 側の仕事になり、ここには波及しない。

## Not decided here

- **移行を再開するか、カタログのまま置くか。** 100 本の component は移行先が
  予約されただけで移行は始まっていない。再開する／畳むはオーナー判断で、この
  ADR は現在地を記述しただけ。
- **202 の manifest が同じ `@id: did:web:cofog.etzhayyim.com` を名乗っている件。**
  actor ごとの DID になっていないが、意図的な project 単位 DID なのか移行の
  取りこぼしなのかは etzhayyim 側の設計に属する。README に不揃いとして記録する
  にとどめる。
