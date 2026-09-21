<!-- status: draft (方針案。承認後に HANDOFF-slnmix-petari-2026-09.md §17 と webview2-bridge HANDOFF.md §10 へ決定を追記する) -->
# 動作確認の自動化 — テスト戦略 設計メモ v0.1 (2026-09-21)

## 0. この文書の位置づけ

- 「開発のたびに会社 PC で手を動かして動作確認する」手間を、テストコードを書く感覚で
  減らすための方針書。webview2-bridge / slnmix / petari の 3 リポジトリにまたがるので、
  HANDOFF-slnmix-petari と同じく slnmix の docs/ に置く
- 読者はユーザー本人と、各リポジトリで実装にあたる Claude Code。テストの知識を前提に
  しないよう、使う用語は §2 に限る
- 結論を先に書く
  1. **専用ツールは自作しない。** Playwright Test + Vitest + xUnit という既製のランナーを
     使い、自作するのは「WinForms ホストを起動して接続する部品」「DB を検証する部品」
     「結果を AI に貼れる形にする部品」の 3 つだけ
  2. **検証を 3 層に分け、DB が要る層を最小にする。** DB が要らない層は Mac や
     クラウドの Claude Code が自分で走らせる。会社 PC で打つのは 1 コマンド
  3. **slnmix の手順文と文書ひな型に「テストも一緒に出す」を組み込む。** M365 Copilot に
     コードとテストを同じ changes.md で出させ、petari で適用し、`pnpm test` の結果を
     貼り返す。petari は当面無改修

### 前提 (変わらない制約)

| 項目 | 内容 |
|---|---|
| DB | SQL Server と Oracle が直近の主対象。ただし他の DB でも使える形にする。**テスト用の DB またはスキーマは用意できる** |
| DB への到達 | 社内ネットワークの会社 Windows PC からのみ。Mac / クラウドの Claude Code からは届かない |
| 会社 PC | Windows 11、Store / winget 不可。Node + pnpm は導入済み (create-webview2-bridge の実績)。Edge と WebView2 ランタイムあり |
| AI | Claude Code (Mac / クラウド。コマンドを実行できる) と M365 Copilot Chat (会社 PC。実行はできず、changes.md を返すだけ) |
| 対象 | WebView2 + React で作る新規・改修アプリ (webview2-bridge 系)。**旧 WinForms のみのプロジェクトは対象外** (会社としてテストコードを書いていないため) |

## 1. 何を自動化するか

### 1-1. 現状

1. AI が changes.md を返す → petari で適用
2. 会社 PC でビルドし、exe を起動し、画面を手で操作し、DB を SQL で覗いて確認する
3. 結果を AI に文章で伝える

2 が毎回の手作業で、しかも DB の確認は「何を見るべきか」を毎回思い出す必要がある。

### 1-2. ゴール

- 会社 PC で打つのは `pnpm test` (または `pnpm test:e2e`) の 1 つ。画面操作と DB 確認が
  自動で走り、結果が Markdown 1 枚になってクリップボードに入る (petari の失敗レポートと
  同じ使い勝手)
- DB を触らない検証は AI 側で完結させ、会社 PC の出番を「DB を触る検証」だけにする
- テストの書き方を 1 つの型に固定し、AI (Copilot / Claude Code) がその型でテストを
  書けるようにする。ユーザーがテストを書く必要はない (読めれば十分)
- 新規アプリでは `pnpm create webview2-bridge` の時点で仕組みが入っている

### 1-3. やらないこと

- 旧スタイル .vbproj の WinForms のみのプロジェクトへのテスト導入。ブラウザ系ツールが
  効かず、UI Automation (FlaUI 等) は壊れやすい。会社方針とも合わない
- 見た目の回帰テスト (スクリーンショット比較)。環境差で誤検知が多く、運用が続かない
- 100% の自動化。印刷・外部連携・目視が要るものは手動確認として残し、引継ぎ書に
  「自動 / 手動」を分けて記録する

## 2. この文書で使う用語 (最低限)

