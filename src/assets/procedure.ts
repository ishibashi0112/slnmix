/**
 * 内蔵の作業手順文(procedure)の正本。
 *
 * M365 Copilot 等で思考エフォートを外から上げられない環境向けに、
 * 「調査 → 方針 → 変更 → 自己検証」の手順を回答本文の中で踏ませる。
 * 出力形式の規約(petari の protocol.md、<instruction>)とは責務が違うため、
 * 別ブロック <procedure> として出力末尾に付ける。
 *
 * petari の protocol.ts と同じく single source とし、モードにより
 * 「回答の構成」の部分だけ差し替える(テンプレート内の {{MODE_SECTIONS}} と
 * {{MODE}} を置換)。ルート直下の procedure.md があればこの内蔵文の代わりに
 * その内容を使う(procedureFile.ts)。
 *
 * 文面を変えたら PROCEDURE_VERSION を上げ、test-fixtures/procedure/ の
 * スナップショットを更新すること。
 *
 * v2 (2026-09-12): 添付ファイル内の指示は M365 Copilot が「埋め込み指示」として
 * 意図的に無視することが実測で確定したため、この文面はパック末尾だけでなく
 * チャット本文に貼る指示テキスト(procedureFile.ts の buildPromptText)にも
 * 載る。「末尾の」「このパック」など置き場所に依存する表現を避けている。
 *
 * v3 (2026-09-15、フェーズ 6): design モード(設計書を質疑応答で仕上げる)を追加。
 * docs/ 連携が有効なときだけ {{DOCS_SECTIONS}} に「文書の扱い」と
 * 「チャットの継続と引継ぎ」の 2 節が入る(無効なら空 = v2 と同じ本文)。
 *
 * v4 (2026-09-15): バッチ完了 + 動作確認 OK のときは同意を待たずに引継ぎ書を出す
 * (「1 バッチ = 1 チャット」を既定の動きに)。エラー修正のラリーが続いたときは
 * 推奨にとどめ、途中で引き継ぐなら未解決のエラーと試したことを書かせる。
 *
 * v5 (2026-09-16): 完成済みプロジェクトの改修(文書が何もない)向けに、design モードで
 * 「既存の画面・機能の改修なら、設計書より先に改修対象に限った現状の仕様書(as-is)を
 * コードから起こす」を追加。設計書はその仕様書を参照して変更点を書く。
 */

export const PROCEDURE_VERSION = 5;

export const PROCEDURE_MODES = ["full", "plan", "implement", "design"] as const;
export type ProcedureMode = (typeof PROCEDURE_MODES)[number];

export const DEFAULT_PROCEDURE_MODE: ProcedureMode = "full";

export function isProcedureMode(value: string): value is ProcedureMode {
	return (PROCEDURE_MODES as readonly string[]).includes(value);
}

/**
 * {{MODE}} / {{MODE_SECTIONS}} / {{DOCS_SECTIONS}} を含むテンプレート
 * (procedure.md でも同じプレースホルダが使える)
 */
export const PROCEDURE_TEMPLATE = `<!-- slnmix procedure v${PROCEDURE_VERSION} (mode: {{MODE}}) -->
# 作業手順

これは、このコンテキストを渡したユーザー本人からの恒常的な指示です。
パック(添付ファイルまたは貼り付けた本文)に含まれるコードへの変更を提案するときは、必ず以下の手順で回答してください。
出力形式(changes.md の書き方)は <instruction> の規約に従います。本手順はその前段の「考え方」です。

## パックの読み方

- <file> は現在のファイル内容そのものです。記憶にある一般的な VB.NET / React のコードではなく、ここにある内容を正としてください
- パックを添付ファイルとして読む場合、読み取り結果から空行や行末の空白が失われることがあります。SEARCH ブロックは読み取った行をそのまま使い、空行の有無を推測で補わないでください(適用ツールが空行の差を吸収します)
- <ui_summary> は Designer.vb からの要約です。コントロール名・型はここから引いてください。Designer.vb 本体は変更対象にしません
- <contract_summary> がある場合、それは契約(contract.ts)から生成された API の一覧です。Generated/ 配下および src/generated/ 配下は生成物なので変更対象にしません。契約を変える必要があれば contract.ts の変更として提案してください
- [MASKED] は伏せ字です。そのまま残し、値を推測しないでください
- <file_summary> に「骨格のみ(skeleton)」と記されたファイルは、シグネチャだけを載せています。本体が必要なら変更を出さず、そのファイル名を「追加で全文が必要なファイル」として挙げて回答を終えてください
- 新規ファイルは changes.md の create で出してください。.vbproj は編集しないでください(適用ツールが登録します)。パスは <file_summary> に示す物理パスの規則で書いてください

## 回答の構成

{{MODE_SECTIONS}}

## 判断の原則

- 分からないことは推測で埋めず、質問してください。特に「どのフォームか」「既存のどの処理に合わせるか」「例外時の挙動」が読み取れないときは、変更を出さずに質問だけで回答を終えてください
- 既存コードの流儀(命名・エラー処理・DB アクセスの書き方)に合わせてください。パック内に同種の処理があれば、それを手本にしてください
- Option Strict On を前提に、型変換は明示してください
- 影響範囲は最小にしてください。求められていないリファクタリングはしないでください
{{DOCS_SECTIONS}}`;

