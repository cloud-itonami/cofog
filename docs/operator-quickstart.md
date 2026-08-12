# operator quickstart

この repo は 202 個のほぼ同形のディレクトリでできている。目視では「1 つだけ形が
違う」が見えないので、**まず構造検査を通してから中を読む**。所要 5 分。

ここに書いてある手順は 2026-08-12 に実際に踏んで、貼ってある出力はその実測値。

## 0. 前提

**west checkout の位置で実行する**（`orgs/cloud-itonami/cofog`）。step 3 の検証器は
`../../../../kotoba-lang/compiler` という相対パスで Kotoba compiler を探すので、
**深さの違う場所に clone すると解決しない**。

```bash
cd <superproject>/orgs/cloud-itonami/cofog
west update --fetch smart cloud-itonami-cofog   # pin に合わせる（任意）
```

step 3 だけ、隣の compiler repo に node_modules が要る（`bin/kotoba` の shebang が
`npx --no-install nbb` なので、PATH の nbb では代替されない）:

```bash
ls ../../kotoba-lang/compiler/node_modules/nbb   # 無ければ compiler 側で npm install
```

step 1・2 は素の `nbb` だけで動く。

## 1. 構造検査（毎回これを先に）

```bash
nbb scripts/inventory.cljs
```

```
appview/: 202 エントリ — component 101 / legacy service 101
COFOG code: 97 種 （どちらの面も同じ集合を覆う: true）
実装済み component（src/ を持つ）: 1 — cofog-0220-civil-component
manifest の @id: 1 種 — did:web:cofog.etzhayyim.com
同一 code に複数 component: 0310 ×5 (cofog-0310-de-component … cofog-0310-us-component)
org-un-cofog: 10 class 公開済み / このカタログが覆っていないもの 0
  （このカタログの 87 code は org-un-cofog 側が未公開。あちらは 96 class 中 10 class までしか出していない）

OK: 構造違反なし
```

固定しているのは 4 つだけ:

1. `appview/` 直下は component か legacy service のどちらか
2. どちらも `kotodama.jsonld` を持ち、読める
3. manifest の `name` がディレクトリ名と一致する
4. **component 面と legacy service 面が同じ COFOG code 集合を覆う**

4 が本体。「TS-native 移行先が legacy を 1 対 1 で写している」というこの repo の
前提そのもので、破れたら移行先か移行元のどちらかが欠けている。

違反があれば exit 1 で全件を名指しする。UN 標準との差だけは報告のみで**失敗に
しない** — `org-un-cofog` は 96 class 中 10 class までの途中の mirror なので、
差は「このカタログの誤り」ではない。

### この検査に歯があることを自分で確かめる

信じる前に赤くしてみる（4 通りとも exit 1 になる。確認後は元に戻すこと）:

```bash
printf '{ broken' > appview/cofog-0421-agriculture-component/kotodama.jsonld
nbb scripts/inventory.cljs; echo "exit=$?"     # exit=1 kotodama.jsonld が読めない
git checkout -- appview/cofog-0421-agriculture-component/kotodama.jsonld

mkdir appview/some-other-thing
nbb scripts/inventory.cljs; echo "exit=$?"     # exit=1 component でも legacy service でもない
rmdir appview/some-other-thing
```

manifest の `name` を書き換える／legacy service を 1 本退避する、でも同じく赤くなる。

## 2. 在庫表

```bash
nbb scripts/inventory.cljs --list
```

要約のあとに `code / 状態 / ディレクトリ` が 101 行。`implemented` は 1 行だけで、
残りは `stub`:

```
  01-1	stub      	cofog-01-1-gov-component
  0111	stub      	cofog-0111-executive-component
  0220	implemented	cofog-0220-civil-component
```

**`stub` は「manifest だけが在る」という意味**で、`package.json` の `main` は
存在しない `src/app.ts` を指している。ファイル数で実装量を測らないこと —
`cofog-0111-executive-component` はファイル数 38 で最多だが、うち 36 は `gen/` に
置かれた全部同一内容 194 バイトの `empty.s`（Go の `//go:wasmimport`
プレースホルダ）で論理は無い。

## 3. 唯一の実装を検証する

```bash
cd appview/cofog-0220-civil-component
npm test        # = nbb scripts/verify.cljs
```

```
kotoba check: core + resilience + authority + storage passed
deny-by-default: authority + storage passed
restricted ESM conformance: core + resilience main=42
```

3 行が意味しているもの:

1. `.kotoba` 4 本が宣言した policy の下で compiler の admission を通る
2. **effect を持つ module（authority / storage）が空 policy で拒否される** —
   deny-by-default が実際に閉まることの実演。閉まらなければ検証器が自分で
   exit 1 にする
3. compiler が吐いた restricted ESM を Node で実行して `main=42` になる

初回は Kotoba compiler の JVM 起動を含むので数分かかる。共有マシンなので
`node <superproject>/scripts/resource-guard.mjs run build -- npm test` で
resource governor を通す（他セッションが build 中なら exit 2 で待たされる）。

**この 3 行が通っても「civil defense が動いている」ことにはならない。**
何を主張していないかは同ディレクトリの `MATURITY.md` の「Not claimed」節が正本 —
official feed 未接続、実鍵なし、`component.wasm` 未生成、**警報は配信していない**。

## 4. UN 標準と突き合わせる（任意）

step 1 の出力に自動で入るが、隣の repo が checkout されている時だけ:

```bash
ls ../org-un-cofog/data/classes | wc -l    # 公開済み class 数
```

`org-un-cofog` が「分類とは何か」の正本で、ここはそれを**使う側**。分類自体を
この repo に足さない。

## 5. ここでやらないこと

- **新しい COFOG 事業をここに足さない。** 実装済み actor は
  `cloud-itonami/cloud-itonami-cofog-XX.X` が 1 group 1 repo で持つ。ここは
  凍結カタログで、動く事業の置き場ではない（`docs/adr/0001-cofog-repo-boundary.md`）。
- **`appview/etzhayyim-performer-…` を直接編集しない。** git-subrepo で取り込んだ
  複製で、上流は `etzhayyimcojp` org の個別 repo（各ディレクトリの `.gitrepo` に
  remote と commit が入っている）。ここで直しても上流には戻らない。
- **`README.edn` / `migration.edn` を書き換えない。** 抽出時の由来を固定した
  canonical EDN（`:verification :exact-source-tree-plus-canonical-edn`）。
