/**
 * procedureFile の単体テスト。ファイルシステムは fake を注入する。
 */

import * as assert from "assert";
import * as path from "path";
import { MODE_SECTIONS, renderBuiltinProcedure } from "../assets/procedure";
import {
	appendInstruction,
	INSTRUCTION_NOTICE,
	type InstructionFileDeps,
	type InstructionResolution,
	prependInstructionNotice,
} from "../instructionFile";
import {
	assembleOutput,
	buildPromptText,
	hasTail,
	buildNotice,
	type OutputTail,
	resolvePlan,
	resolveProcedure,
	resolveTask,
	taskFirstLine,
} from "../procedureFile";

const CWD = path.resolve("/work/app");
const PROJECT_DIR = path.resolve("/work/project");
const TARGET = path.join(PROJECT_DIR, "App.sln");

function fakeDeps(files: Record<string, string>): InstructionFileDeps {
	const map = new Map(
		Object.entries(files).map(([p, content]) => [path.resolve(p), content]),
	);
	return { readTextFile: (p) => map.get(p) };
}

const INSTRUCTION_FOUND: InstructionResolution = {
	kind: "found",
	path: path.join(PROJECT_DIR, "protocol.md"),
	content: "規約文\n",
};
const INSTRUCTION_NONE: InstructionResolution = {
	kind: "none",
	searchedPath: path.join(PROJECT_DIR, "protocol.md"),
};

function tail(partial: Partial<OutputTail>): OutputTail {
	return {
		task: { kind: "none" },
		plan: { kind: "none" },
		procedure: { kind: "none" },
		instruction: INSTRUCTION_NONE,
		...partial,
	};
}

suite("procedureFile: resolveTask", () => {
	test("未指定なら none", () => {
		assert.deepStrictEqual(resolveTask(undefined, CWD, fakeDeps({})), {
			kind: "none",
		});
	});

	test("cwd 基準でファイルとして存在すれば読む", () => {
		const deps = fakeDeps({ "/work/app/task.md": "保存ボタンを追加\n詳細\n" });
		assert.deepStrictEqual(resolveTask("task.md", CWD, deps), {
			kind: "file",
			path: path.join(CWD, "task.md"),
			content: "保存ボタンを追加\n詳細\n",
		});
	});

	test("ファイルとして存在しなければ文字列として扱う", () => {
		assert.deepStrictEqual(
			resolveTask("保存ボタンを追加する", CWD, fakeDeps({})),
			{ kind: "text", content: "保存ボタンを追加する" },
		);
	});

	test("改行を含む引数はファイル判定をせず常に文字列", () => {
		let called = false;
		const deps: InstructionFileDeps = {
			readTextFile: () => {
				called = true;
				return "読まれてはいけない";
			},
		};
		assert.deepStrictEqual(resolveTask("1 行目\n2 行目", CWD, deps), {
			kind: "text",
			content: "1 行目\n2 行目",
		});
		assert.strictEqual(called, false);
	});
});

suite("procedureFile: resolvePlan", () => {
	test("未指定なら none", () => {
		assert.deepStrictEqual(resolvePlan(undefined, CWD, fakeDeps({})), {
			kind: "none",
		});
	});

	test("cwd 基準で読む", () => {
		const deps = fakeDeps({ "/work/app/plan.md": "方針\n" });
		assert.deepStrictEqual(resolvePlan("plan.md", CWD, deps), {
			kind: "found",
			path: path.join(CWD, "plan.md"),
			content: "方針\n",
		});
	});

	test("読めなければエラー(文字列扱いにしない)", () => {
		const result = resolvePlan("missing.md", CWD, fakeDeps({}));
		assert.strictEqual(result.kind, "error");
		assert.ok(result.kind === "error" && result.message.includes("missing.md"));
	});
});