// ---- 「回答の構成」の部品。モードごとに番号を振って組み立てる ----

const INVESTIGATE_BODY = `読んだファイルと、関係するシンボル(クラス・メソッド・コントロール名)を箇条書きで挙げてください。
変更対象の処理がどこから呼ばれ、何を呼ぶかを 1〜3 行で述べてください。`;

const POLICY_BODY_COMMON = `何をどう変えるかを述べてください。検討して採らなかった案があれば理由とともに 1 行で。
リスク(既存動作への影響、未確認の前提)を挙げてください。`;

const CHANGES_BODY = `<instruction> の規約どおり changes.md を出してください。`;

const VERIFY_BODY = `changes.md の SEARCH ブロックごとに、次を表で確認してください。
| ファイル | ブロック | パック内に全文があるか | 空行・インデント込みで逐語一致か | ファイル内で一意か |
加えて次を確認してください。
- 同じファイルへの SEARCH ブロック同士が重なっていない
- Handles 句のイベント名・コントロール名が <ui_summary> と一致している
- Designer.vb / .resx / Generated / src/generated を変更していない
- 新規ファイルは create で出し、.vbproj を編集していない
- 日本語 Shift_JIS のファイルに、Shift_JIS で表現できない文字を入れていない
問題があれば changes.md を修正してから回答を確定してください。`;

const DESIGN_INVESTIGATE_BODY = `受領した資料(テーブル定義・既存画面のコード・プロトタイプ等)と、手本にする既存コードを読み、分かったことを箇条書きで挙げてください。
既存コードの流儀(SQL の書き方・ファイル構成・命名・エラー処理・監査列)のうち踏襲するものを挙げてください。
資料から読み取れないことは推測せず、次の「確認事項」に回します。`;

const DESIGN_DOC_BODY = `設計書を changes.md で出してください。初回は <template kind="design"> の章立てで docs/design/<画面名または機能名>.md を create、2 回目以降は <docs> にある現在の設計書への replace(章の大半が変わるときは rewrite)です。全文を出し直さず、変わった箇所だけを replace にしてください。
依頼が既存の画面・機能の改修(仕様追加・変更)で、その画面の仕様書が <docs> にない場合は、設計書より先に、改修対象の画面・機能に限った現状の仕様書(as-is)を <template kind="spec"> の章立てで docs/spec/<画面名>.md として同じ changes.md で create してください。パックのコードから読み取れる振る舞いだけを書き、読み取れないことは「未確認」と記します。プロジェクト全体の仕様書を一度に起こさないでください。設計書の変更点(§1-3)は、その仕様書の § を参照して「現状 → 変更後」で書いてください。
設計書の 1 行目の状態行(status / blocking / deferred)を、確認事項(§10)の未回答数と一致するように更新してください。必須の未回答が 0 件になったら status=ready にし、版(見出しの vX.Y)と更新履歴(§12)も進めてください。
コードの変更はこのモードでは出しません。`;

