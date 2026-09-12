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
  (`パスワード` / `ﾊﾟｽﾜｰﾄﾞ` 等の日本語変数名・キー名、メソッド引数
  `Login("...", "...")`、UI サマリー生成前の Designer ソースにも適用)
- 既定で厳格モード: ランダムな英数字列(高エントロピー値)も機械的にマスク
  (`--no-strict-mask` で無効化)。出力ヘッダーには AI 向けに
  「[MASKED] は伏せ字」であることと取り扱いの指示を明記
- `.gitignore` / `.repomixignore` を尊重(本家 repomix と同じ挙動)
- Designer 関連・`.resx` は既定で除外(オプションで含められる)
- 除外した `*.Designer.vb` は **UI サマリー**として要約を自動埋め込み(下記)
- 除外・未解決のファイルは `<skipped_files>` に明記(黙って捨てない)
- SDK スタイル `.vbproj`(`<Project Sdk="...">`)は既定の Compile グロブ
  `**/*.vb` を展開して扱い、展開したことを出力に明記(下記)
- `.sln` と同じフォルダに `.sln` から参照されていない `.vbproj` があれば警告
  (`.sln` だけが古い場合のエクスポート漏れに気付ける)
- 入力と同じフォルダの `protocol.md`([petari](https://github.com/ishibashi0112/petari)
  の規約文)があれば出力末尾に `<instruction>` として自動連結(下記)
- 「調査 → 方針 → 変更 → 自己検証」の**作業手順**を出力末尾に `<procedure>` として
  同梱し、`--task` で依頼内容も一緒に渡せる(下記)
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
特定のフォームだけ原文が必要な場合は `--include-designer-file <名前|パターン>`
(複数指定可)で選べます。指定しなかった Designer は従来どおり除外・要約
されるため、関係ないフォームで出力が膨らむのを避けられます。

```console
npx slnmix MyApp.sln --include-designer-file FormMain.Designer.vb --include-designer-file "FormOrder*"
```

## 使い方

```console
npx slnmix                  # カレントディレクトリの .sln を自動検出
npx slnmix C:\path\to\App   # 指定フォルダ内を自動検出
npx slnmix MyApp.sln -o for-ai.xml
npx slnmix Sub\Project.vbproj --stdout
```

入力を省略すると、カレントディレクトリ(ディレクトリ指定ならその直下)の
`*.sln` を自動検出します(なければ `*.vbproj`)。複数見つかった場合は
候補を表示して終了するので、対象を明示してください。

```text
オプション:
  -o, --output <file>     出力先(既定: 入力と同じ場所の repomix-output.xml)
      --stdout            ファイルではなく標準出力へ書く(BOM なし)
      --include-designer  Designer 関連ファイル(*.Designer.vb 等)を原文のまま含める
      --include-designer-file <名前|パターン>
                          指定した Designer 関連ファイルだけ原文のまま含める
                          (複数指定可。* をワイルドカードに使える。ファイル名
                          または論理パスに全体一致)
      --no-ui-summary     Designer.vb からの UI サマリー生成を無効化
      --no-mask           認証情報の自動マスクを無効化
      --no-strict-mask    高エントロピー文字列の機械的マスクを無効化
      --no-gitignore      .gitignore / .repomixignore による除外を無効化
      --instruction-file <path>
                          出力末尾に連結する規約文ファイルを明示指定
                          (既定: 入力と同じ場所の protocol.md を自動検出)
      --task <file|text>  依頼内容を出力末尾に <task> として同梱
                          (ファイルが存在すれば読み込み、なければ文字列)
      --mode <full|plan|implement>
                          作業手順のモード(既定: full)
      --plan <file>       implement モードで承認済みの方針を <plan> として同梱
      --procedure-file <path>
                          作業手順文を明示指定(既定: 入力と同じ場所の
                          procedure.md を自動検出。なければ内蔵既定文)
      --no-procedure      <procedure> を出さない(従来出力)
      --print-procedure   内蔵の作業手順文を標準出力に書いて終了
  -v, --version           バージョン表示
  -h, --help              ヘルプ
```

## SDK スタイル .vbproj

`<Project Sdk="Microsoft.NET.Sdk">`(または `<Import Project="Sdk.props" Sdk="..." />`)
形式のプロジェクトは `Compile` を書かず、プロジェクトフォルダ配下の `**/*.vb` が
暗黙に含まれます。slnmix はこの既定グロブだけを展開します。

- 除外: `bin/**`、`obj/**`、`**/*.user`、ドットで始まるフォルダ、
  `<Compile Remove="...">`、`<DefaultItemExcludes>` の追加パターン
  (ワイルドカードは `**` / `*` / `?` のみ解釈)
- `<EnableDefaultCompileItems>false</EnableDefaultCompileItems>` なら展開しない
- 明示した `<Compile Include>` は従来どおり。`<Compile Update>` は一致する
  項目への `DependentUpon` / `SubType` 等のメタデータ付与として解釈
- `*.Designer.vb` の判定はファイル名規則で同様に行う(UI サマリーも同じ)
- 展開したことは `<file_summary>` に「MSBuild の完全評価ではない」と明記

旧スタイルと SDK スタイルが同じ `.sln` に混在していても、それぞれの形式で
扱います(WinForms + WebView2 のようなハイブリッド構成向け)。

## できないこと(仕様)

MSBuild の完全評価は行いません(静的 XML 解析のみ)。

- 旧スタイルの `$(Property)` / `@(Item)` / ワイルドカードを含む `Include` は
  展開せず、未解決として `<skipped_files>` に記載
- `Condition` は評価せず、条件付き項目としてそのまま含める
  (SDK スタイルの `EnableDefaultCompileItems` 等が `Condition` 付きなら、
  評価せず値を採用してその旨を診断に残す)
- `Import` された `.targets` / `.props` は展開しない
- SDK スタイルで `BaseOutputPath` / `BaseIntermediateOutputPath` を変更していても
  `bin` / `obj` の既定値で除外する。`Compile` 以外の既定グロブ
  (`EmbeddedResource` の `**/*.resx` 等)は展開しない(`.resx` は元々出力対象外)

推測で補完せず、解決できないものは解決できないと明記する方針です。

## petari 連携(規約文の自動付与)

AI チャットの返答をローカルへ適用する CLI
[petari](https://github.com/ishibashi0112/petari) と組み合わせる場合、
AI に changes.md 規約を守らせるための規約文を出力末尾に含められます。

入力(`.sln` / `.vbproj`)と同じフォルダに `protocol.md` があれば、
その内容を**一字一句そのまま** `<instruction>` ブロックとして出力末尾に
連結します(本家 repomix の `instructionFilePath` 相当)。`protocol.md` は
プロジェクト直下で `petari init` を実行すると生成されます。
規約文を付けたときは、出力の先頭にも末尾の規約へ誘導する短いリマインダを
置きます(チャットの要約処理で末尾が読まれない場合への対策)。

```console
npx petari init   # protocol.md を生成(規約文の正本は petari が持つ)
npx slnmix        # 出力末尾に protocol.md が <instruction> として付く
```

規約文は slnmix に同梱していないため、petari 側で規約が更新されても
`petari init` で `protocol.md` を作り直すだけで追従できます。
`protocol.md` がない場合は従来どおりの出力になります(その旨を 1 行表示)。
別の場所・別名のファイルを使う場合は `--instruction-file <path>` で
明示指定してください。

## 作業手順の自動付与(`<procedure>` / `--task` / `--mode`)

M365 Copilot のように思考量を外から制御できないチャットでは、
**回答の中で考えさせる**方が確実です。slnmix は既定で、出力末尾に
「調査 → 方針 → 変更 → 自己検証」の手順を `<procedure>` ブロックとして同梱し、
曖昧なら推測せず質問して止まるよう指示します。先頭にはタスクの 1 行要約と
末尾ブロックへの誘導(リマインダ)を置きます。

`protocol.md`(`<instruction>`)が「changes.md の**書き方**」の規約なのに対し、
`<procedure>` は「変更を考える**手順**」です。責務が違うので別ブロックにしています。
`protocol.md` の有無に関わらず `<procedure>` は付きます(`--no-procedure` で
従来どおりの出力に戻ります)。

```console
npx slnmix --task "受注フォームに保存ボタンを追加する"   # 依頼内容を <task> に同梱
npx slnmix --task task.md                                # ファイルなら読み込む
```

### モード(`--mode`)

| モード | 用途 | AI に要求する回答の構成 |
|---|---|---|
| `full`(既定) | 小〜中規模の変更を 1 ターンで | 調査 / 方針 / 変更(changes.md)/ 自己検証 |
| `plan` | 方針を先に固める | 調査 / 方針 / 質問(changes.md は出させない) |
| `implement` | 承認済みの方針で実装 | 方針の確認 / 変更(changes.md)/ 自己検証 |

大きめの変更は `plan` → `implement` の 2 ターンに分けると、回答の出力上限で
changes.md が途中で切れるのを避けられます。`plan` の回答を手直しして
ファイルに保存し、`implement` で `--plan` に渡してください(`implement` では
`--plan` が必須です)。

```console
npx slnmix --task task.md --mode plan                    # → 方針と質問だけが返る
npx slnmix --task task.md --mode implement --plan plan.md   # 承認した方針を <plan> として同梱
```

### 手順文のカスタマイズ(`procedure.md`)

入力と同じフォルダに `procedure.md` があれば、内蔵既定文の代わりにその内容を
一字一句そのまま使います(`{{MODE}}` / `{{MODE_SECTIONS}}` があればモードに
応じて置換)。生成コマンドはありません。内蔵既定文を書き出して編集してください。

```console
npx slnmix --print-procedure > procedure.md              # 内蔵既定文を書き出す
npx slnmix --print-procedure --mode plan                 # モード別の文面を確認
```

プロジェクト固有のルール(コーディング規約・禁止事項など)は
`procedure.md` の末尾に追記する運用を想定しています。別ファイルは増やしません。

## 関連プロジェクト

- [petari](https://github.com/ishibashi0112/petari) — AI チャットの返答
  (changes.md)をローカルへ適用する CLI。`protocol.md` の正本を持つ
- [Legacy VB.NET Workbench](https://github.com/ishibashi0112/legacy_vb_workbench)
  — VS Code 上で同じ論理ツリーを表示・ビルド・エクスポートする拡張。
  解析コアは元々共通でしたが、現在は slnmix 側が唯一の置き場で、拡張は
  2026-09 時点で凍結しています

## License

MIT