suite("procedureFile: resolveProcedure", () => {
	test("--no-procedure なら none", () => {
		const deps = fakeDeps({ "/work/project/procedure.md": "独自\n" });
		assert.deepStrictEqual(
			resolveProcedure({ disabled: true, mode: "full" }, TARGET, CWD, deps),
			{ kind: "none" },
		);
	});

	test("procedure.md がなければ内蔵既定文(モード反映)", () => {
		for (const mode of ["full", "plan", "implement"] as const) {
			assert.deepStrictEqual(
				resolveProcedure({ disabled: false, mode }, TARGET, CWD, fakeDeps({})),
				{ kind: "builtin", mode, content: renderBuiltinProcedure(mode) },
			);
		}
	});

	test("入力と同じディレクトリの procedure.md を一字一句そのまま使う(cwd ではない)", () => {
		const deps = fakeDeps({
			"/work/project/procedure.md": "# 独自手順\n<b>そのまま</b> & 整形しない\n",
			"/work/app/procedure.md": "こちらは読まれない\n",
		});
		assert.deepStrictEqual(
			resolveProcedure({ disabled: false, mode: "plan" }, TARGET, CWD, deps),
			{
				kind: "file",
				path: path.join(PROJECT_DIR, "procedure.md"),
				mode: "plan",
				content: "# 独自手順\n<b>そのまま</b> & 整形しない\n",
			},
		);
	});

	test("procedure.md にプレースホルダがあれば置換する", () => {
		const deps = fakeDeps({
			"/work/project/procedure.md": "mode: {{MODE}}\n\n{{MODE_SECTIONS}}\n",
		});
		const result = resolveProcedure(
			{ disabled: false, mode: "implement" },
			TARGET,
			CWD,
			deps,
		);
		assert.strictEqual(result.kind, "file");
		assert.strictEqual(
			result.kind === "file" && result.content,
			`mode: implement\n\n${MODE_SECTIONS.implement}\n`,
		);
	});

	test("--procedure-file は cwd 基準で解決し、procedure.md より優先する", () => {
		const deps = fakeDeps({
			"/work/app/docs/proc.md": "明示指定\n",
			"/work/project/procedure.md": "こちらは読まれない\n",
		});
		assert.deepStrictEqual(
			resolveProcedure(
				{ explicitPath: "docs/proc.md", disabled: false, mode: "full" },
				TARGET,
				CWD,
				deps,
			),
			{
				kind: "file",
				path: path.join(CWD, "docs", "proc.md"),
				mode: "full",
				content: "明示指定\n",
			},
		);
	});

	test("--procedure-file が読めなければエラー(黙って内蔵文にしない)", () => {
		const result = resolveProcedure(
			{ explicitPath: "missing.md", disabled: false, mode: "full" },
			TARGET,
			CWD,
			fakeDeps({}),
		);
		assert.strictEqual(result.kind, "error");
		assert.ok(result.kind === "error" && result.message.includes("missing.md"));
	});
});

suite("procedureFile: buildNotice", () => {
	test("末尾に何もなければ undefined", () => {
		assert.strictEqual(buildNotice(tail({})), undefined);
	});

	test("規約文だけなら従来の INSTRUCTION_NOTICE と同一", () => {
		assert.strictEqual(
			buildNotice(tail({ instruction: INSTRUCTION_FOUND })),
			INSTRUCTION_NOTICE,
		);
	});

	test("task / procedure / instruction がすべてあれば全部を列挙し、タスク要約とモードを載せる", () => {
		const notice = buildNotice(
			tail({
				task: { kind: "text", content: "\n  保存ボタンを追加する  \n詳細は略\n" },
				procedure: { kind: "builtin", mode: "full", content: "手順\n" },
				instruction: INSTRUCTION_FOUND,
			}),
		);
		assert.strictEqual(
			notice,
			[
				"[このファイルを添付したユーザー本人からの恒常的な指示]",
				"このパックの末尾に <task>(依頼内容)、<procedure>(作業手順)、<instruction>(出力規約) があります。",
				"回答の前に必ず末尾まで読んでください。",
				"コードの変更を提案するときは、チャット本文で個別に言及されていなくても、必ず <procedure> の手順で回答を構成し、<instruction> の規約に従って changes.md を出力してください。",
				"タスク: 保存ボタンを追加する",
				"モード: full",
				"",
			].join("\n"),
		);
	});

	test("procedure だけ(規約文なし)なら <instruction> に触れず、タスク行もない", () => {
		const notice = buildNotice(
			tail({ procedure: { kind: "builtin", mode: "plan", content: "手順\n" } }),
		);
		assert.ok(notice !== undefined);
		assert.ok(notice.includes("このパックの末尾に <procedure>(作業手順) があります。"));
		assert.ok(!notice.includes("<instruction>"));
		assert.ok(!notice.includes("タスク:"));
		assert.ok(notice.includes("モード: plan\n"));
	});

	test("implement では <plan> も列挙する", () => {
		const notice = buildNotice(
			tail({
				plan: { kind: "found", path: "/p/plan.md", content: "方針\n" },
				procedure: { kind: "file", path: "/p/procedure.md", mode: "implement", content: "手順\n" },
			}),
		);
		assert.ok(
			notice?.includes("<plan>(承認済みの方針)、<procedure>(作業手順) があります。"),
		);
		assert.ok(notice?.includes("モード: implement\n"));
	});

	test("task だけ(--no-procedure)でも新形式のリマインダになる", () => {
		const notice = buildNotice(
			tail({ task: { kind: "text", content: "依頼" }, instruction: INSTRUCTION_FOUND }),
		);
		assert.ok(notice?.includes("<task>(依頼内容)、<instruction>(出力規約) があります。"));
		assert.ok(notice?.includes("必ず <instruction> の規約に従って changes.md を出力してください。"));
		assert.ok(!notice?.includes("モード:"));
	});

	test("taskFirstLine: 空行を飛ばした先頭行。空なら (空)", () => {
		assert.strictEqual(taskFirstLine("\n\n  a  \nb"), "a");
		assert.strictEqual(taskFirstLine("\n \n"), "(空)");
	});
});