| 用語 | 意味 | この文書での使い方 |
|---|---|---|
| 単体テスト | 関数やクラス 1 つを、他と切り離して確かめる小さなテスト。速い | Vitest (TS) と xUnit (VB) |
| E2E テスト | 実際の画面を操作して、最後まで通しで確かめるテスト。遅いが実態に近い | Playwright |
| ランナー | テストを見つけて実行し、結果を集計するプログラム | Playwright Test / Vitest / `dotnet test` |
| フィクスチャ | テストの前後に「準備」と「後片付け」をしてくれる部品。テスト本文には `page` や `db` として渡ってくる | 自作するのは主にこれ |
| Arrange / Act / Assert | テスト 1 本の型。準備 → 操作 → 確認 | すべてのテストをこの 3 段で書く |
| セレクタ | 画面の要素を指す目印。`data-testid="submit"` のように React 側で付ける | 見た目や文言に依存しないため壊れにくい |
| レポータ | ランナーの結果を人や AI 向けの形式に出す部品 | Markdown を出してクリップボードへ |
| テストデータの分離 | テストが入れたデータを他のテストや既存データと混ぜないこと | 実行 ID の接頭辞と後片付けで実現 |

## 3. 3 層構成 (どこで・誰が・何を確かめるか)

| 層 | 確かめること | 道具 | DB | 走る場所 | 誰が走らせるか |
|---|---|---|---|---|---|
| **L1 画面ロジック** | 入力検証、ボタンの活性、一覧表示、エラー表示など、画面の振る舞い | Playwright + Vite dev サーバー + MemoryTransport (モック応答) | 不要 | Mac / クラウド / 会社 PC どこでも | **Claude Code が自分で**。Copilot 開発時はユーザーが `pnpm test` |
| **L2 業務ロジック** | VB の Impl (`Implements IXxxApi`) を直接呼び、SQL と DB 更新が正しいか | xUnit (net48) + テスト DB | **要** | 会社 PC | ユーザー (`dotnet test`)。将来はランナー (§8-3) |
| **L3 通し** | 実際の exe + WebView2 で画面を操作し、DB が変わったことまで確かめる | Playwright (CDP 接続) + DB ヘルパ + テスト DB | **要** | 会社 PC | ユーザー (`pnpm test:e2e`) |

分ける理由:

- 会社 PC でしか走らないもの (L2 / L3) を減らすほど、手動の出番が減る。React 側の
  作り込みの大半は L1 で確かめられる
- 失敗の切り分けが速い。L1 が通って L3 が落ちるなら原因は VB か DB、L2 が落ちるなら
  SQL、と絞れる
- 本数の目安: L1 は画面ごとに数本〜十数本、L2 は API メソッドごとに 1〜3 本、L3 は
  主要シナリオ (登録・更新・削除・検索) を画面ごとに数本。L3 は遅いので増やしすぎない

補足: Vitest は L1 の下に位置する「関数単位」のテスト (契約の zod 検証、モックハンドラ、
表示用の整形関数など) に使う。gen / client では既に使っている。React コンポーネント
単体のテスト (Testing Library) は入れない。L1 の Playwright で画面ごと確かめる方が
ユーザーにも AI にも分かりやすく、道具が 1 つ減る。

## 4. 道具の選定と理由

### 4-1. Playwright Test (L1 / L3。ブラウザ操作 + ランナー + レポート)

- **WebView2 を直接操作できる** (公式にサポート)。ホスト exe を環境変数
  `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222` 付きで起動すると
  WebView2 がデバッグ口を開くので、テスト側は `chromium.connectOverCDP("http://localhost:9222")`
  で繋ぐ。**ホストの VB は無改修**
- **ブラウザのダウンロードが不要**。L3 は WebView2 ランタイムに繋ぐだけ。L1 は
  `channel: "msedge"` で会社 PC の Edge を使う (Mac / クラウドでは Playwright 同梱の
  Chromium)。Store / winget 不可の環境でも npm からの取得だけで済む
- ランナー・並列制御・リトライ・スクリーンショット・トレース・カスタムレポータが
  一式揃っている。自作する範囲が最小になる

### 4-2. Vitest (関数単位)

gen / client で使用中。apps/web と雛形にも同じ設定を置く。新しい道具ではない。

### 4-3. xUnit (L2)

