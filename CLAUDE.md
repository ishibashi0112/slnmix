# CLAUDE.md

## プロジェクト概要

slnmix — レガシー Visual Studio(.sln / .vbproj)の**論理構成**に基づいて
ソースを 1 ファイルへまとめる、repomix 互換フォーマットの CLI。
npm に公開済み(`npx slnmix`)。対象はレガシー VB.NET / .NET Framework /
Shift_JIS 環境。

## 最重要の前提: コアは Legacy VB.NET Workbench と二重管理

`src/` の解析コアは VS Code 拡張
[legacy_vb_workbench](https://github.com/ishibashi0112/legacy_vb_workbench)
(ローカル: `~/dev/legacy-vb-net-workbench`)からのコピーであり、
**両リポジトリで同一実装を維持する**方針。

- 対象: `types.ts` / `paths.ts` / `slnParser.ts` / `vbprojParser.ts` /
  `logicalTreeBuilder.ts` / `services/repomixExporter.ts` /
  `services/credentialMasker.ts` / `services/gitignoreService.ts` /
  `services/designerSummary.ts`、および対応するテストと `test-fixtures/`
- コアへの修正は必ず両リポジトリへ適用する
- 意図的な差分は 2 か所のみ:
  1. `repomixExporter.ts` 出力ヘッダーのツール名(こちらは「slnmix が」、
     拡張側は「Legacy VB.NET Workbench が」)
  2. Designer スキップ理由の文言(こちらは「オプション --include-designer」、
     拡張側は「設定 exportIncludeDesignerFiles」)
- CLI が定着したら共通コアのパッケージ化を検討する(現状は意図的にコピー運用)

`src/cli.ts` だけがこのリポジトリ固有(引数処理とファイル I/O のみ。
Node 標準の `util.parseArgs` を使用し、依存追加はしない)。

## コーディング方針

- TypeScript strict。`any` 禁止、`unknown` + 型ガード
- 依存は最小(fast-xml-parser / iconv-lite / ignore の 3 つ)
- 静的 XML 解析のみ。MSBuild 式・Condition・ワイルドカードは評価せず
  「未解決」として明記する。推測で補完しない
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

1. 変更をコミット(拡張側への同期も忘れずに)
2. `package.json` の version を上げてコミット
3. `git push origin main`(https 資格情報で push 可能)
4. **`npm publish` はメンテナー本人が実行**(npm アカウントはパスキー認証の
   ため、エージェントでは完結できない。`prepublishOnly` でビルドは自動)

## 検証状況

実業務プロジェクト(VS2013 世代・SPREAD 使用)での実地検証は
拡張側と合わせて進行中。実データで UI サマリーの取りこぼしが見つかったら
`designerSummary.ts` のパターンを拡充する(完全な VB 構文解析はしない方針)。
