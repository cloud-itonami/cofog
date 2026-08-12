# cloud-itonami/cofog

**UN COFOG（政府機能分類）でコード付けされた行政サービス actor の在庫カタログ。**
etzhayyim の legacy service 群 101 本と、その TS-native 移行先 component 101 本を
1 つの tree に固定してある。実装を持つのは**そのうち 1 本だけ**で、残りは manifest
だけの在庫項目。

名前が `cofog` としか言っていないので、まずここで名乗る — この repo は
**カタログであって actor ではない**。COFOG を名前に持つ repo はこの workspace に
4 系統あり、役割が違う。

## 最近接 repo との境界

| repo | 役割 | こことの違い |
|---|---|---|
| [`cloud-itonami/org-un-cofog`](https://github.com/cloud-itonami/org-un-cofog) | **origin 面**。UN COFOG 分類そのものの機械可読 mirror（`data/classes/{code}.json`） | あちらが「分類とは何か」の正本。ここは分類を**使う側**で、分類自体は持たない |
| [`kotoba-lang/cofog`](https://github.com/kotoba-lang/cofog) | **library**。COFOG code → その機能を回すのに要る技術 capability の registry（`kotoba.cofog`） | あちらは code から必要能力を引く関数。ここは code に紐づく actor の在庫 |
| [`cloud-itonami/cloud-itonami-cofog-XX.X`](https://github.com/cloud-itonami) | **実装済み actor**。COFOG group ごとに 1 repo（05.1 廃棄物、06.3 上水、04.5 交通 …） | あちらが「動く事業」。ここは動かない在庫の側 |
| **ここ**（`cloud-itonami/cofog`） | **在庫カタログ**。etzhayyim から抽出した 202 ディレクトリの凍結コピー | 上 3 つのどれでもない。実装は 1 本を除いて無い |

新しく COFOG の事業を起こすなら `cloud-itonami-cofog-XX.X` の側。ここは
「かつて何が宣言されていたか」を失わないために在る。

## 中身

```
appview/
  cofog-<code>-<slug>-component/         101 本  TS-native 移行先。実装は 1 本のみ
  etzhayyim-performer-…-svc-cofog-…/     101 本  legacy service（git-subrepo）
README.edn / migration.edn / NOTICE      抽出の由来（下記）
scripts/inventory.cljs                   カタログの構造検査
docs/operator-quickstart.md              最初に踏む手順
```

両面は**同じ 97 個の COFOG code を覆う**（101 ディレクトリに対し code が 97 なのは、
0310 が国別窓口 5 本に分かれているため — DE BKA / JP NPA / UK Action Fraud /
US FBI IC3 / 一般 police services）。10 division すべてに項目がある。

### component 面（101 本）

`kotodama.jsonld` + `package.json` の 2 ファイルだけのものが 98 本。残り 3 本:

- **`cofog-0220-civil-component`** — この repo で唯一の実装。Kotoba の
  governed passive civil-defense event relay（`src/cofog/*.kotoba` 4 本 +
  policy / storage-policy / authority-policy + 自前の ADR 4 本 + `MATURITY.md`）。
  検証は `npm test`（下記 quickstart）。**警報は配信していない** — 何を主張して
  いないかは `appview/cofog-0220-civil-component/MATURITY.md` の「Not claimed」に
  ある。
- `cofog-0111-executive-component` — ファイル数は 38 で最多だが、うち 36 は
  `gen/`（wasi/* + etzhayyim/* の WIT インターフェース木）に置かれた 194 バイトの
  `empty.s` で、全部同一内容の Go `//go:wasmimport` 用プレースホルダ。**論理は無い。**
  ファイル数で実装量を測ると誤読する箇所。
- `cofog-01-1-gov-component` — `package-lock.json` があるだけ。

`package.json` の `main` は 98 本が存在しない `src/app.ts` を指している。移行の
宛先が予約されているだけで、移行そのものは始まっていない。

### legacy service 面（101 本）

すべて `etzhayyimcojp` org の個別 repo を [git-subrepo](https://github.com/ingydotnet/git-subrepo)
で取り込んだもの（各ディレクトリの `.gitrepo` に upstream remote と commit が入って
いる）。**上流はここではない。**

93 本が `README.md` + `proto/service.proto` + `sqlc.yaml` の同じ骨格を持ち、うち
92 本は Go 1.24 + Google ADK + MCP + Temporal + SQLC を宣言している（残る 1 本は
0220 の legacy 側で、2026-08-09 に Kotoba governed component へ書き換わった）。
骨格を持たない 8 本は別形で、
`PROJECT.jsonld` + `etzhayyim-discovery.yaml` + `metadata/capabilities.jsonld` を持つ
（0310 の国別 4 本ほか）。

## 由来

`README.edn` / `migration.edn` が正本。2026-07-20 に etzhayyim の
`60-apps/etzhayyim-project-cofog`（source revision `4d24eba6`）から
`:verification :exact-source-tree-plus-canonical-edn` で抽出した — **source tree を
バイト単位でそのまま持ってきて、canonical な EDN 2 枚を足しただけ**の凍結コピー。
以後 2026-08-09 に 0220 の Kotoba 実装が入っている。

ライセンスと charter rider は `NOTICE` を参照（Apache-2.0 + etzhayyim Charter
Compliance Rider v3.1）。

## 既知の不揃い（違反ではないが、知らないと誤読する）

- **202 の manifest がすべて同じ `@id: did:web:cofog.etzhayyim.com` を名乗る。**
  actor ごとの DID にはなっていない。project 単位の DID を各 manifest が
  そのまま持っている状態。
- COFOG code の表記が 2 箇所だけ 4 桁でない（division の `10`、
  budget-management の `01-1`）。`scripts/inventory.cljs` は正規化せずそのまま
  鍵にしている — 揃えると legacy 側との対応が崩れるため。
- `org-un-cofog` が公開済みの 10 class はすべてこのカタログに在るが、逆に
  このカタログの 87 code は `org-un-cofog` 側が未公開（あちらは 96 class 中 10）。
  **差は「このカタログの誤り」ではなく、あちらの mirror が途中**。

## 最初に踏むもの

[`docs/operator-quickstart.md`](docs/operator-quickstart.md) — 構造検査、在庫表、
唯一の実装の検証まで。