`WebView2Bridge.Contract.Tests` (net8.0、Mac で `dotnet test` 可) と同じ流儀で、
`<App>.Impl.Tests` を **net48** で作る。net48 の xUnit は Windows の `dotnet test` で動く
(会社 PC 限定)。Impl が SqlClient / Oracle.ManagedDataAccess を使うため net48 固定。
テスト DB の接続文字列は環境変数から読む (§5-1)。

### 4-4. DB アクセスの汎用化: Knex を薄く包む

「SQL Server と Oracle が主だが他も使いたい」に対して、DB ごとにアダプタを自作するのは
保守が続かない。**Knex** (Node の SQL ビルダ兼接続層) を devDependency として使い、
その上に §5-3 の小さなヘルパを載せる。Knex が方言を吸収するので、ヘルパは DB を知らない。

| DB | Knex の client | npm ドライバ | 備考 |
|---|---|---|---|
| SQL Server | `mssql` | `tedious` | 純 JS |
| Oracle | `oracledb` | `oracledb` 6.x | thin モード。Instant Client 不要 |
| PostgreSQL | `pg` | `pg` | 純 JS |
| MySQL / MariaDB | `mysql2` | `mysql2` | 純 JS |
| SQLite | `better-sqlite3` | `better-sqlite3` | ネイティブビルドあり |

ドライバは各アプリが自分の分だけ入れる (テスト部品の `peerDependencies` は optional)。
「実行時依存ゼロ」は petari の方針であり、webview2-bridge のテスト部品は
devDependency なので矛盾しない。

### 4-5. 採らなかった案

| 案 | 採らない理由 |
|---|---|
| Cypress | WebView2 に繋げない。ブラウザ同梱で会社 PC への導入が重い |
| Selenium / WebDriver | WebView2 対応はあるが Edge Driver の版合わせが要る。ランナーは別途必要 |
| FlaUI / WinAppDriver (WinForms 直接操作) | 旧 WinForms を対象外にした時点で不要。壊れやすく AI にも書きにくい |
| 自作ランナー / 自作 DB アダプタ | 既製で足りる。自作は §6-1 の 3 部品に限る |
| ORM (Prisma / TypeORM) でスキーマを持つ | テストのためにスキーマ定義を二重管理することになる。Knex の生 SQL / ビルダで十分 |
| Docker で DB をローカルに立てる | 会社 PC に Docker を入れられない。テスト DB があるので不要 |

## 5. DB 検証の設計 (汎用の型)

### 5-1. 接続とガード

- 接続情報は環境変数 (`E2E_DB_CLIENT=mssql|oracledb|pg|...` と client ごとの接続項目)。
  `.env.e2e.local` に置き **gitignore**。雛形には `.env.e2e.example` を同梱
- **本番に向けて走らない仕組み**を必ず入れる。テスト設定に `allowedDatabases`
  (DB 名 / スキーマ名 / 接続先ホストの許可リスト) を書き、接続先がそれに一致しないと
  ランナーが起動時に止まる。テスト DB があるからこそ、この 1 行で事故を防げる
- 接続は 1 回のテスト実行で 1 つ (Playwright の worker fixture)。テストごとに繋ぎ直さない

### 5-2. テストデータの分離

- 各テストに **実行 ID** (`testId`、例 `E2E-20260921-1432-a7`) を渡す。テストが作る
  マスタや伝票のキー・名称にこの接頭辞を付ける
- 既存データに依存するテストを書かない。必要な前提行は Arrange で自分で入れる
- **後片付けはフィクスチャが自動で行う**。`db.insert` で入れた行と、`db.diff` で
  「増えた」と判定された行 (画面操作でアプリが作った行) を teardown で削除する。
  削除順は挿入の逆順 (外部キー対策)。削除できなかった行はレポートに残す
- L3 は **直列実行** (`workers: 1`)。DB を共有するので並列にしない。L1 は並列でよい

### 5-3. ヘルパ API (自作部品その 2)

テスト本文に `db` として渡る。DB 方言は知らず、Knex に委ねる。