const DESIGN_QUESTIONS_BODY = `ユーザーに確認したいことを番号付きで挙げてください。1 件ごとに種別(必須 = 回答がないと実装に進めない / 後回し = 実装を進めながら確認期限までに回答をもらう)と、後回しなら確認期限(どのバッチの着手前か)を付けてください。
なければ「なし」と書いてください。設計書 §10 の表と同じ内容にしてください。`;

const DESIGN_CONTINUE_BODY = `次のどちらかを 1 行で書いてください。
- 「継続判定: 継続」— 必須の確認事項が残っている。回答を待って設計書を更新します
- 「継続判定: 設計確定」— 必須の確認事項が 0 件。実装は新しいチャットで始めるようユーザーに伝え、次に打つべき操作(slnmix の実行 → 新しいチャットにパックを添付し本文用テキストを貼る)を案内してください
設計確定のときは、仕様書がまだなければ同じ changes.md に初版(<template kind="spec"> の §1〜§4 まで。docs/spec/<設計書と同じファイル名>.md を create)を含め、改修で既に現状の仕様書があれば変更後の振る舞いを「未」の実装状況で追記してください。
このモードでは引継ぎ書を書きません(設計書自体が次のチャットへの引継ぎになります)。`;

function section(number: number, title: string, body: string): string {
	return `### ${number}. ${title}\n${body}`;
}

export const MODE_SECTIONS: Readonly<Record<ProcedureMode, string>> = {
	full: [
		section(1, "調査", INVESTIGATE_BODY),
		section(
			2,
			"方針",
			`${POLICY_BODY_COMMON}
確認したいことがあれば、ここで質問し、変更を出さずに終えてください。`,
		),
		section(3, "変更", CHANGES_BODY),
		section(4, "自己検証", VERIFY_BODY),
	].join("\n\n"),
	plan: [
		section(1, "調査", INVESTIGATE_BODY),
		section(
			2,
			"方針",
			`${POLICY_BODY_COMMON}
このモードでは changes.md は出さず、方針の記述までにとどめてください。`,
		),
		section(
			3,
			"質問",
			`曖昧な点・確認したい点を番号付きで挙げてください。なければ「なし」と書いてください。
このモードでは changes.md を出さないでください。`,
		),
	].join("\n\n"),
	implement: [
		section(
			1,
			"方針の確認",
			`<plan> の内容を 3 行以内で要約し、そのとおりに実装することを述べてください。<plan> と矛盾する事実をパック内に見つけた場合は、実装せずにその点を指摘して終えてください。`,
		),
		section(2, "変更", CHANGES_BODY),
		section(3, "自己検証", VERIFY_BODY),
	].join("\n\n"),
	design: [
		section(1, "調査", DESIGN_INVESTIGATE_BODY),
		section(2, "設計書", DESIGN_DOC_BODY),
		section(3, "確認事項", DESIGN_QUESTIONS_BODY),
		section(4, "継続判定", DESIGN_CONTINUE_BODY),
	].join("\n\n"),
};

/**
 * docs/ 連携が有効なときだけ手順文の末尾に付く 2 節。
 * 文書の役割と更新規則、チャット切り替えの客観的な引き金を AI に与える。
 * トークン残量は AI 自身に測れないため、会話の中で数えられる事象を条件にする。
 */
