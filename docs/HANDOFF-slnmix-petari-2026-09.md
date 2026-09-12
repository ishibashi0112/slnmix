# HANDOFF — slnmix / petari 改修設計（M365 Copilot 内 Opus の性能を引き出す）

作成日: 2026-09-11
対象リポジトリ: `ishibashi0112/slnmix`（主）、`ishibashi0112/petari`（従）、`ishibashi0112/webview2-bridge`（任意）
実装担当: Claude Code。本書を最初に読み、各リポジトリの CLAUDE.md の規約に従うこと。決めたことは §17 決定ログに追記する。

---

## 0. この文書の読み方

- §1〜§4 は背景・原則・現状。実装前に一度読む
- §5 がフェーズ一覧。**フェーズ順に実装し、フェーズごとに完了条件（§16）を満たしてから次へ進む**
- §6〜§10 が slnmix の各フェーズ、§11 が petari、§12 が webview2-bridge（任意）
- §14 は未決定・要確認事項。実装中に答えが出たら §17 に記録する
- 設計判断に迷ったら §2 の原則に戻る。原則と衝突する実装はしない

---

## 1. 背景と目的

### 1.1 状況

- 会社環境で使える AI は M365 Copilot Chat のみ。モデルは Claude Opus（表示は「Opus」のみ。4.8 と推定。テナントによっては Opus 5 が展開済みの可能性あり）
- 思考エフォート（拡張思考の量）は M365 Copilot 側に隠蔽されており、ユーザーから制御できない
- 個人環境の Claude Fable 5 / Opus 5 と比べると性能差を常に感じる
- 現行フロー: `slnmix` で VB.NET ソリューションを 1 ファイルにパック → Copilot Chat に貼付/添付 → AI が `changes.md` を出力 → `petari apply` でローカルへ適用。コピペ適用自体は安定してきた
- 手でコードを書く機会は激減し、petari 経由の反映が主になっている

### 1.2 目的

外から制御できない思考エフォートを、**プロンプト側の構造で補う**。あわせて、これから増えるハイブリッド構成（WinForms + WebView2 + React、`webview2-bridge`）を slnmix が扱えるようにし、新規ファイル作成時の petari の失敗をなくす。

### 1.3 期待する効果（優先順）

1. 回答の質: 調査 → 方針 → 変更 → 自己検証の手順を強制し、曖昧なら推測せず質問させる
2. ハイブリッド対応: VB 側と React 側を**同じパック**で見せる（契約をまたぐ変更はこれがないと成立しない）
3. 新規ファイル: petari が `.vbproj` 登録まで担い、Visual Studio での手作業をなくす
4. コンテキスト量: 入力上限に当たったときの手段として絞り込みを用意する（**主目的ではない**）

---

## 2. 原則（実装判断の基準）

1. **必須セットアップは `petari init` 一回のみ。** slnmix は設定ファイルなしで動く。`slnmix init` は作らない。カスタマイズしたい人だけ `procedure.md` / `slnmix.config.json` を置く
2. **削るより、抜け落ちないことを優先。** 既定は全件出力。絞り込みは明示オプション。外したものは骨格として残し、一覧で明示する。黙って捨てない（既存方針の継承）
3. **推測しない。推測したときは宣言する。** MSBuild 完全評価はしない（既存方針）。SDK スタイルの既定グロブ展開のように推測を伴う処理は、出力に「展開した」と明記する
4. **解析コアは slnmix が単独で持つ。** legacy_vb_workbench との二重管理は終了。workbench は凍結（§13）
5. **petari は「vbproj 対応 create」「新規ファイルのエンコーディング推定」「目録警告（任意）」以外触らない。** webview2-bridge は「対応表 JSON（任意）」以外触らない
6. **依存は増やさない。** slnmix は fast-xml-parser / iconv-lite / ignore の 3 つのまま。petari は実行時依存ゼロのまま
7. **後方互換。** オプションを付けなければ、既存ユーザーの出力は（§8.4 の物理パス化を除き）変わらない

---

## 3. 現状の構成と関係

```
[会社 PC]                                    [AI: M365 Copilot Chat / Opus]
  .sln / .vbproj ──slnmix──> repomix-output.xml ──貼付/添付──> 回答 (changes.md)
  ローカルコード <──petari apply── changes.md <──ダウンロード/クリップボード──┘
```

| ツール | 役割（一言） | 正本となる設定 |
|---|---|---|
| **slnmix** | AI に**何を見せ、どういう手順で考えさせるか** | なし（任意で `procedure.md` / `slnmix.config.json`） |
| **petari** | AI の回答を**どう書かせ、どう当てるか** | `protocol.md`（`petari init` が生成、petari が正本を持つ） |
| **webview2-bridge** | zod 契約から TS / VB を**生成**する | `contract/contract.ts`、`webview2-bridge.gen.json` |
| legacy_vb_workbench | VS Code で .sln の論理ツリーを表示・ビルド・エクスポート | — （**凍結**） |

### 3.1 slnmix の現状（要点）

