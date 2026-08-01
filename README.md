# slnmix

Repomix 互換フォーマットで `.sln` / `.vbproj` を 1 ファイルにエクスポートする CLI。

Pack a legacy Visual Studio solution (`.sln` / `.vbproj`) into a single
repomix-style file for AI consumption — based on the solution's **logical
structure**, not directory scanning.

## 本家 repomix との違い

[repomix](https://github.com/yamadashy/repomix) はディレクトリを走査してファイルを集めます。
レガシー Visual Studio(VB.NET / VS2013 世代)のプロジェクトでは、それだと困ることがあります。

- `<Link>` でプロジェクト外・別ドライブに置かれたソースを**拾えない**
- ビルド対象外のファイル(過去の残骸・バックアップ)を**拾ってしまう**
- `Designer.vb` / `.resx` などの自動生成ファイルがノイズになる

slnmix は `.sln` → `.vbproj` を静的解析し、**ビルド対象の論理構成**(Link・
DependentUpon 解決済み)に基づいてエクスポートします。

主な特徴:

- 文字コードを自動判定(BOM / UTF-8 / Shift_JIS(CP932))して UTF-8 に統一
- 認証情報らしき値(`Password=` / APIキー等)を既定で `[MASKED]` に自動置換
- `.gitignore` / `.repomixignore` を尊重(本家 repomix と同じ挙動)
- Designer 関連・`.resx` は既定で除外(オプションで含められる)
- 除外した `*.Designer.vb` は **UI サマリー**として要約を自動埋め込み(下記)
- 除外・未解決のファイルは `<skipped_files>` に明記(黙って捨てない)
- 出力は BOM 付き UTF-8(Windows 系ツールの誤判定防止)

## UI サマリー

Designer.vb の原文は座標・サイズの羅列でトークンを浪費しますが、丸ごと捨てると
AI は `Me.btnSave` が何なのか分からなくなります。slnmix は既定で、除外した
`*.Designer.vb` からコントロール構成だけを抽出して `<ui_summary>` として
フォーム本体のコードの直後に埋め込みます。

```xml
<ui_summary path="App\Forms\OrderForm.Designer.vb" form="OrderForm">
Designer 自動生成コードからの要約(コントロール名: 型 — Text。座標・サイズ等のレイアウトは省略):
フォームタイトル: "受注入力"
- pnlHeader: Panel
  - lblCustomer: Label — Text "得意先"
  - txtCustomerName: TextBox
- btnSave: Button — Text "保存"
- mnuMain: MenuStrip
  - mnuFile: ToolStripMenuItem — Text "ファイル(&F)"
    - mnuFileExit: ToolStripMenuItem — Text "終了(&X)"
- grdItems: FarPoint.Win.Spread.FpSpread
</ui_summary>
```

原文が必要な場合は `--include-designer`(サマリーの代わりに原文を出力)、
サマリー自体が不要なら `--no-ui-summary` を指定します。

## 使い方

```console
npx slnmix MyApp.sln
npx slnmix MyApp.sln -o for-ai.xml
npx slnmix Sub\Project.vbproj --stdout
```

```text
オプション:
  -o, --output <file>     出力先(既定: 入力と同じ場所の repomix-output.xml)
      --stdout            ファイルではなく標準出力へ書く(BOM なし)
      --include-designer  Designer 関連ファイル(*.Designer.vb 等)を原文のまま含める
      --no-ui-summary     Designer.vb からの UI サマリー生成を無効化
      --no-mask           認証情報の自動マスクを無効化
      --no-gitignore      .gitignore / .repomixignore による除外を無効化
  -v, --version           バージョン表示
  -h, --help              ヘルプ
```

## できないこと(仕様)

MSBuild の完全評価は行いません(静的 XML 解析のみ)。

- `$(Property)` / `@(Item)` / ワイルドカードを含む `Include` は展開せず、未解決として `<skipped_files>` に記載
- `Condition` は評価せず、条件付き項目としてそのまま含める
- `Import` された `.targets` / `.props` は展開しない

推測で補完せず、解決できないものは解決できないと明記する方針です。

## 関連プロジェクト

VS Code 上で同じ論理ツリーを表示・ビルド・エクスポートできる拡張
[Legacy VB.NET Workbench](https://github.com/ishibashi0112/legacy_vb_workbench)
と同一の解析コアを使っています。

## License

MIT