| 関数 | 役割 |
|---|---|
| `db.query(sql, params)` | 生 SQL。読み取り用。バインドは `?` (Knex が方言に変換) |
| `db.insert(table, row)` / `db.insertMany(table, rows)` | 前提行の投入。後片付けの対象として記録する |
| `db.rows(table, where)` | 条件に合う行を取る (Knex ビルダ。AI が SQL を書かずに済む) |
| `db.snapshot(specs)` | `{ table, key: [...], where? }` の配列を受け、現在の行を控える |
| `db.diff(snapshot)` | 控えと現在を比べ、テーブルごとに `inserted / updated / deleted` を返す。`updated` は変わった列だけを `{ before, after }` で返す |
| `db.expectRow(table, where, expected)` | 1 行取って部分一致を確認する短縮形 |

`snapshot` は大きいテーブルで全行を取らないよう、`where` (通常は `testId` 接頭辞) か
「キーの最大値より後ろ」で絞る。何も指定しないと警告を出す。

### 5-4. テストの型 (これ 1 つに固定する)

```ts
import { test, expect } from "@ishibashi0112/webview2-bridge-test";

test("受注を登録すると Orders に 1 行増え、画面に採番が表示される", async ({ page, db, testId }) => {
  // Arrange: このテスト固有の前提データを入れ、変化を見たいテーブルを控える
  await db.insert("Customers", { CustomerCode: `${testId}-C1`, Name: "テスト顧客" });
  const before = await db.snapshot([{ table: "Orders", key: ["OrderNo"], where: { CustomerCode: `${testId}-C1` } }]);

  // Act: 画面を操作する (data-testid で要素を指す)
  await page.getByTestId("customer-code").fill(`${testId}-C1`);
  await page.getByTestId("submit").click();
  await expect(page.getByTestId("order-no")).toHaveText(/^ORD-/);

  // Assert: DB の変化を確かめる
  const diff = await db.diff(before);
  expect(diff.Orders.inserted).toHaveLength(1);
  expect(diff.Orders.inserted[0]).toMatchObject({ CustomerCode: `${testId}-C1`, Status: "NEW" });
});
```

L1 (MemoryTransport) では `db` を使わず `page` だけで書く。L2 (xUnit) は同じ
Arrange / Act / Assert を VB で書き、Act が画面操作ではなく `api.Register(req)` になる。

### 5-5. SQL Server と Oracle の差で気をつける点

| 差 | 吸収のしかた |
|---|---|
| バインド変数の記法 (`@p` / `:p`) | Knex の `?` に統一 |
| 識別子の大文字小文字 (Oracle は引用符なしだと大文字) | ヘルパはテーブル名・列名をそのまま引用符付きで渡す。Oracle のプロジェクトでは DB 上の実際の名前 (通常は大文字) で書く。雛形の README に明記 |
| 日付型 (`DATE` に時刻が入る等) | 比較は文字列にせず、`toMatchObject` で必要な列だけ見る。日付は ISO 文字列に整えてから比べる小関数をヘルパに置く |
| 採番 (IDENTITY / シーケンス) | テストは採番値を決め打ちしない。`inserted` の行から読む |
| 行数上限の書き方 (`TOP` / `FETCH FIRST`) | Knex の `.limit()` |

## 6. webview2-bridge への組み込み

### 6-1. 新パッケージ `packages/test` (npm: `@ishibashi0112/webview2-bridge-test`)

公開パッケージが gen / client / create の 3 つから 4 つになる (HANDOFF.md §10 に決定を
追記)。中身は自作する 3 部品だけ。

1. **`hostApp` フィクスチャ**: exe を CDP 有効で起動 (環境変数を付けて spawn)、
   `connectOverCDP` で繋ぎ、最初のページを `page` として渡し、終了時に exe を落とす。
   `WEBVIEW2_USER_DATA_FOLDER` を一時ディレクトリにして実行ごとに掃除する。
   exe のパスは `playwright.config.ts` の `use.hostExe` (既定 `dotnet/<App>.Host/bin/Debug/net48/<App>.Host.exe`)
2. **`db` / `testId` フィクスチャ** (§5)。Knex を包む
3. **レポータ**: Playwright のカスタムレポータ。失敗したテストごとに「テスト名 / 失敗した
   行と期待値・実際値 / 画面のスクリーンショットのパス / DB diff (attach 経由) / 後片付けの
   結果」を Markdown 1 枚 (`test-results/report.md`) にまとめ、**クリップボードにコピー**
   する (petari の `clipReportOnFailure` と同じ体験。実装も同じ OS コマンド方式)。
   Copilot に貼る前提で 120K 文字以内に切り詰める

