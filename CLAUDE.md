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
決めたことは同書 §17 決定ログに追記する。

### モジュール構成(コア外)

- `src/cli.ts` — 引数処理とファイル I/O(Node 標準の `util.parseArgs` を使用し、
  依存追加はしない)
- `src/targetResolver.ts` — 入力(.sln / .vbproj)の自動検出
- `src/designerFileFilter.ts` — `--include-designer-file` のパターン一致
- `src/instructionFile.ts` — petari 規約文(protocol.md)の `<instruction>` 連結
- `src/procedureFile.ts` / `src/assets/procedure.ts` — 作業手順文
  `<procedure>`(内蔵既定文 or procedure.md)、`--task` / `--plan` の解決、
  先頭リマインダ。内蔵文を変えたら `PROCEDURE_VERSION` を上げ
  `test-fixtures/procedure/` のスナップショットを更新する
- `src/slnmixConfig.ts` — `slnmix.config.json`(任意)と
  `webview2-bridge.gen.json` の自動検出。`services/extraRootsCollector.ts`
  (追加ディレクトリの走査)、`services/contractSummary.ts`
  (`contract.schema.json` → `<contract_summary>`)がこれを使う
- ルート = 入力(.sln / .vbproj)のあるディレクトリ。物理パス・設定ファイル・
  protocol.md / procedure.md・.gitignore の基準はすべてここ。petari の
  プロジェクトルートと一致させる運用(設計書 §14-3)

## コーディング方針

- TypeScript strict。`any` 禁止、`unknown` + 型ガード
- 依存は最小(fast-xml-parser / iconv-lite / ignore の 3 つ)
- 静的 XML 解析のみ。MSBuild 式・Condition・ワイルドカードは評価せず
  「未解決」として明記する。推測で補完しない。唯一の例外は SDK スタイル
  .vbproj の既定 Compile グロブ(`**/*.vb`)の展開で、展開したことを診断と
  出力ヘッダーに明記する(`globMatcher.ts` は `**` / `*` / `?` / `{a,b}` のみ解釈)
- ディレクトリ走査はしない。例外は `slnmix.config.json` の `extraRoots` で
  明示されたディレクトリだけ(スコープの狭い例外として README に明記)
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
4. **`npm publish` はメンテナー本人が実行**(npm アカウントはパスキー認証の
   ため、エージェントでは完結できない。`prepublishOnly` でビルドは自動)

## 検証状況

実業務プロジェクト(VS2013 世代・SPREAD 使用)での実地検証は進行中。
実データで UI サマリーの取りこぼしが見つかったら `designerSummary.ts` の
パターンを拡充する(完全な VB 構文解析はしない方針)。