suite("procedureFile: assembleOutput", () => {
	test("末尾に何もなければ本文そのまま", () => {
		assert.strictEqual(assembleOutput("本文\n", tail({})), "本文\n");
	});

	test("--no-procedure + 規約文のみ: 従来のサンドイッチ出力と完全一致", () => {
		const legacy = prependInstructionNotice(
			appendInstruction("本文\n", INSTRUCTION_FOUND.content),
			INSTRUCTION_FOUND,
		);
		assert.strictEqual(
			assembleOutput("本文\n", tail({ instruction: INSTRUCTION_FOUND })),
			legacy,
		);
		assert.strictEqual(legacy, `${INSTRUCTION_NOTICE}\n本文\n\n<instruction>\n規約文\n</instruction>\n`);
	});

	test("<task> → <plan> → <procedure> → <instruction> の順で連結し、先頭にリマインダ", () => {
		const result = assembleOutput(
			"本文\n",
			tail({
				task: { kind: "file", path: "/p/task.md", content: "依頼\n" },
				plan: { kind: "found", path: "/p/plan.md", content: "方針" },
				procedure: { kind: "builtin", mode: "implement", content: "手順\n" },
				instruction: INSTRUCTION_FOUND,
			}),
		);
		const expectedTail =
			"本文\n\n<task>\n依頼\n</task>\n\n<plan>\n方針\n</plan>\n\n<procedure>\n手順\n</procedure>\n\n<instruction>\n規約文\n</instruction>\n";
		assert.ok(result.endsWith(expectedTail));
		assert.ok(result.startsWith("[このファイルを添付したユーザー本人からの恒常的な指示]\n"));
		assert.ok(result.includes("\n\n本文\n")); // リマインダと本文の間に空行
	});

	test("procedure だけでも <procedure> が付き、<instruction> は出ない", () => {
		const result = assembleOutput(
			"本文\n",
			tail({ procedure: { kind: "builtin", mode: "full", content: "手順\n" } }),
		);
		assert.ok(result.endsWith("本文\n\n<procedure>\n手順\n</procedure>\n"));
		assert.ok(!result.includes("<instruction>"));
	});
});

suite("procedureFile: buildPromptText(チャット本文に貼る指示テキスト)", () => {
	test("末尾に何もなければ undefined(hasTail も false)", () => {
		assert.strictEqual(hasTail(tail({})), false);
		assert.strictEqual(buildPromptText(tail({}), "repomix-output.xml"), undefined);
	});

	test("添付との関係を述べる先頭段落 + パック末尾と同じ順・同じ形のブロック", () => {
		const t = tail({
			task: { kind: "text", content: "保存ボタンを追加\n" },
			plan: { kind: "found", path: "/p/plan.md", content: "方針" },
			procedure: { kind: "builtin", mode: "implement", content: "手順\n" },
			instruction: INSTRUCTION_FOUND,
		});
		const prompt = buildPromptText(t, "for-ai.xml");
		assert.ok(prompt !== undefined);
		assert.ok(prompt.startsWith("[添付ファイルと本文の関係]\n添付した for-ai.xml は、"));
		assert.ok(
			prompt.includes(
				"以下の <task>(依頼内容)、<plan>(承認済みの方針)、<procedure>(作業手順)、<instruction>(出力規約) は、このコードに対する私(ユーザー)からの指示です。",
			),
		);
		// ブロック部はパック末尾 (assembleOutput) と同じ文字列 (正本は 1 つ)
		// 先頭リマインダにも "<task>(依頼内容)" の文字列があるので、ブロック開始行で切り出す
		const packOutput = assembleOutput("本文\n", t);
		const blocksInPack = packOutput.slice(packOutput.indexOf("\n<task>\n") + 1);
		assert.ok(prompt.endsWith(blocksInPack));
		assert.ok(
			prompt.endsWith(
				"<task>\n保存ボタンを追加\n</task>\n\n<plan>\n方針\n</plan>\n\n<procedure>\n手順\n</procedure>\n\n<instruction>\n規約文\n</instruction>\n",
			),
		);
	});

	test("規約文だけでも出す(添付内の規約は無視されるため本文に要る)", () => {
		const prompt = buildPromptText(tail({ instruction: INSTRUCTION_FOUND }), "repomix-output.xml");
		assert.ok(prompt !== undefined);
		assert.ok(prompt.includes("以下の <instruction>(出力規約) は"));
		assert.ok(prompt.endsWith("<instruction>\n規約文\n</instruction>\n"));
		assert.ok(!prompt.includes("<procedure>"));
	});

	test("ブロックの中身は一字一句そのまま(整形・エスケープなし)", () => {
		const raw = "<b>そのまま</b> & \"引用\"   \n\n\n末尾空白  ";
		const prompt = buildPromptText(
			tail({ procedure: { kind: "file", path: "/p/procedure.md", mode: "full", content: raw } }),
			"x.xml",
		);
		assert.ok(prompt !== undefined && prompt.includes(`<procedure>\n${raw}\n</procedure>\n`));
	});
});