### 6-2. 雛形 `templates/myapp/` に足すもの

```text
e2e/
  playwright.config.ts     # projects: "screen" (L1: Vite dev + memory) / "host" (L3: CDP)
  e2e.config.ts            # allowedDatabases、追跡テーブル、hostExe
  support/                 # 上記パッケージの re-export と、アプリ固有の小さな拡張 (通常は空)
  screen/sample.spec.ts    # L1 の見本 1 本
  host/sample.spec.ts      # L3 の見本 1 本 (§5-4 と同じ形)
  README.md                # テストの型・命名・data-testid の約束・コマンド
.env.e2e.example
dotnet/MyApp.Impl.Tests/   # net48 xUnit の見本 1 本 (接続文字列は環境変数)
```

`package.json` の scripts:

| script | 内容 | 走る場所 |
|---|---|---|
| `test` | Vitest + Playwright "screen" (L1) | どこでも |
| `test:impl` | `dotnet test dotnet/MyApp.Impl.Tests` (L2) | 会社 PC |
| `test:e2e` | Playwright "host" (L3)。前提: `pnpm build:web` と `dotnet build` 済み | 会社 PC |
| `test:all` | 上 3 つを順に。会社 PC で打つ 1 コマンド | 会社 PC |

雛形を変えるので gen はマイナー版を上げる (0.5.0)。`packages/gen/template/myapp/` は
`sync` で追従する。

### 6-3. ホスト側 (VB) は無改修

CDP は環境変数で有効になる。Release ビルドでも効くが、テストは Debug ビルドを対象に
する (`WEBVIEW2_BRIDGE_DEV_URL` と同じ扱い)。配布する exe を変えない。

### 6-4. React 側の約束

- 操作する要素・確認する要素には `data-testid` を付ける。命名は `<画面>-<役割>`
  (例 `order-submit`, `order-no`)。テストは文言や CSS で要素を選ばない
- この約束を雛形の README と slnmix の手順文 (§7-1) の両方に書く。AI が画面を作るときに
  自然に付くようにする

### 6-5. リポジトリ内の見本アプリ `apps/web` にも同じ構成を入れる

`apps/web/e2e/screen/` に L1 を数本置き、`pnpm -r test` に含める。**Claude Code で
webview2-bridge を触るときの完了条件に L1 を加える** (HANDOFF.md §11 のコマンド節に追記)。
L3 は会社 PC の Windows 実機確認の手順 (HANDOFF.md 「Windows での実行確認」) に
`pnpm test:e2e` を足す。

## 7. slnmix / petari への組み込み (「テストを意識づける」)

Copilot は実行できないので、Copilot 開発でのテストは「Copilot が書き、ユーザーが走らせ、
結果を貼り返す」往復になる。往復を減らすため、手順文と文書ひな型でテストを標準の
成果物にする。

### 7-1. 手順文 v6 (`src/assets/procedure.ts`)

- 「パックの読み方」に追加: `<file>` のうち `e2e/`・`*.spec.ts`・`*.test.ts`・
  `*.Tests/` は自動テスト。既存のテストは変更対象であり、手本でもある
- 「回答の構成」の **変更** に追加: 「変更した振る舞いに対応するテストを、同じ changes.md に
  含めてください。DB を触らない画面の振る舞いは `e2e/screen/`、VB の業務ロジックは
  `*.Impl.Tests/`、画面から DB までの通しは `e2e/host/` です。既存テストの型
  (Arrange / Act / Assert、`data-testid`、`testId` 接頭辞) に合わせてください。テストを
  出さない場合は理由を 1 行書いてください」
- **自己検証** に 2 項目追加: 「変更した振る舞いにテストがあるか (ないなら理由)」
  「画面に追加した要素に `data-testid` を付けたか」
- 「判断の原則」に追加: 「テストは既存データに依存させず、`testId` 接頭辞で前提行を
  入れてください。本番データを前提にしないでください」
- design モード: 設計書 §9 の各バッチに「完了条件 (自動テスト / 手動確認)」を書かせる
- **テストが無いプロジェクトでは求めない**: パックに上記パスのテストが 1 つも無く、
  `slnmix.config.json` にも `tests` の宣言が無いときは、テストの節を出さない
  (docs 連携の `{{DOCS_SECTIONS}}` と同じ条件付き置換 `{{TEST_SECTIONS}}`)。
  旧 WinForms のみのプロジェクトはこれで自動的に対象外になる
