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
- `<file path>` は**ルート相対の物理パス・`/` 区切り**(petari がそのまま
  使える形。Link は `logical` 属性で論理パスを併記。下記)
- `slnmix.config.json` の `extraRoots` で `.vbproj` に乗らない web / 契約
  ディレクトリを同じパックに入れられる(WinForms + WebView2 + React の
  ハイブリッド構成向け。生成コードは除外して `<contract_summary>` で代替。下記)
- `.sln` と同じフォルダに `.sln` から参照されていない `.vbproj` があれば警告
  (`.sln` だけが古い場合のエクスポート漏れに気付ける)
- 入力と同じフォルダの `protocol.md`([petari](https://github.com/ishibashi0112/petari)
  の規約文)があれば出力末尾に `<instruction>` として自動連結(下記)
- 「調査 → 方針 → 変更 → 自己検証」の**作業手順**を出力末尾に `<procedure>` として
  同梱し、`--task` で依頼内容も一緒に渡せる(下記)
- **プロジェクト文書の連携**(`docs/`): 設計書・仕様書・引継ぎ書をパックの `<docs>` と
  本文用テキストに自動で載せ、文書の状態から作業モード(設計 / 実装 / 続き)を
  自動で決める。文書の更新は AI が changes.md で出し petari が保存する(下記)
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
      --legacy-paths      <file path> を旧形式(プロジェクト名\論理パス)にする
      --include-generated 生成コード(generatedDirs)の原文を含める
      --instruction-file <path>
                          出力末尾に連結する規約文ファイルを明示指定
                          (既定: 入力と同じ場所の protocol.md を自動検出)
      --task <file|text>  依頼内容を出力末尾に <task> として同梱
                          (ファイルが存在すれば読み込み、なければ文字列)
      --mode <full|plan|implement|design>
                          作業手順のモード(既定: full。docs 連携時は文書の
                          状態から自動選択)
      --design <名前|file> design モードで対象の設計書を指定(なければ新規作成)
      --init-docs         docs/ 連携の初回セットアップ(一回だけ)
      --plan <file>       implement モードで承認済みの方針を <plan> として同梱
      --procedure-file <path>
                          作業手順文を明示指定(既定: 入力と同じ場所の
                          procedure.md を自動検出。なければ内蔵既定文)
      --no-procedure      <procedure> を出さない(従来出力)
      --print-procedure   内蔵の作業手順文を標準出力に書いて終了
  -v, --version           バージョン表示
  -h, --help              ヘルプ
```

## ファイルパスの規則(物理パス化)

`<file path="...">` は**ルート**(入力の `.sln` / `.vbproj` があるフォルダ)からの
相対物理パスで、`/` 区切りです。AI が changes.md に書くパスをこの `path` と
一致させることで、[petari](https://github.com/ishibashi0112/petari) が
パス変換なしにそのまま適用できます(petari のプロジェクトルートと slnmix の
ルートを同じ場所にしてください。通常は `.sln` のあるリポジトリ直下です)。

```xml
<file path="App/Forms/OrderForm.vb">                                   ← 物理パス = 論理パス
<file path="Shared/Util.vb" project="App" logical="Common\Util.vb">    ← Link(論理パスと異なる)
<file path="Basic/Module1.vb" project="Basic" physical="D:/Src/Basic/Module1.vb" outside_root="true">
                                                                       ← ルート外(適用ツールの範囲外)
```

- `<directory_structure>` は従来どおり Visual Studio の論理ツリー(人が読む用)。
  物理パスが異なるファイルは行末に `→ 物理パス` を併記
- ルートの外にあるファイル(別ドライブの Link など)は論理パスを `path` にし、
  `physical` 属性に物理パスを付けて `<file_summary>` に「適用ツールの範囲外」と
  明記
- `<file_summary>` に規則を明記し、新規ファイルも同じ規則で「置きたい
  プロジェクトの物理フォルダ配下」に書くよう AI に指示
- v0.12.0 で既定を変更しました(後方互換を破る変更)。旧形式
  `プロジェクト名\論理パス` が必要な場合は `--legacy-paths` を指定してください
  (1〜2 バージョン残して廃止予定)

## ハイブリッド構成(`slnmix.config.json`)

WinForms + WebView2 + React([webview2-bridge](https://github.com/ishibashi0112/webview2-bridge))
のように `.vbproj` に乗らない web 側・契約側のディレクトリがある場合、ルート直下に
`slnmix.config.json` を置くと同じパックに入ります。**なくても動きます**
(`slnmix init` はありません)。

```jsonc
{
  "extraRoots": [
    { "path": "apps/web", "kind": "web" },
    { "path": "contract", "kind": "contract", "include": ["contract.ts", "package.json"] }
  ],
  // 以下は同じ場所に webview2-bridge.gen.json があれば自動検出(明示すれば上書き)
  "contractSchema": "contract/contract.schema.json",
  "generatedDirs": ["dotnet/App.Contract/Generated", "apps/web/src/generated"]
}
```

- `extraRoots[].path`: ルート相対。**宣言されたディレクトリだけ**走査します
  (ディレクトリ走査をしない原則の、明示的でスコープの狭い例外)
- `include` の既定: `kind: web` は `**/*.{ts,tsx,js,jsx,css,json,html}`、
  `kind: contract` は `**/*.ts`、それ以外は `**/*`。`exclude` で追加除外
- `include` に関わらず常に除外: `node_modules/`、`dist/`、`build/`、`.vite/`、
  `*.map`、`.env*`、`.gitignore` / `.repomixignore` に一致するもの、バイナリ拡張子
- 出力では `<directory_structure>` に `[web] apps/web/` のようにグループ表示し、
  `<file path="apps/web/src/App.tsx" root="web">` の `root` 属性で区別します
- **認証情報マスクは web 側にも同じように効きます**(厳格モードでは API キー
  らしき高エントロピー値も `[MASKED]`)。`.env*` は既定で除外。VB 側で守っている
  安全性が web を足した瞬間に落ちないようにしています。ただし機械判定なので
  共有前の目視確認は引き続き推奨します
- `generatedDirs` 配下(webview2-bridge の生成コード)は既定で除外し、
  `contractSchema`(`contract.schema.json`)から生成した **`<contract_summary>`**
  (メソッド・イベント・DTO の一覧)で代替します。原文が必要なら
  `--include-generated`。スキーマの形式が未知(`contractVersion` が対応外)なら
  要約せず `<skipped_files>` に理由を書き、原文の `contract.ts` だけを出します

```xml
<contract_summary path="contract/contract.schema.json">
契約から生成された API の要約(生成コード dotnet/App.Contract/Generated/、apps/web/src/generated/ は除外。契約の正本は contract/contract.ts):
methods:
- parts.search(input: { keyword: string; limit?: integer }) -> { items: Part[] }
events:
- progress(payload: { percent: number; message?: string })
types:
- Part { partNo: string; name: string; qty: integer; updatedAt: string(ISO 8601) }
</contract_summary>
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

## M365 Copilot Chat への渡し方(添付 + 本文貼付)

実測(2026-09-12、設計書 §15.1)で分かった Copilot Chat の性質に合わせた推奨手順です。

| 経路 | 上限 | 指示の扱い | 本文の読まれ方 |
|---|---|---|---|
| 本文に貼る | 約 120K 文字(超えると送信ボタンが非活性) | ユーザー発話として**効く** | 全文がそのままコンテキストに入る |
| ファイル添付 | 事実上なし(800K でも可) | ファイル内の指示は「埋め込み指示」として**意図的に無視される** | 検索・部分読みで参照され、読み取り結果から**空行・行末空白が落ちる** |

パックが 120K 文字を超える(実務のソリューションではほぼ超えます)場合は、
**パックを添付し、手順文・規約文・依頼内容は本文に貼ってください。**
slnmix はそのための本文用テキストを、パックの隣に `<出力名>.prompt.md`
として既定で書き出します(`--no-prompt` で抑止、`--prompt-output <file>` で
出力先を変更、`--print-prompt` で標準出力へ)。

```console
npx slnmix --task task.md                   # repomix-output.xml と repomix-output.prompt.md ができる
                                            # → Copilot Chat: .xml を添付、.prompt.md の中身を本文に貼る
npx slnmix --task task.md --print-prompt | clip   # 本文用テキストを直接クリップボードへ(Windows)
```

`.prompt.md` の中身は、パック末尾に埋め込む `<task>` / `<plan>` / `<procedure>` /
`<instruction>` と一字一句同じです(正本は 1 つ)。先頭に「添付とこの本文の関係」を
述べる短い段落が付きます。パックが 120K 文字以内なら本文に丸ごと貼っても構いません
(全文がコンテキストに入り、埋め込みの指示も効きます)。実行末尾に、パックが
貼付上限の目安を超えているかどうかを 1 行表示します。

添付経路では空行・行末空白が読み取りで失われるため、AI が出す SEARCH ブロックから
空行が抜けることがあります。適用側の [petari](https://github.com/ishibashi0112/petari)
(v0.8.0 以降)は空行の差を無視して照合するので、そのまま適用できます。

## petari 連携(規約文の自動付与)

AI チャットの返答をローカルへ適用する CLI
[petari](https://github.com/ishibashi0112/petari) と組み合わせる場合、
AI に changes.md 規約を守らせるための規約文を出力末尾に含められます。

入力(`.sln` / `.vbproj`)と同じフォルダに `protocol.md` があれば、
その内容を**一字一句そのまま** `<instruction>` ブロックとして出力末尾に
連結します(本家 repomix の `instructionFilePath` 相当)。`protocol.md` は
プロジェクト直下で `petari init` を実行すると生成されます。
規約文を付けたときは、出力の先頭にも末尾の規約へ誘導する短いリマインダを
置きます。**ただし Copilot Chat にファイル添付で渡す場合、添付内の規約文は
無視されます。** 規約文は本文用テキスト(`<出力名>.prompt.md`、上記)にも
含まれるので、添付で渡すときはそちらを本文に貼ってください。

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
従来どおりの出力に戻ります)。添付で渡す場合は本文用テキスト(上記)側の
`<procedure>` が効きます。

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
| `design` | 設計書を質疑応答で仕上げる(docs 連携が必要) | 調査 / 設計書(changes.md)/ 確認事項 / 継続判定 |

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
書き出した文面の末尾にある `{{DOCS_SECTIONS}}` は残しておくと、docs 連携(下記)が
有効なときに「文書の扱い」「チャットの継続と引継ぎ」の 2 節に置換されます。

## プロジェクト文書の連携(`docs/` — 設計書・仕様書・引継ぎ書)

設計書や引継ぎ書を毎回チャットに添付する代わりに、プロジェクトの `docs/` に置いて
slnmix に読ませます。文書の状態から作業モードが自動で決まり、文書の作成・更新も
AI が changes.md で出して [petari](https://github.com/ishibashi0112/petari) が保存する
ので、日常のコマンドは `npx slnmix` と `npx petari` の 2 つだけになります。

```console
npx slnmix --init-docs    # 一回だけ: docs/design/ docs/spec/ docs/README.md を作り
                          #           slnmix.config.json に "docs" を追記する
npx slnmix                # 以後はこれだけ。モードとタスクは文書の状態から自動
npx petari                # AI の changes.md(コードも文書も)を適用する
```

| 文書 | 場所 | 役割 | 更新のタイミング |
|---|---|---|---|
| 設計書 | `docs/design/<名前>.md` | 開発の進め方と判断の根拠。1 行目の状態行で draft / ready | 設計の質疑応答ごと(AI が replace)。必須の確認事項がゼロで ready |
| 仕様書 | `docs/spec/<名前>.md` | 実装済みの振る舞いの正本(誰が読んでも分かる書き方) | 設計確定時に初版、各バッチの完了時 |
| 引継ぎ書 | `docs/HANDOFF.md` | チャット間の申し送りだけ(1 ファイル固定。履歴は git) | チャットを切り替えるとき(AI が rewrite) |

### 設計から実装への流れ(モードの自動選択)

| `docs/` の状態 | モード | 本文用テキストに載る文書 | 既定の依頼内容(`--task` 省略時) |
|---|---|---|---|
| 設計書なし | `design`(新規) | なし | 新しい設計書を作成する |
| 設計書が draft | `design`(継続) | その設計書 | 質疑応答で仕上げる(必須 N / 後回し M が未回答) |
| 設計書が ready、引継ぎ書なし | `full` | なし | 最初の未完了バッチを実装 |
| 設計書が ready、引継ぎ書あり | `full` | 引継ぎ書 | 引継ぎ書の「次にやること」を進める |

設計書の状態は 1 行目の状態行で管理します(AI が確認事項の件数と一致するように保ちます)。

```
<!-- slnmix design: status=draft blocking=2 deferred=3 -->
```

確認事項は 2 種類です。**必須**(`blocking`)は回答がないと実装に進めないもの、
**後回し**(`deferred`)は実装を進めながら確認期限(どのバッチの着手前か)までに
回答すればよいもの。必須がゼロになれば後回しが残っていても `ready` になり実装に
進めます。実装中は、バッチ着手前に期限の来た後回しがないかを AI が確認します。
状態行のない設計書(旧形式)は警告のうえ ready 扱いです。

- 仕様書や引継ぎ書がまだなければ、パックと本文用テキストの `<docs>` にその旨と
  「最初の回答で初版を create する」指示が入り、既定の依頼文にも先頭に足されます
  (設計書が済んで実装途中の既存プロジェクトを、設計書と引継ぎ書を置くだけで
  乗せ替えられます)
- draft の設計書が複数あるときは `--design <名前>` で対象を指定します。存在しない
  名前なら `docs/design/<名前>.md` を新規作成する design モードになります
- `--mode full|plan|implement` を明示すれば自動選択より優先します
- パックの `<docs>` には全文書が入り(添付側。検索で参照)、本文用テキストには
  「今編集される文書」だけが入ります(design モードは設計書、他は引継ぎ書)。
  設計書 64K 文字でも本文用テキストは約 80K で貼付上限内です
- 本文用テキストには文書の**ひな型** `<templates>` も載ります(設計書 / 仕様書 /
  引継ぎ書。Mermaid のフロー・状態遷移・ER を章立てに含む)。差し替えたい場合は
  `docs/templates/<design|spec|handoff>.md` を置きます

### チャットの切り替え(引継ぎ)

AI は自分のコンテキスト残量を測れないので、手順文は会話の中で数えられる引き金で
判断させます。毎回の回答末尾に「継続判定: 継続 / 引継ぎ推奨(理由)」が付き、
①実装バッチが完了して動作確認が取れた ②changes.md を 3 回以上出した
③petari の失敗レポートを 2 回受けた ④パックを添付し直した、のいずれかで
引継ぎを勧めます。同意すると `docs/HANDOFF.md` を書き直す changes.md(コード変更とは
別)が出るので、`npx petari` で保存 → `npx slnmix` → 新しいチャットに添付と貼付、で
続きが始まります。基本は「1 バッチ = 1 チャット」の運用を想定しています。

## 関連プロジェクト

- [petari](https://github.com/ishibashi0112/petari) — AI チャットの返答
  (changes.md)をローカルへ適用する CLI。`protocol.md` の正本を持つ
- [Legacy VB.NET Workbench](https://github.com/ishibashi0112/legacy_vb_workbench)
  — VS Code 上で同じ論理ツリーを表示・ビルド・エクスポートする拡張。
  解析コアは元々共通でしたが、現在は slnmix 側が唯一の置き場で、拡張は
  2026-09 時点で凍結しています

## License

MIT