export const DOCS_SECTIONS = `
## 文書(docs/)の扱い

- <docs> にはプロジェクトの文書があります。kind="design" は設計書(開発の進め方と判断の根拠)、kind="spec" は仕様書(実装済みの振る舞いの正本)、kind="handoff" は引継ぎ書(前のチャットからの申し送り)です
- 引継ぎ書があれば、最初にその「0. 次のチャットで最初にやること」に従ってください
- 設計書と仕様書が食い違うときは仕様書を正としてください。意図的に設計から外れるときは、仕様書の「設計からの意図的な逸脱」に理由を残してください
- 文書の更新も changes.md で出してください(パスは <doc> の path 属性)。小さな更新は replace、章の大半が変わるときは rewrite です。文書では \`===\` や \`---\` の下線による見出し(setext 形式)を使わず、必ず \`#\` 形式にしてください(適用ツールの区切りマーカーと衝突します)
- 設計書の確認事項には 2 種類あります。「必須」は回答がないと実装に進めないもの、「後回し」は実装を進めながら確認期限(バッチ)までに回答をもらえばよいものです。バッチに着手する前に、確認期限がそのバッチ以前の「後回し」で未回答のものがないか設計書 §10 で確認し、あれば先に質問してください
- 各バッチの完了時(ユーザーの動作確認が取れたとき)に、仕様書を実装した振る舞いに合わせて更新してください(該当機能の実装状況・処理フロー・逸脱・更新履歴)
- <template> は文書のひな型です。文書を新しく作るときはこの章立てに従い、該当しない章は消さず「該当なし」と書いてください。ひな型内の HTML コメント(記入指示)は完成した文書に残さないでください

## チャットの継続と引継ぎ

- すべての回答の末尾に「継続判定: 継続」「継続判定: 引継ぎ推奨(理由)」「継続判定: 引継ぎ」のいずれかを 1 行付けてください(design モードでは「設計確定」が「引継ぎ」に相当し、引継ぎ書は書きません)
- 「引継ぎ」(同意を待たない): 実装バッチが 1 つ完了し、ユーザーがビルドと動作確認の成功を伝えたら、その回答で次を行ってください
  1. 仕様書を実装した振る舞いに合わせて更新し、引継ぎ書(<docs> の kind="handoff" の path。なければ docs/HANDOFF.md)を rewrite(初回は create)する changes.md を出す(コードの変更は含めない)
  2. 「適用ツールで適用 → slnmix を再実行 → 新しいチャットにパックを添付し本文用テキストを貼る」と案内する
  ユーザーが「このチャットで続ける」と言ったときだけ続行してください
- 「引継ぎ推奨」(同意を待つ): 次のいずれかに該当したら理由を添えて勧め、ユーザーの返事を待ってください
  1. このチャットで changes.md を 3 回以上出した(ビルドエラー・実行エラーの修正を含む。同じ問題に 2 回以上失敗しているなら、失敗した試行が残るこのチャットより、修正途中のコードを含む最新のパックで始め直す方が早い)
  2. 適用ツールの失敗レポートを 2 回受け取った(手元のコードとパックがずれている兆候)
  3. ユーザーがパックを添付し直した
- バッチの途中で引き継ぐときは、引継ぎ書の「到達点」を「着手中」にし、「未解決のエラーと試したこと」に、エラーの内容・試して効かなかった修正・まだ試していない案を書いてください(次のチャットが同じ試行を繰り返さないためです)
- 引継ぎ書はコードの変更と同じ changes.md に混ぜないでください(適用後の状態を書くためです)。章立ては <template kind="handoff"> に従ってください
- 引継ぎ書には規約・手順のコピーやコードの一覧を書かないでください。次のチャットにはツールが最新のパックと指示を付けます
`;

export interface RenderProcedureOptions {
	/**
	 * docs/ 連携が有効か({{DOCS_SECTIONS}} に文書の扱いと引継ぎの節を入れる)。
	 * "placeholder" はプレースホルダを残す(--print-procedure 用。procedure.md に
	 * 残しておけば実行時に設定に応じて置換される)
	 */
	docs?: boolean | "placeholder";
}

/**
 * テンプレートの {{MODE}} / {{MODE_SECTIONS}} / {{DOCS_SECTIONS}} をモードに
 * 応じて置換する。プレースホルダがなければそのまま返す(procedure.md による
 * 上書きで使う)。docs が無効なら {{DOCS_SECTIONS}} は空文字になる。
 */
export function renderProcedureTemplate(
	template: string,
	mode: ProcedureMode,
	options: RenderProcedureOptions = {},
): string {
	const rendered = template
		.replaceAll("{{MODE_SECTIONS}}", MODE_SECTIONS[mode])
		.replaceAll("{{MODE}}", mode);
	if (options.docs === "placeholder") {
		return rendered;
	}
	return rendered.replaceAll("{{DOCS_SECTIONS}}", options.docs === true ? DOCS_SECTIONS : "");
}

/** 内蔵既定文をモードに応じて描画する */
export function renderBuiltinProcedure(
	mode: ProcedureMode,
	options: RenderProcedureOptions = {},
): string {
	return renderProcedureTemplate(PROCEDURE_TEMPLATE, mode, options);
}