- `PROCEDURE_VERSION = 6`、`test-fixtures/procedure/` のスナップショット更新

### 7-2. 文書ひな型 (`src/assets/docTemplates.ts`)

| 文書 | 追加 |
|---|---|
| 設計書 §9 実装バッチ計画 | 列「完了条件」を「自動テスト (ファイル名) / 手動確認 (項目)」に分ける |
| 仕様書 | 章「10. テスト」を追加 (11. 未実装・既知の制限、12. 更新履歴 に繰り下げ)。機能 (F-n) ごとに、どのテストが守っているかと、手動確認が要る項目 |
| 引継ぎ書 §7 動作確認の記録 | 「自動テスト: コマンド / 件数 / 失敗 0 件」と「手動確認: 項目と結果」を分けて書く |

`DOC_TEMPLATES_VERSION` を上げる。

### 7-3. `slnmix.config.json`

- `extraRoots` の `kind: "test"` に既定の include (`**/*.{ts,tsx,vb,json}`) を足す
  (`slnmixConfig.ts` の `DEFAULT_INCLUDE`)。雛形が生成する設定に
  `{ "path": "e2e", "kind": "test" }` を含める。`*.Impl.Tests` は SDK スタイル .vbproj
  なので .sln 経由で既に入る
- パックが 120K を超えるときは `--focus` で対象画面のテストだけを全文にする
  (既存機構。テスト固有の対応は不要)

### 7-4. 失敗レポートの往復

- フェーズ C ではレポータがクリップボードに入れる Markdown をユーザーが貼る。
  petari の失敗レポートと同じで、slnmix は無改修
- 任意 (フェーズ D): `slnmix.config.json` に `testReport: "test-results/report.md"` を
  書けるようにし、ファイルが 30 分以内の更新なら本文用テキストに `<test_report>` として
  同梱する (petari の changes.md 自動検出と同じ時間規則)。貼り忘れをなくす

### 7-5. WORKFLOW.md

- 30 秒版の「ビルド・動作確認 → 結果を AI に伝える」を
  「ビルド → `pnpm test:all` → 失敗ならクリップボードのレポートを貼る → 手動確認は
  引継ぎ書の手動項目だけ → OK と伝える」に
- 3-2 の手順 3〜5 を同様に更新。「継続判定: 引継ぎ」の条件である「ビルドと動作確認の
  成功」は「自動テストが全件成功し、手動項目も OK」と読み替える

### 7-6. petari

- フェーズ 1〜3 は **無改修**。apply の成否とテストは独立で、往復はレポータと
  クリップボードで足りる
- 任意: `petari apply` 成功時に「次: pnpm test:all」の 1 行案内 (config `nextHint`)。
  適用後にコマンドを実行する `--verify` は、非信頼入力である `.petari/config.json` から
  コマンドを走らせることになるため、`vscodeCommand` と同じ制限 (コマンド名か絶対パス、
  引数固定) を付けない限り入れない。当面は見送る

### 7-7. 旧 WinForms のみのプロジェクト

対象外で確定。§7-1 の条件付き置換により手順文にテストの節が出ないので、既存の
運用は変わらない。将来テストを入れたくなったら、フォームから切り離せる業務ロジック
クラスに限って L2 (xUnit net48) を足す、という順で検討する。

## 8. 実行環境と往復の形

### 8-1. 会社 PC (Windows)

前提: Node + pnpm (済)、Edge と WebView2 ランタイム (済)、Playwright は npm からの
取得のみ (ブラウザのダウンロードなし。`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` を
`.npmrc` か scripts に置く)、テスト DB の接続情報を `.env.e2e.local` に置く。

```text
pnpm build:web && dotnet build dotnet/MyApp.sln     (いつもどおり)
pnpm test:all                                        (L1 → L2 → L3)
  → 失敗があれば test-results/report.md がクリップボードに入る → Copilot に貼る
  → 全件成功なら「自動テスト OK」+ 手動項目の結果を伝える
```

### 8-2. Mac / クラウド (Claude Code)

