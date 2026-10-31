# CLAUDE.md

## プロジェクト概要

slnmix — レガシー Visual Studio(.sln / .vbproj)の**論理構成**に基づいて
ソースを 1 ファイルへまとめる、repomix 互換フォーマットの CLI。
npm に公開済み(`npx slnmix`)。対象はレガシー VB.NET / .NET Framework /
Shift_JIS 環境。

## 解析コアの置き場

`src/` の解析コア(`types.ts` / `paths.ts` / `slnParser.ts` / `vbprojParser.ts` /
`logicalTreeBuilder.ts` / `services/*`)は **slnmix が唯一の置き場**。
かつて VS Code 拡張
[legacy_vb_workbench](https://github.com/ishibashi0112/legacy_vb_workbench)
(ローカル: `~/dev/legacy-vb-net-workbench`)と同一実装を二重管理していたが、
workbench は 2026-09 時点で凍結(新機能は追わない)。

- コアの修正を拡張側へ同期する必要はない。出力ヘッダーのツール名や Designer
  スキップ理由の文言を拡張側と揃える制約もない
- 将来 workbench で新コアが必要になったら、slnmix に `index.ts` で公開 API を
  追加して依存させる。パッケージ分離はそのとき検討する

改修の設計正本は `docs/HANDOFF-slnmix-petari-2026-09.md`。フェーズ順に実装し、
決めたことは同書 §17 決定ログに追記する。利用者向けの運用手順(場面別の
コマンドと流れ)は `docs/WORKFLOW.md`。運用に関わる挙動(モード自動選択・
継続判定・ひな型)を変えたら同書も更新する。導入審査向けの説明(通信・依存・外部コマンド・
残るファイル)は `docs/SECURITY-REVIEW.md`。依存・起動する外部コマンド・通信・
書き込むファイルを変えたら(petari 側の変更も含む)同書の表と対象バージョンを更新する。

### モジュール構成(コア外)

- `src/cli.ts` — 引数処理とファイル I/O(Node 標準の `util.parseArgs` を使用し、
  依存追加はしない)
- `src/targetResolver.ts` — 入力(.sln / .vbproj)の自動検出。その場所の
  `slnmix.config.json` が `kind: "generic"` なら探さずに generic 構成を返す
  (VB.NET 以外のプロジェクト。設計書 §19、v0.17.0)
- `src/initProject.ts` — `slnmix init`(初回セットアップの一本化。設計書 §20、v0.18.0)。
  リポジトリ直下でのみ動き、構成の判定(既存の設定 > 直下の .sln / .vbproj > 1 段下の
  .sln 1 つ → target > generic)・docs/・.gitignore への生成物の追記・依存の petari の
  `init --yes --no-repomix` 起動(`cli.ts` の `runPetariInit`)をまとめて行う。冪等
- `src/handoff.ts` / `src/clipboard.ts` — Copilot Chat への受け渡し(設計書 §21、v0.19.0)。
  実行の最後に、パックが貼付上限の目安(`PASTE_LIMIT_CHARS`)以内ならパック全体を、
  超えるなら本文用テキストをクリップボードへ入れる(`--no-clip` で無効)。
  クリップボードは OS コマンド(PowerShell Set-Clipboard / pbcopy / xclip)で、
  自動テストなし(petari の infra/clipboard.ts と同じ方式)
- `src/buildErrors.ts` / `src/msbuildRunner.ts` — `slnmix build`(設計書 §22、v0.20.0)。
  対象(パックと同じ決め方)を MSBuild でビルドし、失敗したらファイルロガー(ErrorsOnly・
  UTF-8)のログから標準のエラー形式を取り出して、今のファイルの周辺行(`│` 区切り。
  petari の失敗レポートと同じ書式)付きの文面をクリップボードへ入れる。抜粋・本文・ログの末尾・
  ファイルとして読めないエラーの発生元はパックと同じ規則で伏せる(v0.22.2。--no-mask / --no-strict-mask が効く)。
  抜粋は `maskLinesForDisplay`(credentialMasker.ts。ファイル全体を伏せた結果を元の位置に対応づけて
  行ごとに当てはめる。行ごとに伏せると複数行の値が漏れ、行数だけ揃えると行がずれるため。.vb は VB /
  汎用テキストの両方の伏せ方の範囲を伏せる。petari の core/mask.ts と同じコード)で、ファイルごとに
  1 回だけ作る。パックが .gitignore / .repomixignore で除外するファイルの抜粋は載せない
  (--no-gitignore で載せる)。MSBuild の場所は
  --msbuild > vswhere > MSBuild 14.0 / 12.0 > .NET Framework 4(実在するものだけ。
  deps 注入で単体テスト)。起動自体は自動テストなし
- `src/dbChecks.ts` — AI チャットだけでの DB 確認・動作検証(設計書 §23・§24、v0.21.0 / v0.22.0)。
  ルートに `docs/db/schema.md`(ashiato schema の出力 = テスト用 DB のテーブル定義)があるときだけ、
  パックに `<db_schema>` を入れ、手順文の `{{DB_SECTIONS}}` を置換する。v8 の「DB の確認」
  (確認用の SELECT を checks/*.sql で出させ、利用者が `ashiato query` で実行して結果を貼る)と
  v9 の「動作検証」(操作と期待する DB の変化を checks/*.verify.md で出させ、利用者が
  `ashiato verify` で操作して照合の結果を貼る。書式は ashiato の verifyFile.ts が読める形)。
  無いときの出力は v0.20.0 と同一(手順文は版数の行だけ)。slnmix 自身は DB に接続しない
- `src/initConfig.ts` — `--init-config`(generic 構成の `slnmix.config.json` を
  実在するディレクトリだけで作る冪等な scaffold。候補が無ければ推測せずエラー)
- `src/designerFileFilter.ts` — `--include-designer-file` のパターン一致
- `src/instructionFile.ts` — petari 規約文(protocol.md)の `<instruction>` 連結
- `src/procedureFile.ts` / `src/assets/procedure.ts` — 作業手順文
  `<procedure>`(内蔵既定文 or procedure.md)、`--task` / `--plan` の解決、
  先頭リマインダ、チャット本文に貼る指示テキスト(`buildPromptText` →
  `<出力名>.prompt.md`)。内蔵文を変えたら `PROCEDURE_VERSION` を上げ
  `test-fixtures/procedure/` のスナップショットを更新する。手順文 v7 の
  `layout`(`solution` | `generic`)は `{{LAYOUT:...}}` プレースホルダと
  「自己検証」「自動テスト」の該当行だけを差し替える。solution の本文は v6 と
  同一に保つ(generic は `<mode>.generic.md` / `<mode>.generic.docs.tests.md`)
- 手順文 v6 の `{{TEST_SECTIONS}}`(「自動テスト」の節。`docs/HANDOFF-testing-2026-09.md`
  §7)は `src/autoTests.ts` の判定(出力する `<file>` に `e2e/` 配下 or
  `*.spec.ts` / `*.test.ts` があるか、extraRoots に `kind: "test"` があるか)が真の
  ときだけ置換する。テストの無いプロジェクトの手順文は v5 と本文同一に保つ
  (`<mode>.md` / `<mode>.docs.md` は版数の行だけを変えて更新し、テストありは
  `<mode>.tests.md` / `<mode>.docs.tests.md`)
- M365 Copilot Chat の実測(2026-09-12、設計書 §15.1): 添付ファイル内の指示は
  「埋め込み指示」として意図的に無視され、添付の読み取りでは空行・行末空白が
  落ちる。貼付は約 120K 文字が上限。よって手順文・規約文は本文用テキストで
  渡す前提(パック内の埋め込みは貼付運用向けに残す)
- `src/docs.ts` / `src/initDocs.ts` / `src/assets/docTemplates.ts` — docs/ 連携
  (設計書・仕様書・引継ぎ書。設計書 §18)。設計書 1 行目の状態行
  `<!-- slnmix design: status=draft|ready blocking=N deferred=N -->` だけを読んで
  `--mode` 省略時のモードと `--task` 省略時の既定文を決める(本文は解釈しない)。
  パックの `<docs>` には全文書、本文用テキストには「今編集される文書」だけ
  (design: 対象の設計書、他: 引継ぎ書)+ `<templates>`。ひな型 3 種は内蔵
  (`DOC_TEMPLATES_VERSION`)、`docs/templates/<kind>.md` で上書き。
  `--init-docs` は冪等な scaffold。手順文 v3 の `{{DOCS_SECTIONS}}` は docs 連携時
  のみ置換(`test-fixtures/procedure/<mode>.docs.md`)。petari は無改修
- `src/slnmixConfig.ts` — `slnmix.config.json`(任意)と
  `webview2-bridge.gen.json` の自動検出。トップレベルの `kind: "generic"` で
  .sln / .vbproj を使わず `extraRoots` だけでパックする(ルートは設定の場所に
  固定。`--root` / `--legacy-paths` / Designer 系オプションは不可)。
  `repomixExporter.ts` の `layout: "generic"` はヘッダーの VB 固有の注記を外す
  だけで、solution の出力は従来と同一。`services/extraRootsCollector.ts`
  (追加ディレクトリの走査)、`services/contractSummary.ts`
  (`contract.schema.json` → `<contract_summary>`)がこれを使う
- ルート(`src/rootResolver.ts`)= `--root` > 入力のディレクトリから上に向かって
  最初に見つかる `slnmix.config.json` の場所(`.git` のあるディレクトリより上には
  行かない)> 入力(.sln / .vbproj)のあるディレクトリ。物理パス・設定ファイル・
  protocol.md / procedure.md・.gitignore・docs/・出力先の基準はすべてここ。
  petari のプロジェクトルートと一致させる運用(設計書 §14-3、決定ログ 2026-09-22)。
  引数なしの実行は設定の `target`(ルート相対の .sln / .vbproj)を使う
  (`src/targetResolver.ts`)。`.git` を自動で辿らないのは、設定ファイルの無い
  既存プロジェクトの出力を変えないため

## コーディング方針

- TypeScript strict。`any` 禁止、`unknown` + 型ガード
- 依存は最小(fast-xml-parser / iconv-lite / ignore / petari の 4 つ。petari は
  `slnmix init` が `petari init` を呼ぶためだけ。2026-10-11 追加。petari 自身は実行時依存ゼロ)
- 静的 XML 解析のみ。MSBuild 式・Condition・ワイルドカードは評価せず
  「未解決」として明記する。推測で補完しない。唯一の例外は SDK スタイル
  .vbproj の既定 Compile グロブ(`**/*.vb`)の展開で、展開したことを診断と
  出力ヘッダーに明記する(`globMatcher.ts` は `**` / `*` / `?` / `{a,b}` のみ解釈)
- ディレクトリ走査はしない。例外は `slnmix.config.json` の `extraRoots` で
  明示されたディレクトリだけ(スコープの狭い例外として README に明記)。
  `slnmix init` の「1 段下のフォルダの .sln」探しは初回セットアップだけの例外で、
  見つけたものは設定の `target` に書く(パックの対象を黙って決めない)。
  `kind: "generic"` でもこの例外の範囲は変えない(宣言されたディレクトリのみ)
- `<file path>` はルート相対の物理パス・`/` 区切りが既定(v0.12.0〜)。
  `--legacy-paths` で旧形式(1〜2 バージョン残して廃止)
- 壊れた入力でもクラッシュせず、取れた分だけ出す
- Windows パス前提(`path.win32` 相当の扱い)。ただし Mac での開発・テストも
  動くよう相対パス解決は実行環境の区切りへ変換

## コマンド

```bash
pnpm run build        # dist/ へビルド(tsconfig.build.json)
pnpm test             # tsc → mocha(--ui tdd)。vscode-test は使わない
node dist/cli.js test-fixtures/solution/Sample.sln --stdout   # 動作確認
```

## リリース手順

1. 変更をコミット
2. `package.json` の version を上げてコミット
3. `git push origin main`(https 資格情報で push 可能)
4. 依存の petari の版数範囲を上げるときは、先に petari を publish してから
   `pnpm install` で lockfile を更新する(未公開の版は解決できない)
5. **`npm publish` はメンテナー本人が実行**(npm アカウントはパスキー認証の
   ため、エージェントでは完結できない。`prepublishOnly` でビルドは自動)

## 検証状況

実業務プロジェクト(VS2013 世代・SPREAD 使用)での実地検証は進行中。
実データで UI サマリーの取りこぼしが見つかったら `designerSummary.ts` の
パターンを拡充する(完全な VB 構文解析はしない方針)。
