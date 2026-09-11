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
 */

export const PROCEDURE_VERSION = 1;

export const PROCEDURE_MODES = ["full", "plan", "implement"] as const;
export type ProcedureMode = (typeof PROCEDURE_MODES)[number];

export const DEFAULT_PROCEDURE_MODE: ProcedureMode = "full";

export function isProcedureMode(value: string): value is ProcedureMode {
	return (PROCEDURE_MODES as readonly string[]).includes(value);
}

/** {{MODE}} と {{MODE_SECTIONS}} を含むテンプレート(procedure.md でも同じプレースホルダが使える) */
export const PROCEDURE_TEMPLATE = `<!-- slnmix procedure v${PROCEDURE_VERSION} (mode: {{MODE}}) -->
# 作業手順

これは、このコンテキストを添付したユーザー本人からの恒常的な指示です。
このパックに含まれるコードへの変更を提案するときは、必ず以下の手順で回答してください。
出力形式(changes.md の書き方)は末尾の <instruction> の規約に従います。本手順はその前段の「考え方」です。

## パックの読み方

- <file> は現在のファイル内容そのものです。記憶にある一般的な VB.NET / React のコードではなく、ここにある内容を正としてください
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
`;

// ---- 「回答の構成」の部品。モードごとに番号を振って組み立てる ----

const INVESTIGATE_BODY = `読んだファイルと、関係するシンボル(クラス・メソッド・コントロール名)を箇条書きで挙げてください。
変更対象の処理がどこから呼ばれ、何を呼ぶかを 1〜3 行で述べてください。`;

const POLICY_BODY_COMMON = `何をどう変えるかを述べてください。検討して採らなかった案があれば理由とともに 1 行で。
リスク(既存動作への影響、未確認の前提)を挙げてください。`;

const CHANGES_BODY = `末尾の <instruction> の規約どおり changes.md を出してください。`;

const VERIFY_BODY = `changes.md の SEARCH ブロックごとに、次を表で確認してください。
| ファイル | ブロック | パック内に全文があるか | 空行・インデント込みで逐語一致か | ファイル内で一意か |
加えて次を確認してください。
- 同じファイルへの SEARCH ブロック同士が重なっていない
- Handles 句のイベント名・コントロール名が <ui_summary> と一致している
- Designer.vb / .resx / Generated / src/generated を変更していない
- 新規ファイルは create で出し、.vbproj を編集していない
- 日本語 Shift_JIS のファイルに、Shift_JIS で表現できない文字を入れていない
問題があれば changes.md を修正してから回答を確定してください。`;

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
};

/**
 * テンプレートの {{MODE}} / {{MODE_SECTIONS}} をモードに応じて置換する。
 * プレースホルダがなければそのまま返す(procedure.md による上書きで使う)。
 */
export function renderProcedureTemplate(
	template: string,
	mode: ProcedureMode,
): string {
	return template
		.replaceAll("{{MODE_SECTIONS}}", MODE_SECTIONS[mode])
		.replaceAll("{{MODE}}", mode);
}

/** 内蔵既定文をモードに応じて描画する */
export function renderBuiltinProcedure(mode: ProcedureMode): string {
	return renderProcedureTemplate(PROCEDURE_TEMPLATE, mode);
}