`pnpm test` (Vitest + L1) を Claude Code が自分で走らせる。webview2-bridge 自体の改修と、
Claude Code で新規アプリを組むときは、L1 が通ることを完了条件にする。L2 / L3 は
「会社 PC で `pnpm test:all` を実行してください」と引継ぎ書に書く。

### 8-3. 任意: GitHub Actions のセルフホストランナー (フェーズ D)

会社 PC にランナーを常駐させると、ブランチを push するだけで L2 / L3 が社内 DB に対して
走り、結果を Claude Code (クラウド) が GitHub 経由で読める。往復が完全に自動になる。
ランナーが必要とするのは GitHub への outbound HTTPS だけで、DB は社内に留まる。
情シスへの確認事項は「会社 PC から GitHub へのランナー常駐接続」の 1 点。
不可なら 8-1 の手動貼り付けで運用する。

## 9. 段階計画

| フェーズ | 内容 | 完了条件 | 場所 |
|---|---|---|---|
| **A** webview2-bridge L1 | `packages/test` の骨組み (フィクスチャの型・レポータ)、`apps/web/e2e/screen/` に L1 を数本、`pnpm -r test` に組み込み | Mac / クラウドで `pnpm -r test` が通り、Claude Code が自分で回せる | webview2-bridge |
| **B** L3 と DB ヘルパ | `hostApp` (CDP 起動)、`db` / `testId` (Knex、mssql と oracledb で確認)、本番ガード、レポータ + クリップボード、雛形 `e2e/` と `Impl.Tests`、gen 0.5.0 | 会社 PC で雛形から作ったアプリの `pnpm test:all` が通り、わざと落とした 1 本のレポートが Copilot に貼れる形で出る | webview2-bridge (実装は Mac、確認は会社 PC) |
| **C** slnmix | 手順文 v6、ひな型更新、`kind: "test"` 既定、WORKFLOW.md | スナップショット更新済みで `pnpm test` 通過。実プロジェクトで Copilot がコードとテストを同じ changes.md で返す | slnmix |
| **D** 任意 | `<test_report>` 自動同梱、petari の 1 行案内、セルフホストランナー | 必要になったとき | 各 |

A と C は Claude Code だけで完結する。B の DB 部分だけ会社 PC での確認が要る。

## 10. 確認事項

| # | 種別 | 内容 | 期限 |
|---|---|---|---|
| 1 | 必須 | テスト DB は SQL Server と Oracle の両方にあるか。片方だけなら B の実機確認はその DB で行い、もう片方は Knex の方言差の範囲として扱う | B 着手前 |
| 2 | 必須 | テスト DB の接続情報を会社 PC のどこに置くか (`.env.e2e.local` 案でよいか)。本番ガードの許可リストに入れる DB 名 | B 着手前 |
| 3 | 後回し | パッケージ名 `@ishibashi0112/webview2-bridge-test` でよいか (`-e2e` も候補) | A 着手前 |
| 4 | 後回し | セルフホストランナー (§8-3) を情シスに相談するか。相談しない場合は D から外す | C 完了後 |
| 5 | 後回し | 旧 WinForms のみのプロジェクトを対象外とする (§7-7) で確定してよいか | C 着手前 |

## 11. 決定事項 (提案。承認後に各 HANDOFF の決定ログへ)

1. 専用ツールは自作せず、Playwright Test / Vitest / xUnit / Knex の上に 3 部品
   (hostApp、db、レポータ) だけを自作する
2. 検証は L1 (画面ロジック、DB なし) / L2 (VB 業務ロジック、DB あり) / L3 (通し、DB あり)
   の 3 層。DB が要る層は会社 PC 限定で、`pnpm test:all` の 1 コマンドにまとめる
3. DB 検証は Knex 経由で方言を吸収し、SQL Server / Oracle を実機確認、他 DB はドライバの
   追加だけで使える形にする。本番ガードと `testId` 接頭辞による分離を必須にする
4. 結果は Markdown をクリップボードに入れて AI に貼る (petari の失敗レポートと同じ体験)
5. slnmix の手順文と文書ひな型で「テストも同じ changes.md で出す」を標準にし、テストの
   無いプロジェクトでは求めない。petari は当面無改修
6. 旧 WinForms のみのプロジェクトは対象外