- `.sln` → `.vbproj` を静的解析し、ビルド対象の論理構成（Link / DependentUpon 解決済み）でエクスポート
- Designer.vb は除外し `<ui_summary>` で要約。`.resx` は常に除外
- 認証情報マスク（既定で厳格モード）、`.gitignore` / `.repomixignore` 尊重
- `protocol.md` があれば「先頭リマインダ + 末尾 `<instruction>`」のサンドイッチ配置
- `<file path="...">` は `プロジェクト名\論理パス`（`\` 区切り）
- 旧スタイル .vbproj 前提。ワイルドカード Include は未解決として `<skipped_files>` へ
- 共有コア（`types.ts` / `paths.ts` / `slnParser.ts` / `vbprojParser.ts` / `logicalTreeBuilder.ts` / `services/*`）は workbench と二重管理中 → **本書で終了**

### 3.2 petari の現状（要点）

- `changes.md` の操作種別: `replace` / `create` / `rewrite` / `delete`。**`create` は既に実装済み**
- パスは「プロジェクトルート相対・`/` 区切り」のみ受け付ける。絶対パス・`..` は拒否
- 新規ファイルの既定は `.petari/config.json` の `newFile: { encoding: "utf8", eol: "lf" }`。**BOM なし**
- エンコーディング保全は行単位（無変更行は元バイト列を書き戻す）
- `src/core/` は純粋ロジックのみ（ファイル I/O 禁止）。I/O は `src/infra/`
- SEARCH 照合は多段（空行差を無視する段を含む）

### 3.3 webview2-bridge の現状（要点）

- `contract/contract.ts`（zod）→ `contract.schema.json`（中間表現）→ TS 型 / VB DTO・Interface・Dispatcher を生成
- 生成先: `dotnet/WebView2Bridge.Contract/Generated/*.vb`、`apps/web/src/generated/*`
- `webview2-bridge.gen.json` に `vb.namespace` / `vb.runtime.outDir` / `vb.winforms.outDir` 等を記述
- dotnet 側は SDK スタイル .vbproj（netstandard2.0 / net48）。既存の旧スタイル .vbproj には触れない方針

実業務での想定レイアウト（旧アプリに webview2-bridge を足した状態）:

```
Repo/
  App.sln                       ← 旧スタイル .vbproj（既存 WinForms）
  App/App.vbproj
  App/Forms/*.vb, *.Designer.vb
  dotnet/App.Contract/           ← SDK スタイル（生成コード）
  dotnet/App.Impl/               ← SDK スタイル（人が書く API 実装）
  dotnet/App.Host/               ← SDK スタイル（WinForms + WebView2 ホスト）
  contract/contract.ts           ← 契約の正本（.vbproj に乗らない）
  apps/web/                      ← Vite + React（.vbproj に乗らない）
  webview2-bridge.gen.json
  protocol.md                    ← petari init が生成
```

---

## 4. 用語

- **パック**: slnmix の出力（`repomix-output.xml`）
- **段（tier）**: パック内でのファイルの出し方。`full`（全文）/ `skeleton`（シグネチャのみ）/ `summary`（`ui_summary` / `contract_summary` による要約）/ `skipped`
- **論理パス**: `.vbproj` 上の見え方（Link を反映）。**物理パス**: ディスク上の実パス
- **ルート**: パックの基準ディレクトリ。`.sln` のあるディレクトリ（`.vbproj` 直指定時はその親）。petari のプロジェクトルートと一致させる（§14-3）
- **手順文（procedure）**: AI の作業手順を指示する文。slnmix が内蔵。`protocol.md`（出力形式規約）とは別物
- **旧スタイル / SDK スタイル**: `.vbproj` の形式。`<Project Sdk="...">` があれば SDK スタイル

---

## 5. フェーズ一覧と優先順

| # | 内容 | リポジトリ | 前提 | 優先 |
|---|---|---|---|---|
| 1 | 手順テンプレート（`<procedure>`）、`--task`、`--mode` | slnmix | なし | **最優先** |
| 2 | SDK スタイル .vbproj 対応 | slnmix | なし | 高（webview2-bridge を使うなら必須） |
| 3 | `extraRoots`（web 同梱）、`<contract_summary>`、web 側マスク、**物理パス化** | slnmix | 2 | 高 |
| P1 | petari: vbproj 対応 `create`、新規ファイルのエンコーディング推定 | petari | 3（物理パス化） | 高（1〜3 と並行可） |
| 4 | `--focus` / skeleton / シンボル索引 / `--budget` | slnmix | **入力上限の測定（§15.1）** | 中（測定後に着手） |
| 5 | 境界またぎのリンク（契約メソッド名で TS ↔ VB を接続） | slnmix（+ webview2-bridge 任意） | 3, 4 | 低 |
| P2 | petari: 目録による警告（任意） | petari | 4 | 低 |
| W | workbench 凍結の明文化、slnmix CLAUDE.md 更新 | slnmix / workbench | なし | フェーズ 1 と同時 |

フェーズ 1 だけでも効果がある。フェーズ 4 は上限測定の結果、不要と判断される可能性がある（その場合は着手しない）。

---

## 6. フェーズ 1 — 手順テンプレート、`--task`、`--mode`（slnmix）

### 6.1 狙い

思考エフォートを外から上げられないので、**回答本文の中で考えさせる**。調査 → 方針 → 変更 → 自己検証を必須セクションにし、曖昧なら推測せず質問して止まらせる。`protocol.md`（petari の出力形式規約）とは責務が違うので、別ブロックにする。

### 6.2 出力レイアウト（変更後）

```
<instruction_notice>   ← 先頭リマインダ。タスクの 1 行要約 + 末尾の <task>/<procedure>/<instruction> への誘導
<file_summary>          ← 既存 + 段の説明（フェーズ 4 で拡張）
<directory_structure>
<files>                 ← <file> / <ui_summary> / <contract_summary>（フェーズ 3）
<skipped_files>
<task>                  ← --task があるとき
<plan>                  ← --mode implement --plan があるとき
<procedure>             ← 内蔵既定文 or procedure.md
<instruction>           ← protocol.md（既存。petari の規約）
```

末尾に置く理由: 長い文脈の**後**に指示を置く方が従いやすい（既存のサンドイッチ設計と同じ根拠）。先頭リマインダは Copilot の要約処理で末尾が落ちる対策。

`<procedure>` は `protocol.md` の有無に関わらず出す（`--no-procedure` で抑止）。`protocol.md` がない場合、先頭リマインダは `<procedure>` への誘導のみになる。

### 6.3 オプション

```
--task <file|text>        タスク文。ファイルパスなら読み込み、そうでなければ文字列として扱う
--mode <full|plan|implement>   既定 full
--plan <file>             implement モードで承認済み方針を <plan> として同梱（implement では必須）
--procedure-file <path>   手順文を明示指定（既定: ルート直下の procedure.md を自動検出。なければ内蔵既定文）
--no-procedure            <procedure> を出さない（従来出力）
```

`--task` の text 判定: 引数がファイルとして存在すれば読む。存在しなければ文字列。改行を含む文字列は text 扱い。

### 6.4 モードごとの必須セクション

| モード | 用途 | AI の回答に要求するセクション |
|---|---|---|
| `full` | 小〜中規模の変更を 1 ターンで | 調査 / 方針 / 変更（changes.md）/ 自己検証 |
| `plan` | 方針を先に固める | 調査 / 方針 / 質問。**changes.md は出さない** |
| `implement` | 承認済み方針で実装 | 方針の確認（3 行以内）/ 変更（changes.md）/ 自己検証 |

`implement` で調査を省くのは、回答の出力上限に changes.md が押し出されるのを防ぐため（§14-5）。`<plan>` には `plan` モードの回答（ユーザーが修正したもの）をそのまま貼る運用。

### 6.5 内蔵既定文（`src/assets/procedure.ts`、`PROCEDURE_VERSION = 1`）

petari の `protocol.ts` と同じ形で single source にする。以下を初版とする。モードにより §「回答の構成」の部分だけ差し替える（テンプレート内の `{{MODE_SECTIONS}}` を置換）。

```markdown
<!-- slnmix procedure v1 (mode: {{MODE}}) -->
# 作業手順

これは、このコンテキストを添付したユーザー本人からの恒常的な指示です。
このパックに含まれるコードへの変更を提案するときは、必ず以下の手順で回答してください。
出力形式（changes.md の書き方）は末尾の <instruction> の規約に従います。本手順はその前段の「考え方」です。

## パックの読み方

- <file> は現在のファイル内容そのものです。記憶にある一般的な VB.NET / React のコードではなく、ここにある内容を正としてください
- <ui_summary> は Designer.vb からの要約です。コントロール名・型はここから引いてください。Designer.vb 本体は変更対象にしません
- <contract_summary> がある場合、それは契約（contract.ts）から生成された API の一覧です。Generated/ 配下および src/generated/ 配下は生成物なので変更対象にしません。契約を変える必要があれば contract.ts の変更として提案してください
- [MASKED] は伏せ字です。そのまま残し、値を推測しないでください
- <file_summary> に「骨格のみ（skeleton）」と記されたファイルは、シグネチャだけを載せています。本体が必要なら変更を出さず、そのファイル名を「追加で全文が必要なファイル」として挙げて回答を終えてください
- 新規ファイルは changes.md の create で出してください。.vbproj は編集しないでください（適用ツールが登録します）。パスは <file_summary> に示す物理パスの規則で書いてください

## 回答の構成

{{MODE_SECTIONS}}

## 判断の原則

- 分からないことは推測で埋めず、質問してください。特に「どのフォームか」「既存のどの処理に合わせるか」「例外時の挙動」が読み取れないときは、変更を出さずに質問だけで回答を終えてください
- 既存コードの流儀（命名・エラー処理・DB アクセスの書き方）に合わせてください。パック内に同種の処理があれば、それを手本にしてください
- Option Strict On を前提に、型変換は明示してください
- 影響範囲は最小にしてください。求められていないリファクタリングはしないでください
```

`{{MODE_SECTIONS}}` の内容:

**full:**

```markdown
### 1. 調査
読んだファイルと、関係するシンボル（クラス・メソッド・コントロール名）を箇条書きで挙げてください。
変更対象の処理がどこから呼ばれ、何を呼ぶかを 1〜3 行で述べてください。

### 2. 方針
何をどう変えるかを述べてください。検討して採らなかった案があれば理由とともに 1 行で。
リスク（既存動作への影響、未確認の前提）を挙げてください。
確認したいことがあれば、ここで質問し、変更を出さずに終えてください。

### 3. 変更
末尾の <instruction> の規約どおり changes.md を出してください。

### 4. 自己検証
changes.md の SEARCH ブロックごとに、次を表で確認してください。
| ファイル | ブロック | パック内に全文があるか | 空行・インデント込みで逐語一致か | ファイル内で一意か |
加えて次を確認してください。
- 同じファイルへの SEARCH ブロック同士が重なっていない
- Handles 句のイベント名・コントロール名が <ui_summary> と一致している
- Designer.vb / .resx / Generated / src/generated を変更していない
- 新規ファイルは create で出し、.vbproj を編集していない
- 日本語 Shift_JIS のファイルに、Shift_JIS で表現できない文字を入れていない
問題があれば changes.md を修正してから回答を確定してください。
```

**plan:**

```markdown
### 1. 調査
（full と同じ）

### 2. 方針
（full と同じ。ただし changes.md は出さない）

### 3. 質問
曖昧な点・確認したい点を番号付きで挙げてください。なければ「なし」と書いてください。
このモードでは changes.md を出さないでください。
```

**implement:**

```markdown
### 1. 方針の確認
<plan> の内容を 3 行以内で要約し、そのとおりに実装することを述べてください。<plan> と矛盾する事実をパック内に見つけた場合は、実装せずにその点を指摘して終えてください。

### 2. 変更
（full の 3 と同じ）

### 3. 自己検証
（full の 4 と同じ）
```

### 6.6 `procedure.md` による上書き

- ルート直下に `procedure.md` があれば、内蔵既定文の代わりにその内容を**一字一句そのまま**使う（`protocol.md` と同じ扱い）。`{{MODE_SECTIONS}}` / `{{MODE}}` プレースホルダがあれば置換する。なければそのまま
- `procedure.md` を生成するコマンドは作らない。代わりに `slnmix --print-procedure [--mode ...]` で内蔵既定文を標準出力に書けるようにし、カスタマイズしたい人はリダイレクトして編集する（これは init ではなく、必要な人だけが使う印刷機能）
- プロジェクト固有の規約（コーディング規約、禁止事項）は `procedure.md` の末尾に追記する運用を README で案内する。別ファイルは増やさない

### 6.7 先頭リマインダの変更

既存の `INSTRUCTION_NOTICE` を拡張し、以下を含める（存在するものだけ）:

```
[slnmix] このパックの末尾に <task>（依頼内容）、<procedure>（作業手順）、<instruction>（出力規約）があります。
回答の前に必ず末尾まで読んでください。
タスク: {{TASK_FIRST_LINE}}
モード: {{MODE}}
```

### 6.8 実装メモ

- CLI 固有（コア外）: `cli.ts`、`instructionFile.ts` を拡張するか `procedureFile.ts` を新設。`src/assets/procedure.ts` を追加
- テスト: モードごとの出力、`procedure.md` 上書き、`--task` のファイル/文字列判定、先頭リマインダ、`--no-procedure` で従来出力と一致すること
- README に「procedure と protocol の違い」「plan → implement の使い方」を追記

---

## 7. フェーズ 2 — SDK スタイル .vbproj 対応（slnmix）

### 7.1 狙い

webview2-bridge の dotnet 側は SDK スタイルで、`Compile` 項目を書かず `**/*.vb` が暗黙に含まれる。現行パーサーはこれを扱えない（ワイルドカードは未解決扱い、そもそも項目がない）。

### 7.2 仕様

- `<Project Sdk="...">` 属性の有無で SDK スタイルを判定。`Sdk` 属性がなく `<Import Project="Sdk.props" Sdk="..." />` 形式の場合も SDK スタイルとみなす
- SDK スタイルのとき、既定グロブを展開する:
  - `Compile`: `**/*.vb`（プロジェクトディレクトリ配下を再帰走査）
  - 除外: `bin/**`、`obj/**`、`**/*.user`、`<Compile Remove="...">` に一致するもの、`<DefaultItemExcludes>` があればそれも
  - `<EnableDefaultCompileItems>false</EnableDefaultCompileItems>` なら既定グロブを展開しない
  - 明示 `<Compile Include>` / `<Compile Update>` は既存どおり扱う（`Update` は `DependentUpon` 等のメタデータ付与として解釈）
- 展開したことを診断（info）と `<file_summary>` に明記する: 「このプロジェクトは SDK スタイルのため、既定の Compile グロブ（**/*.vb）を展開しました。MSBuild の完全評価ではありません」
- `.vbproj` の `Remove` に書かれたグロブは最小限のワイルドカード（`*` / `**`）だけ解釈する。それ以外の MSBuild 式は従来どおり未解決として記録
- `Designer.vb` の判定（`isSensitive`）は SDK スタイルでもファイル名規則で同様に行う。`Generated/` 配下の扱いはフェーズ 3

### 7.3 実装メモ

- `vbprojParser.ts` に `projectStyle: "legacy" | "sdk"` を `VbprojParseResult` に追加
- グロブ展開は `FsDeps` に `listFilesRecursive(dir): string[]` を追加して注入（テスト可能に）
- `.gitignore` の適用は既存の `GitignoreEvaluator` をそのまま通す
- テストフィクスチャ: SDK スタイル最小プロジェクト（`Remove` あり / `EnableDefaultCompileItems=false` あり）

---

## 8. フェーズ 3 — extraRoots、契約サマリー、web マスク、物理パス化（slnmix）

### 8.1 `slnmix.config.json`（任意）

ルート直下に置く。**なくても動く**。

```jsonc
{
  "extraRoots": [
    {
      "path": "apps/web",
      "kind": "web",
      "include": ["src/**/*.{ts,tsx,css}", "package.json", "vite.config.ts", "index.html"],
      "exclude": ["src/generated/**"]
    },
    { "path": "contract", "kind": "contract", "include": ["contract.ts", "package.json"] }
  ],
  "contractSchema": "contract/contract.schema.json",
  "generatedDirs": ["dotnet/App.Contract/Generated", "apps/web/src/generated"]
}
```

- `extraRoots[].path`: ルート相対。**宣言されたディレクトリだけ走査する**（ディレクトリ走査をしない原則の、明示的でスコープの狭い例外）
- 既定の除外（`include` に関わらず常に除外）: `node_modules/**`、`dist/**`、`build/**`、`.vite/**`、`**/*.map`、`.env*`、`.gitignore` / `.repomixignore` に一致するもの、バイナリ拡張子
- `include` 省略時の既定: `**/*.{ts,tsx,js,jsx,css,json,html}`（`kind: web`）、`**/*.ts`（`kind: contract`）
- `contractSchema` / `generatedDirs` は `webview2-bridge.gen.json` が同階層にあれば**自動検出**して既定値にする（§8.3）。明示すれば上書き

### 8.2 出力上の扱い

- `<directory_structure>` にプロジェクトと並べて `[web] apps/web/` のようにグループ表示
- `<file path="apps/web/src/App.tsx" root="web">` のように `root` 属性で区別
- 文字コードは UTF-8 前提（既存の `decodeSourceBuffer` を通すので Shift_JIS が混じっても壊れない）
- **認証情報マスクを extraRoots にも適用する**（既存 `credentialMasker` をそのまま通す）。`.env*` は既定除外。API キーらしき値は厳格モードでマスクされる。これを README に明記する（VB 側で守っている安全性が web を足した瞬間に落ちないように）

### 8.3 `<contract_summary>`

- `contractSchema`（`contract.schema.json`）を読み、メソッド・イベント・DTO の一覧を生成して `<files>` 内の契約ファイルの直後に埋め込む（`ui_summary` と同じ発想）
- `generatedDirs` 配下は既定で除外し、`<skipped_files>` に「生成物（contract_summary で代替）」と理由を書く。`--include-generated` で原文を含める
- 形式案:

```xml
<contract_summary path="contract/contract.schema.json">
契約から生成された API の要約（生成コード Generated/ と src/generated/ は除外。契約の正本は contract/contract.ts）:
methods:
- parts.search(req: PartsSearchRequest) -> PartsSearchResponse
- parts.get(id: string) -> Part | null
events:
- parts.changed(payload: PartsChangedEvent)
types:
- PartsSearchRequest { keyword: string; limit?: number }
- Part { id: string; name: string; updatedAt: string(ISO 8601) }
</contract_summary>
```

- `contract.schema.json` の構造は `packages/gen/src/schema.ts` を正として読む。slnmix 側に zod は入れない（JSON をそのまま読む）。スキーマ形式が変わったときに追従できるよう、`$schema` またはバージョン欄があればそれを確認し、未知の形式なら「要約できなかった」と `<skipped_files>` に書いて原文（`contract.ts`）だけ出す

### 8.4 物理パス化（重要・petari 連携の前提）

現行の `<file path>` は `プロジェクト名\論理パス`（`\` 区切り）。petari は「ルート相対・`/` 区切り」しか受け付けないため、AI がパス変換を行っている状態であり、Link ファイルやプロジェクト名 ≠ 物理フォルダ名のときに新規作成の置き場所が定まらない。

変更:

- `<file path>` を**ルート相対の物理パス・`/` 区切り**にする（例: `App/Forms/OrderForm.vb`）
- 論理パスと異なる場合（Link）、`logical="..."` 属性と `project="App"` 属性を付ける
- `<directory_structure>` は従来どおり論理ツリー（人が読む用）。ただし各行末に物理パスが異なるものは `→ 物理パス` を併記
- `<file_summary>` に規則を明記: 「path 属性はルート `<ルート名>` からの相対物理パスです。changes.md のパスはこの path をそのまま使ってください。新規ファイルも同じ規則で、置きたいプロジェクトの物理フォルダ配下に書いてください」
- **後方互換を破る変更**。バージョンを上げ（minor）、README に明記する。`--legacy-paths` で旧形式に戻せるようにする（1〜2 バージョン残して廃止）

---

## 9. フェーズ 4 — `--focus` / skeleton / シンボル索引 / `--budget`（slnmix）

**着手条件: §15.1 の入力上限測定を実施し、全件出力が上限に収まらないケースが実際にあること。** 収まるなら本フェーズは不要。

### 9.1 狙い

削るためではなく「必要なものを落とさずに縮める」ため。外したファイルは骨格（シグネチャ）として残し、存在しない API のでっち上げを防ぐ。

### 9.2 オプション

```
--focus <ファイル名|フォーム名|パターン>   複数可。論理パス・物理パス・型名のいずれにも全体一致（* 可）
--depth <N>                              focus からの参照追跡の深さ。既定 1
--budget <文字数>                         超過時に遠い段から skeleton へ降格。既定なし
```

`--focus` なし = 従来どおり全件 full（原則 2）。

### 9.3 段の決め方

| 段 | 対象 | 出し方 |
|---|---|---|
| full | focus に一致したファイル + その `DependentUpon` 群（Designer / resx の要約含む）+ depth 以内の依存先 | 全文 |
| skeleton | それ以外の Compile ファイル | シグネチャのみ（§9.5） |
| summary | focus のフォームの Designer.vb | `<ui_summary>`（focus 外のフォームは `<ui_summary>` を出さず、フォーム名とタイトルの 1 行のみ） |

- `<file_summary>` に「全文: N 件 / 骨格のみ: M 件」と各ファイルの段の一覧を載せる
- `<dependency_graph>` ブロックで `focus → 依存先` を列挙し、なぜそのファイルが full なのかを示す
- `--budget` 超過時は depth の大きいものから順に skeleton へ降格し、降格したことを `<file_summary>` に明記する。focus 自体は降格しない（収まらなければエラーで止め、`--focus` を減らすよう案内）

### 9.4 シンボル索引（`services/symbolIndex.ts`、コア）

正規表現ベース。完全な VB 構文解析はしない（既存方針）。

抽出するもの:
- `Namespace` / `Class` / `Module` / `Structure` / `Interface` / `Enum` / `Delegate` の宣言（修飾子、`Partial`、`Inherits` / `Implements`）
- Public / Friend / Protected のメンバ: `Sub` / `Function` / `Property` / `Event` / `Const` / `Dim`（モジュールレベル。`WithEvents` 含む）
- `Private` メンバは skeleton に含めない（本体理解は full で行う）。ただし Module の Private は「他から呼べない」判定に使う

参照検出（focus ファイル内の識別子 → 索引）:
- 確度高: `Inherits X` / `Implements X` / `New X(` / `As X` / `Handles X.Y` / `X.Y(` で X が索引の型名または Module 名
- 確度中: Module の Public メンバ名の裸呼び出し（VB は Module メンバを修飾なしで呼べる）。名前一致で拾い、偽陽性は許容
- 大文字小文字は区別しない

VB 固有の落とし穴（テストフィクスチャで必ず押さえる）:
- `_` による行継続（シグネチャが複数行にまたがる）
- 属性 `<Extension()>` / `<Obsolete("...")>` の前置
- 複数行にまたがる `Handles` 句
- `Partial Class` が複数ファイルに分かれる（Designer と本体）
- `Option Strict` 等のファイル先頭指令、`Imports`
- 日本語識別子（VB は許容。`\w` に頼らず Unicode 文字クラスで）

### 9.5 skeleton の形式

```vb
' [skeleton] 本体は省略。シグネチャのみ。変更対象にする場合は全文を要求すること
Public Class OrderService
    Inherits BaseService
    Public Shared ReadOnly DefaultLimit As Integer = 100
    Private WithEvents timer As Timer   ' Private でも WithEvents は残す（イベント配線の理解に必要）
    Public Sub New(conn As IDbConnection)
    Public Function Search(keyword As String, Optional limit As Integer = 100) As List(Of Order)
    Public Event Changed(sender As Object, e As EventArgs)
End Class
```

- 元の行の並び順を保つ。`End Sub` / `End Function` は出さない（本体がないことを明確に）
- `<file path="..." tier="skeleton">` 属性で区別

### 9.6 実装メモ

- 索引・段決定・skeleton 生成はすべてコア（`services/`）。CLI は `--focus` 等をオプションに変換するだけ
- `RepomixExportOptions` に `focus?: { patterns: string[]; depth: number; budget?: number }` を追加
- 手順文（§6.5）の「骨格のみ」の一文は本フェーズで意味を持つ。フェーズ 1 の時点で入れておいてよい（骨格ファイルが存在しなければ無害）

---

## 10. フェーズ 5 — 境界またぎのリンク（slnmix + webview2-bridge 任意）

### 10.1 狙い

`--focus PartsApi` で、React 側の呼び出し箇所（`client.parts.search(...)`）と VB 側の実装（`Impl/PartsApi.vb`）を一度に full で引く。契約をまたぐ変更の文脈を 1 回で揃える。

### 10.2 仕様

- `<contract_summary>` のメソッド名を索引に登録し、TS 側（`client.<group>.<method>(`、生成型名）と VB 側（`Implements I<Group>Api`、生成インターフェースのメソッド名）の両方から参照として辿れるようにする
- 名前の対応規則は `webview2-bridge` の `naming.ts`（pascalCase / vbEscape / toIdentifier）に依存する。**slnmix に複製すると規則変更時に追従が切れる**ため、以下のどちらかを選ぶ:
  - (a) webview2-bridge の gen が `contract.names.json`（契約名 → TS メンバ名 / VB インターフェース名・メソッド名 / DTO 型名）を書き出す（任意拡張、§12）。slnmix はそれを読む。**推奨**
  - (b) (a) がない場合の暫定として slnmix 側に規則を写す。`<file_summary>` に「名前対応は slnmix 内の規則で推定」と明記
- (a) が存在すれば (a)、なければ (b) にフォールバックする

---

## 11. petari の改修

### 11.1 P1-a: vbproj 対応 `create`

**背景**: 旧スタイル .vbproj は `<Compile Include>` に載っていないファイルをコンパイルしない。AI にこれをやらせると、パックに .vbproj 本体がないため SEARCH が一致せず失敗する。知らなければファイルはできても VS 上に現れない。どちらも「新規が絡むと失敗」に見える。**AI ではなく petari が機械的に登録する。**

仕様:

- `create` の対象が `.vb` のとき、作成先ディレクトリから上へ辿り、**プロジェクトルートまでの間で最寄りの `*.vbproj`** を探す
  - 見つからない → 登録せず、レポートに「vbproj が見つからないため未登録」と出す（失敗にはしない）
  - 複数の `.vbproj` が同じディレクトリにある → 登録せず警告（人が決める）
  - SDK スタイル（`<Project Sdk=...>` / `Sdk.props` Import）→ 登録不要。レポートに「SDK スタイルのため登録不要」
- 旧スタイルで未登録なら、`Compile` 項目を含む最初の `<ItemGroup>` の末尾に追加する。`Compile` 項目を含む `ItemGroup` がなければ新しい `ItemGroup` を最後の `ItemGroup` の後に作る
  - `Include` は .vbproj からの相対パス・`\` 区切り
  - インデントは同じ `ItemGroup` 内の既存項目に合わせる（なければ 4 スペース）
  - 追加行のみを挿入し、他の行は元バイト列を書き戻す（既存の行単位ドキュメント方式をそのまま使う。エンコーディング・改行・BOM は保たれる）
- 新規ファイルの内容に `Inherits System.Windows.Forms.Form` / `Inherits Form` / `Inherits UserControl` 等があれば `<SubType>Form</SubType>`（UserControl は `UserControl`）を付ける
- 同じ changes.md 内で `X.vb` と `X.Designer.vb` の両方が `create` される場合、`X.Designer.vb` に `<DependentUpon>X.vb</DependentUpon>` を付ける。`.resx` の生成は行わない（フォームの新規作成は当面 VS で行う運用。§14-6）
- 既に登録済み（`Include` が一致）なら何もしない（冪等）
- `delete` で `.vb` を消したときの `.vbproj` からの除去は**行わない**（削除は影響が大きく、VS 側でエラーとして見える方が安全。§17 に記録）
- 無効化: `.petari/config.json` の `"vbproj": { "register": false }` または `petari apply --no-vbproj`
- history / undo の対象に .vbproj の変更も含める（undo で登録も戻る）
- レポート例: `vbproj に登録: App/App.vbproj ← Services/OrderService.vb`

実装配置（petari の層構成に従う）:
- `src/core/vbproj.ts`: 純粋関数。`(vbprojText: string, relInclude: string, opts: { subType?: string; dependentUpon?: string }) → { text: string; changed: boolean; reason?: string }`。判定（旧/SDK、登録済み）と挿入位置計算・行挿入。XML パーサは入れない（実行時依存ゼロ）。正規表現 + 行処理で `<ItemGroup>` / `<Compile Include="...">` を扱う。整形が特殊な .vbproj（1 行に複数要素、CDATA 等）は「登録できない形式」として未登録扱いにし、壊さない
- `src/infra/vbproj.ts`: 最寄り .vbproj の探索（ファイル I/O）
- `src/commands/apply.ts`: create 成功後に呼ぶ。失敗しても create 自体は成功扱い（レポートに載せる）
- テスト: 旧スタイル（登録あり / なし / 登録済み / Form / Designer+DependentUpon / Shift_JIS+CRLF の .vbproj）、SDK スタイル、vbproj なし、複数 vbproj

### 11.2 P1-b: 新規ファイルのエンコーディング推定

**背景**: 現行既定は `utf8` / `lf` / BOM なし。日本語コメントを含む `.vb` を BOM なし UTF-8 で作ると、vbc / VS はシステムコードページ（CP932）とみなして化ける。Shift_JIS / CRLF の既存ファイルと混在もする。

仕様:

- `newFile.encoding` に `"auto"` を追加し、**`petari init` の雛形の既定を `"auto"` にする**（既存ユーザーの config は変えない。README に案内）
- `auto` のとき、作成先と同じディレクトリの既存テキストファイル（同じ拡張子を優先、なければ任意のテキスト）を検出し、多数決で `encoding` / BOM / `eol` を決める
  - 同じディレクトリに手本がなければ、上位ディレクトリを 1 段ずつ辿る（ルートまで）
  - それでもなければ拡張子別の既定: `.vb` → `utf8` + **BOM あり** + `crlf`、それ以外 → `utf8` / BOM なし / `lf`
- `.vb` で結果が `utf8` かつ BOM なしになった場合（ASCII のみの Shift_JIS ファイルが UTF-8 判定される既知の限界に由来）、**BOM を付ける**。理由: BOM なし UTF-8 の日本語は vbc で化けるが、BOM 付き UTF-8 は VS / vbc とも正しく読める。Shift_JIS が本来の期待でも実害は出ない（差分は BOM の有無だけで、コンパイル結果は同じ）
- レポートに採用した設定と根拠（「同ディレクトリの 5 ファイル: shift_jis/crlf」等）を 1 行出す
- 明示指定（`"utf8"` / `"shift_jis"`、`bom`、`eol`）があれば従来どおりそれを使う

### 11.3 P2: 目録による警告（任意・フェーズ 4 後）

- slnmix が `--manifest` 指定時に `repomix-output.manifest.json`（含めたファイルの物理パスと段）を隣に書く。既定では書かない（ファイルを増やさない原則）
- petari は `.petari/config.json` の `manifest` にパスがあれば読み、changes.md が「骨格のみのファイル」「パックに含まれていないファイル」を変更しようとしていたら**警告**する（既定は続行。`--strict-manifest` で失敗扱い）
- モデルの自己検証をすり抜けたものを機械的に止める保険。優先度は低い

### 11.4 `protocol.md`（規約文）への追記

`create` / `.vbproj` の扱いは手順文（slnmix 側）に書くが、出力形式に関わる次の 1 点は `protocol.md` にも追加する（`PROTOCOL_VERSION` を上げる）:

- 「SEARCH ブロックは、一意に特定できる範囲のうち**最小**（目安 3〜8 行）にする。大きな範囲は一致に失敗しやすい。ファイルの過半が変わるなら rewrite を使う」（既存 3 項の補強）

---

## 12. webview2-bridge の任意拡張

- `pnpm gen` が `contract.names.json` を出力する（出力先は `webview2-bridge.gen.json` で指定、既定は `contract/` 隣）。内容: 契約上の名前ごとに TS 側メンバ名、VB 側インターフェース名・メソッド名・DTO 型名、生成ファイルのパス
- これは §10 の (a) 用。フェーズ 5 に入るまで不要。gen のバージョンを minor で上げる
- それ以外は触らない

---

## 13. workbench の凍結と CLAUDE.md の更新（フェーズ W）

- slnmix の CLAUDE.md から「コアは Legacy VB.NET Workbench と二重管理」の節を削除し、次に置き換える:
  - 「解析コアは slnmix が唯一の置き場。legacy_vb_workbench は 2026-09 時点で凍結（新機能は追わない）。将来 workbench で新コアが必要になったら、slnmix に `index.ts` で公開 API を追加して依存させる。パッケージ分離はそのとき検討する」
  - 意図的な差分 2 箇所（ツール名・Designer スキップ理由の文言）の制約を解除
- workbench の README / CLAUDE.md に凍結の旨を 1 段落追記（コードは触らない）

---

## 14. 要確認事項・未決定

1. **Copilot Chat の入力上限**（§15.1）。フェーズ 4 の着手判断に必要。貼り付けと添付で差があるかも含む
2. **実際に使われているモデル**。Excel 365 のモデルセレクターに「Opus v5」「Opus 4.8」が並ぶかで判別できる可能性。Opus 5 なら性能差は縮まる
3. **petari のプロジェクトルート**。`findProjectRoot` が返す場所と slnmix のルート（.sln のディレクトリ）が一致する運用にする。`.petari/` と `protocol.md` を .sln の隣に置く前提でよいか。webview2-bridge 構成では .sln がリポジトリ直下にない可能性があるので、その場合の基準を決める（候補: `slnmix.config.json` の `root` で明示 / `.petari/` のある場所を slnmix も基準にする）
4. **新規ファイルの失敗の実態**。§11.1〜11.2 は 3 つの仮説（.vbproj 未登録 / エンコーディング / パス基準）をすべて塞ぐ設計だが、実際のエラーメッセージや症状が分かれば優先を絞れる
5. **回答の出力上限**。手順文で回答が長くなり changes.md が途中で切れるリスク。`implement` モードで調査を省くのはその対策。それでも切れる場合、複数回答への分割規約（`changes.md` を `(1/2)` `(2/2)` に分け、petari が連結して適用）を検討する。まずは実運用で切れるかを見る
6. **フォームの新規作成**。`Designer.vb` + `.resx` + `DependentUpon` の 3 点セットが要る。当面は「VS で空フォームを作る → 中身は AI」。petari で `.resx` の雛形まで生成するかは後回し
7. **`contract.schema.json` の安定性**。`schema.ts` の形式が変わったとき `<contract_summary>` が壊れないよう、バージョン欄の有無を確認する
8. **物理パス化（§8.4）の影響範囲**。既存の Link ファイルで、物理パスがルートの外（別ドライブ）にあるものは petari で適用できない。その場合 `path` はどうするか（候補: `logical` を主にし `physical="D:/..."` を情報として付け、`<file_summary>` に「このファイルは適用ツールの範囲外」と明記）

---

## 15. 計測

### 15.1 入力上限の測定（フェーズ 4 の前提）

1. 1,000 文字ごとに `<!-- MARK 0001 -->` のような行を仕込んだダミーテキストを生成する（slnmix に `--probe <文字数>` を一時的に付けてもよいし、スクリプトでもよい）
2. Copilot Chat に貼り付けて「最後に見えた MARK の番号だけ答えて」と聞く
3. 同じものを添付（ファイルアップロード）でも試す
4. 200K / 400K / 800K 文字の 3 点で行い、実効上限と貼付/添付の差を記録する
5. 結果を §17 に記録。現在の実業務ソリューションの全件パックの文字数（slnmix の末尾表示）と比較し、フェーズ 4 の要否を決める

**測定結果（2026-09-12、ダミーは `test_rep/probe/`、1,000 文字ごとに MARK 行）**

| 経路 | 200K | 400K | 800K | 備考 |
|---|---|---|---|---|
| 貼付（入力欄にペースト） | MARK 0122 付近が限界 | — | — | 上限 **約 120K 文字**。入力欄はペースト自体を受け付けるが、上限を超えると**送信ボタンが非活性になり送信できない**（黙って切り詰められることはない）。下から削って送信できた範囲について、Copilot 自身が「投稿本文がそのままコンテキストに含まれていた（目視で追った）」と回答 = この範囲は本文がコンテキストに直接入る |
| 添付（ファイルアップロード） | 0199 正答 | 0399 正答 | 0799 正答 | ただし 800K では「本文をコンテキストに展開したのではなく、ファイルをコマンドで読み取って確認した」と明言 = 検索・読み取りツール経由で、本文全体がモデルに見えているわけではない |

解釈:
- 添付経路にサイズの壁はないが、モデルは必要箇所を検索して読む。SEARCH が部分的な読み取りから再構成されて失敗する事例（petari §7 の診断拡充の起点）と、末尾の規約文が届かない既知問題（2026-08-10）はこの経路の性質で説明できる
- 貼付経路は約 120K 文字までなら全文がコンテキストに入る。超えると送信自体ができないため、貼付経路で末尾が黙って落ちることはない。末尾 `<instruction>` が届かない既知問題（2026-08-10）は添付経路（検索読み取り）の性質によるもの
- **実業務ソリューションの全件パックは約 345K 文字**（`npx slnmix` 末尾表示。スキップ 8 件 / 認証情報マスク 31 件 / UI サマリー 1 件）。貼付上限の約 3 倍のため、現行運用は添付経路にならざるを得ず、これまでの SEARCH 不一致・規約文の欠落はすべて添付経路で起きていたことになる
- したがって**フェーズ 4 に着手する**。目的は「パックを約 120K 文字以内（安全側で 100K 目安。上限はトークン基準の可能性があり、実コードとダミーで密度が異なる）に収め、貼付経路で全文をコンテキストに入れる」。345K → 100K は約 1/3 への圧縮なので、`--focus` による full / skeleton の段分けと `--budget` の降格が必須になる

### 15.2 効果の測定（フェーズ 1 の検証）

- 過去に AI に依頼したタスクから 3〜5 件を選び、パック・依頼文・期待する変更を固定する
- 手順文あり / なし（`--no-procedure`）で同じ依頼を投げ、次を数える: petari の適用成功（初回）/ ビルド通過 / 質問で止まった件数（曖昧なタスクを 1 件混ぜる）
- 主観評価は「方針セクションの内容が妥当か」の 3 段階
- 記録は簡単な表でよい。改善のたびに同じセットで再測定する

---

## 16. 完了条件

各フェーズ共通: `pnpm test` / `pnpm typecheck`（petari）または `pnpm test`（slnmix: tsc → mocha）が全パス。README 更新。バージョン更新（`npm publish` はメンテナー本人）。

| フェーズ | 完了条件 |
|---|---|
| 1 | `--no-procedure` で従来出力と完全一致。3 モードの出力がスナップショットテストで固定。`procedure.md` 上書きが動く。`--print-procedure` が動く |
| 2 | SDK スタイル最小プロジェクトのフィクスチャで Compile 一覧が期待どおり。`EnableDefaultCompileItems=false` / `Remove` が効く。展開の宣言が出力に含まれる |
| 3 | `slnmix.config.json` なしで従来どおり動く。`extraRoots` で web ファイルが同じパックに入り、`.env` と `node_modules` が入らない。`<contract_summary>` がフィクスチャの schema から生成される。web ファイルにマスクが効く。物理パス化が Link あり/なしの両方で正しい。`--legacy-paths` で旧形式 |
| P1 | 旧スタイル .vbproj への登録が Shift_JIS / CRLF のフィクスチャで他の行を 1 バイトも変えない。SDK スタイルは登録しない。undo で戻る。`auto` の推定がフィクスチャ（同ディレクトリ shift_jis/crlf）で一致。`.vb` の BOM なし UTF-8 を作らない |
| 4 | `--focus` なしで従来出力と一致。focus 時に `<file_summary>` の段一覧・`<dependency_graph>` が出る。skeleton のフィクスチャ（行継続・属性・複数行 Handles・日本語識別子）が期待どおり。`--budget` の降格が明記される |
| 5 | `contract.names.json` あり/なしの両方で `--focus <契約名>` が TS/VB 両側を full にする |
| W | slnmix CLAUDE.md から二重管理の記述が消えている。workbench に凍結の記述がある |

---

## 17. 決定ログ

| 日付 | 決定 | 理由 |
|---|---|---|
| 2026-09-11 | 手順文（procedure）は slnmix が内蔵し、`protocol.md` とは分離する | 責務が違う（考え方 vs 出力形式）。petari の正本方式を真似て外部ファイル必須にすると `slnmix init` が要る。原則 1 |
| 2026-09-11 | `slnmix init` は作らない。`slnmix.config.json` / `procedure.md` は任意 | 必須セットアップは `petari init` 一回のみ |
| 2026-09-11 | 絞り込み（`--focus`）は上限測定後に着手。既定は全件出力 | 削るより抜け落ちない方を優先。上限に収まるなら不要 |
| 2026-09-11 | 解析コアは slnmix 単独。workbench は凍結。パッケージ分離はしない | workbench をほぼ使っていない。petari 経由の反映が主で、手編集前提のツールの価値が下がった |
| 2026-09-11 | `.vbproj` への登録は AI ではなく petari が行う | パックに .vbproj 本体がなく AI の SEARCH は一致しない。機械的処理の方が安全 |
| 2026-09-11 | `delete` 時の `.vbproj` からの除去は行わない | 削除の誤りは影響が大きい。VS 側で「ファイルがない」エラーとして見える方が安全 |
| 2026-09-11 | 新規 `.vb` は BOM なし UTF-8 を作らない | vbc / VS がシステムコードページとみなして日本語が化ける |
| 2026-09-11 | `<file path>` をルート相対の物理パス・`/` 区切りに変更（`--legacy-paths` で旧形式） | petari の受け付ける形式と一致させ、AI のパス変換をなくす。新規ファイルの置き場所を確定させる |
| 2026-09-11 | 生成コード（`Generated/` / `src/generated/`）は Designer.vb と同じ扱い（除外 + 要約） | 生成物を AI に編集させない。契約の正本は `contract.ts` |
| 2026-09-11 | 名前対応規則は webview2-bridge の gen が出す `contract.names.json` を正とし、slnmix はフォールバックのみ持つ | 規則を複製すると変更時に追従が切れる |
| 2026-09-12 | 設計書のファイル名は `docs/HANDOFF-slnmix-petari-2026-09.md`(計画段階の `HANDOFF-2026-09.md` から変更) | petari 側のセッションからも参照するため、対象リポジトリを名前に含めた |
| 2026-09-12 | `--plan` は `--mode implement` 専用、`implement` は `--plan` 必須(どちらもエラーで止める) | 方針なしで implement を走らせると「調査を省いた手順」だけが残り、質の低下を黙って招く |
| 2026-09-12 | 先頭リマインダは `<task>` / `<plan>` / `<procedure>` / `<instruction>` のうち存在するものだけを列挙する。末尾が規約文のみのときは従来文面をそのまま使う | `--no-procedure` で従来出力と完全一致させる(§16 フェーズ 1 の完了条件) |
| 2026-09-12 | 内蔵既定文の plan / implement で「(full と同じ)」となっていた箇所は実文に展開する | AI には full の文面が見えないため参照できない |
| 2026-09-12 | `--print-procedure` は `procedure.md` の有無に関わらず内蔵既定文を出す | カスタマイズの起点は常に既定文。上書き後の確認は通常出力で行う |
| 2026-09-12 | フェーズ W のうち workbench 側(README / CLAUDE.md への凍結追記)はセッション A の対象外(slnmix のみ)として残す | 複数リポジトリを跨ぐ変更はセッションを分ける運用 |
| 2026-09-12 | SDK スタイルの既定除外は `bin/**` / `obj/**` / `**/*.user` / `**/.*/**`(ドットフォルダ)に固定。`BaseOutputPath` 等のプロパティは読まない | Microsoft.NET.Sdk の既定値をそのまま使う。プロパティ評価に踏み込むと MSBuild 評価の再実装になる |
| 2026-09-12 | 既定グロブの展開は `Compile` のみ(`EmbeddedResource` の `**/*.resx` は展開しない) | `.resx` は元々出力対象外。§7 の範囲に留める |
| 2026-09-12 | 明示 `<Compile Include>` と展開結果が同じファイルを指す場合は明示側を採り、重複件数を診断に残す | MSBuild では NETSDK1022 エラーになるが、静的解析では止めずに取れた分を出す |
| 2026-09-12 | `<Compile Remove>` / `<Compile Update>` は旧スタイルでも解釈する(Update は一致項目へのメタデータ付与、Remove は適用対象なしとして info) | Remove / Update は MSBuild 15 以降の構文で形式に依存しない。旧スタイルで `Include 属性のない要素` 扱いにして警告するのは誤り |
| 2026-09-12 | `EnableDefaultCompileItems` 等が `Condition` 付き `PropertyGroup` にある場合は評価せず値を採用し、その旨を info に残す | 原則 3(推測したときは宣言する) |
| 2026-09-12 | ファイル走査(`listFilesRecursive`)は SDK スタイルのときだけ呼び、シンボリックリンクは辿らない | 旧スタイルの挙動を変えない。循環防止 |
| 2026-09-12 | ルートは入力(.sln / .vbproj)のあるディレクトリに固定(§14-3)。`slnmix.config.json` の `root` は作らない | protocol.md / .gitignore / 出力先の既定と同じ基準で分かりやすい。petari 側(`.git` 上方探索 or `--root`)と揃える運用は README に明記。`.sln` がリポジトリ直下にない構成が実際に出てきたら再検討 |
| 2026-09-12 | ルート外のファイル(別ドライブの Link 等)は `path` を `プロジェクト名/論理パス`(/ 区切り)にし、`physical` / `outside_root` 属性と `<file_summary>` の一覧で「適用ツールの範囲外」と明記(§14-8) | パス自体は petari が拒否する形にしない(絶対パス・`..` を出さない)が、適用できないことは隠さない |
| 2026-09-12 | 論理パスと物理パスが一致するファイルには `project` / `logical` 属性を付けない | 大半のファイルで冗長。差があるときだけ目立つ方が AI にも人にも読みやすい |
| 2026-09-12 | `<contract_summary>` は extraRoots の `kind: contract` のファイル群の直後に置く(なければ `<files>` 末尾) | 「契約ファイルの直後」(§8.3)を、契約ファイル名を知らなくても実現できる規則にした |
| 2026-09-12 | `contract.schema.json` は `contractVersion === 1` のみ要約する。それ以外は理由付きで `<skipped_files>` へ | §8.3 の「未知の形式なら要約しない」。zod は入れない |
| 2026-09-12 | extraRoots の既定除外(node_modules 等)は件数だけ診断に残し、`<skipped_files>` には載せない | 数千件になり出力を汚す。`exclude` / バイナリ / `.gitignore` による除外は従来どおり 1 件ずつ載せる |
| 2026-09-12 | 認証情報マスクの `KEY = 値` パターンは、値の先頭が空白・引用符のもの(コードの代入 `KEY = "..."`)を対象外にした | web 側(TS)で `= "` の間の空白が値として `[MASKED]` になり代入の形が壊れていた。引用符内は文字列リテラルとして高エントロピー判定で扱う |
| 2026-09-12 | petari §11.1 の純粋関数は「行配列 in → 挿入位置 + 挿入行 out」(`registerCompileItem`)。テキスト in/out ではなく、挿入行だけを行単位ドキュメントに差し込む | 既存の DocLine (raw バイト保持) 方式にそのまま乗せれば、挿入行以外を 1 バイトも変えない保証が実装ではなく構造で得られる |
| 2026-09-12 | petari の `.vbproj` 登録先は「Compile を含む最初の **Condition なし** ItemGroup」。Condition 付きしかなければ新しい ItemGroup を作る | Condition 付きに入れると条件付きコンパイルになり、VS 上で見えない構成が生じる |
| 2026-09-12 | `X.Designer.vb` には `<SubType>` を付けない。`<DependentUpon>` は親 `X.vb` が同じ changes.md で create されるときに加え、既にディスクにあるときも付ける | VS 自身の生成物と同じ形にする。ディスク上の親の存在は推測ではなく事実 |
| 2026-09-12 | 同じ changes.md が `.vbproj` 自体も変更する場合は、その変更後の内容に登録を重ねる(スキップしない)。manifest は AI 側の op のまま `registered` を付け、純登録は `op: "vbproj"` | AI が .vbproj を触りつつ登録を忘れるケースこそ本機能の対象。undo は before 復元で両方戻る |
| 2026-09-12 | petari `newFile.encoding: "auto"` の手本は同拡張子優先 → 任意のテキスト → 上位ディレクトリ。手本の条件は「通常ファイル・非ドットファイル・NUL なし・UTF-8/Shift_JIS としてデコード可能・1 MiB 以下」。同点は utf8 / BOM あり / CRLF 側 | 拡張子リストを持たず、デコード可否で判定する方が保守が要らない。同点の倒し方は .vb で安全な側 |
| 2026-09-12 | petari config の合成で `encoding: "auto"` のときは既定の `eol: "lf"` を混ぜない(ユーザーが明示した `eol` / `bom` は auto でも優先) | 混ぜると改行の推定が常に lf に固定され auto の意味がなくなる。従来形式(eol のみ指定)は従来どおり既定とマージし後方互換 |
| 2026-09-12 | petari §11.3(P2 目録警告)は未着手。slnmix フェーズ 4 の `--manifest` 実装後に着手する | 前提(§5 の依存)が未実装。任意項目 |
| 2026-09-12 | petari は v0.9.0 として §11.1 / §11.2 / §11.4 を同時にリリース(規約文 v4)。`petari init` の雛形の既定を `"auto"` + `"vbproj": { "register": true }` に変更、既存 config は変えない | §11.2 の指示どおり。既存ユーザーは README の案内で切り替える |
| 2026-09-12 | §15.1 の測定結果: 貼付の実効上限は約 120K 文字（MARK 0122 付近で打ち切り、範囲内は本文がコンテキストに直接入る）。添付は 800K まで最後の MARK を正答するが、コンテキスト展開ではなくコマンド読み取り（検索）経由 | Copilot 自身の回答（「投稿本文がそのままコンテキストに含まれていた」「アップロードされたファイルをコマンドで読み取って確認した」）から判断。MARK テストは添付経路の上限を測れない |
| 2026-09-12 | フェーズ 4 の要否判定の閾値は「実業務パックが約 120K 文字を超えるか」。超えるなら着手し、目標は `--focus` / `--budget` でパックを 120K 以内に収めて貼付経路で全文をコンテキストに入れること。添付経路は補助（サイズの壁はないが本文全体が見えない） | 添付前提の運用では絞り込んでも効果が薄い（読まれる範囲は検索次第）。貼付で全文が入る状態にすることが SEARCH 精度と規約文到達の両方に効く |
| 2026-09-12 | 実業務パックは約 345K 文字（貼付上限の約 3 倍）。フェーズ 4 に着手する。目標は貼付できるサイズ（100K 目安、上限 120K）への圧縮 | §15.1 の結果。添付経路では本文全体がモデルに見えず、SEARCH 不一致と規約文欠落の根本原因になっている。貼付で全文をコンテキストに入れることが最も効く |
| 2026-09-12 | 貼付上限超過は「送信ボタン非活性」で検知できる（黙って切り詰められない）。よって slnmix はパック末尾の文字数表示に加え、貼付上限の目安（120K）を超えたら 1 行警告を出す | 利用者が貼付か添付かを判断する材料をパック生成時点で与える。フェーズ 4 の `--budget` 既定値の根拠にもなる |
