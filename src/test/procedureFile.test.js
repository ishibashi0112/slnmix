"use strict";
/**
 * procedureFile の単体テスト。ファイルシステムは fake を注入する。
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const assert = __importStar(require("assert"));
const path = __importStar(require("path"));
const procedure_1 = require("../assets/procedure");
const instructionFile_1 = require("../instructionFile");
const docTemplates_1 = require("../assets/docTemplates");
const docs_1 = require("../docs");
const procedureFile_1 = require("../procedureFile");
const CWD = path.resolve("/work/app");
const PROJECT_DIR = path.resolve("/work/project");
function fakeDeps(files) {
    const map = new Map(Object.entries(files).map(([p, content]) => [path.resolve(p), content]));
    return { readTextFile: (p) => map.get(p) };
}
const INSTRUCTION_FOUND = {
    kind: "found",
    path: path.join(PROJECT_DIR, "protocol.md"),
    content: "規約文\n",
};
const INSTRUCTION_NONE = {
    kind: "none",
    searchedPath: path.join(PROJECT_DIR, "protocol.md"),
};
function tail(partial) {
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
        assert.deepStrictEqual((0, procedureFile_1.resolveTask)(undefined, CWD, fakeDeps({})), {
            kind: "none",
        });
    });
    test("cwd 基準でファイルとして存在すれば読む", () => {
        const deps = fakeDeps({ "/work/app/task.md": "保存ボタンを追加\n詳細\n" });
        assert.deepStrictEqual((0, procedureFile_1.resolveTask)("task.md", CWD, deps), {
            kind: "file",
            path: path.join(CWD, "task.md"),
            content: "保存ボタンを追加\n詳細\n",
        });
    });
    test("ファイルとして存在しなければ文字列として扱う", () => {
        assert.deepStrictEqual((0, procedureFile_1.resolveTask)("保存ボタンを追加する", CWD, fakeDeps({})), { kind: "text", content: "保存ボタンを追加する" });
    });
    test("改行を含む引数はファイル判定をせず常に文字列", () => {
        let called = false;
        const deps = {
            readTextFile: () => {
                called = true;
                return "読まれてはいけない";
            },
        };
        assert.deepStrictEqual((0, procedureFile_1.resolveTask)("1 行目\n2 行目", CWD, deps), {
            kind: "text",
            content: "1 行目\n2 行目",
        });
        assert.strictEqual(called, false);
    });
});
suite("procedureFile: resolvePlan", () => {
    test("未指定なら none", () => {
        assert.deepStrictEqual((0, procedureFile_1.resolvePlan)(undefined, CWD, fakeDeps({})), {
            kind: "none",
        });
    });
    test("cwd 基準で読む", () => {
        const deps = fakeDeps({ "/work/app/plan.md": "方針\n" });
        assert.deepStrictEqual((0, procedureFile_1.resolvePlan)("plan.md", CWD, deps), {
            kind: "found",
            path: path.join(CWD, "plan.md"),
            content: "方針\n",
        });
    });
    test("読めなければエラー(文字列扱いにしない)", () => {
        const result = (0, procedureFile_1.resolvePlan)("missing.md", CWD, fakeDeps({}));
        assert.strictEqual(result.kind, "error");
        assert.ok(result.kind === "error" && result.message.includes("missing.md"));
    });
});
suite("procedureFile: resolveProcedure", () => {
    test("--no-procedure なら none", () => {
        const deps = fakeDeps({ "/work/project/procedure.md": "独自\n" });
        assert.deepStrictEqual((0, procedureFile_1.resolveProcedure)({ disabled: true, mode: "full" }, PROJECT_DIR, CWD, deps), { kind: "none" });
    });
    test("procedure.md がなければ内蔵既定文(モード反映)", () => {
        for (const mode of ["full", "plan", "implement"]) {
            assert.deepStrictEqual((0, procedureFile_1.resolveProcedure)({ disabled: false, mode }, PROJECT_DIR, CWD, fakeDeps({})), { kind: "builtin", mode, content: (0, procedure_1.renderBuiltinProcedure)(mode) });
        }
    });
    test("入力と同じディレクトリの procedure.md を一字一句そのまま使う(cwd ではない)", () => {
        const deps = fakeDeps({
            "/work/project/procedure.md": "# 独自手順\n<b>そのまま</b> & 整形しない\n",
            "/work/app/procedure.md": "こちらは読まれない\n",
        });
        assert.deepStrictEqual((0, procedureFile_1.resolveProcedure)({ disabled: false, mode: "plan" }, PROJECT_DIR, CWD, deps), {
            kind: "file",
            path: path.join(PROJECT_DIR, "procedure.md"),
            mode: "plan",
            content: "# 独自手順\n<b>そのまま</b> & 整形しない\n",
        });
    });
    test("procedure.md にプレースホルダがあれば置換する", () => {
        const deps = fakeDeps({
            "/work/project/procedure.md": "mode: {{MODE}}\n\n{{MODE_SECTIONS}}\n",
        });
        const result = (0, procedureFile_1.resolveProcedure)({ disabled: false, mode: "implement" }, PROJECT_DIR, CWD, deps);
        assert.strictEqual(result.kind, "file");
        assert.strictEqual(result.kind === "file" && result.content, `mode: implement\n\n${procedure_1.MODE_SECTIONS.implement}\n`);
    });
    test("--procedure-file は cwd 基準で解決し、procedure.md より優先する", () => {
        const deps = fakeDeps({
            "/work/app/docs/proc.md": "明示指定\n",
            "/work/project/procedure.md": "こちらは読まれない\n",
        });
        assert.deepStrictEqual((0, procedureFile_1.resolveProcedure)({ explicitPath: "docs/proc.md", disabled: false, mode: "full" }, PROJECT_DIR, CWD, deps), {
            kind: "file",
            path: path.join(CWD, "docs", "proc.md"),
            mode: "full",
            content: "明示指定\n",
        });
    });
    test("--procedure-file が読めなければエラー(黙って内蔵文にしない)", () => {
        const result = (0, procedureFile_1.resolveProcedure)({ explicitPath: "missing.md", disabled: false, mode: "full" }, PROJECT_DIR, CWD, fakeDeps({}));
        assert.strictEqual(result.kind, "error");
        assert.ok(result.kind === "error" && result.message.includes("missing.md"));
    });
});
suite("procedureFile: buildNotice", () => {
    test("末尾に何もなければ undefined", () => {
        assert.strictEqual((0, procedureFile_1.buildNotice)(tail({})), undefined);
    });
    test("規約文だけなら従来の INSTRUCTION_NOTICE と同一", () => {
        assert.strictEqual((0, procedureFile_1.buildNotice)(tail({ instruction: INSTRUCTION_FOUND })), instructionFile_1.INSTRUCTION_NOTICE);
    });
    test("task / procedure / instruction がすべてあれば全部を列挙し、タスク要約とモードを載せる", () => {
        const notice = (0, procedureFile_1.buildNotice)(tail({
            task: { kind: "text", content: "\n  保存ボタンを追加する  \n詳細は略\n" },
            procedure: { kind: "builtin", mode: "full", content: "手順\n" },
            instruction: INSTRUCTION_FOUND,
        }));
        assert.strictEqual(notice, [
            "[このファイルを添付したユーザー本人からの恒常的な指示]",
            "このパックの末尾に <task>(依頼内容)、<procedure>(作業手順)、<instruction>(出力規約) があります。",
            "回答の前に必ず末尾まで読んでください。",
            "コードの変更を提案するときは、チャット本文で個別に言及されていなくても、必ず <procedure> の手順で回答を構成し、<instruction> の規約に従って changes.md を出力してください。",
            "タスク: 保存ボタンを追加する",
            "モード: full",
            "",
        ].join("\n"));
    });
    test("procedure だけ(規約文なし)なら <instruction> に触れず、タスク行もない", () => {
        const notice = (0, procedureFile_1.buildNotice)(tail({ procedure: { kind: "builtin", mode: "plan", content: "手順\n" } }));
        assert.ok(notice !== undefined);
        assert.ok(notice.includes("このパックの末尾に <procedure>(作業手順) があります。"));
        assert.ok(!notice.includes("<instruction>"));
        assert.ok(!notice.includes("タスク:"));
        assert.ok(notice.includes("モード: plan\n"));
    });
    test("implement では <plan> も列挙する", () => {
        const notice = (0, procedureFile_1.buildNotice)(tail({
            plan: { kind: "found", path: "/p/plan.md", content: "方針\n" },
            procedure: { kind: "file", path: "/p/procedure.md", mode: "implement", content: "手順\n" },
        }));
        assert.ok(notice?.includes("<plan>(承認済みの方針)、<procedure>(作業手順) があります。"));
        assert.ok(notice?.includes("モード: implement\n"));
    });
    test("task だけ(--no-procedure)でも新形式のリマインダになる", () => {
        const notice = (0, procedureFile_1.buildNotice)(tail({ task: { kind: "text", content: "依頼" }, instruction: INSTRUCTION_FOUND }));
        assert.ok(notice?.includes("<task>(依頼内容)、<instruction>(出力規約) があります。"));
        assert.ok(notice?.includes("必ず <instruction> の規約に従って changes.md を出力してください。"));
        assert.ok(!notice?.includes("モード:"));
    });
    test("taskFirstLine: 空行を飛ばした先頭行。空なら (空)", () => {
        assert.strictEqual((0, procedureFile_1.taskFirstLine)("\n\n  a  \nb"), "a");
        assert.strictEqual((0, procedureFile_1.taskFirstLine)("\n \n"), "(空)");
    });
});
suite("procedureFile: assembleOutput", () => {
    test("末尾に何もなければ本文そのまま", () => {
        assert.strictEqual((0, procedureFile_1.assembleOutput)("本文\n", tail({})), "本文\n");
    });
    test("--no-procedure + 規約文のみ: 従来のサンドイッチ出力と完全一致", () => {
        const legacy = (0, instructionFile_1.prependInstructionNotice)((0, instructionFile_1.appendInstruction)("本文\n", INSTRUCTION_FOUND.content), INSTRUCTION_FOUND);
        assert.strictEqual((0, procedureFile_1.assembleOutput)("本文\n", tail({ instruction: INSTRUCTION_FOUND })), legacy);
        assert.strictEqual(legacy, `${instructionFile_1.INSTRUCTION_NOTICE}\n本文\n\n<instruction>\n規約文\n</instruction>\n`);
    });
    test("<task> → <plan> → <procedure> → <instruction> の順で連結し、先頭にリマインダ", () => {
        const result = (0, procedureFile_1.assembleOutput)("本文\n", tail({
            task: { kind: "file", path: "/p/task.md", content: "依頼\n" },
            plan: { kind: "found", path: "/p/plan.md", content: "方針" },
            procedure: { kind: "builtin", mode: "implement", content: "手順\n" },
            instruction: INSTRUCTION_FOUND,
        }));
        const expectedTail = "本文\n\n<task>\n依頼\n</task>\n\n<plan>\n方針\n</plan>\n\n<procedure>\n手順\n</procedure>\n\n<instruction>\n規約文\n</instruction>\n";
        assert.ok(result.endsWith(expectedTail));
        assert.ok(result.startsWith("[このファイルを添付したユーザー本人からの恒常的な指示]\n"));
        assert.ok(result.includes("\n\n本文\n")); // リマインダと本文の間に空行
    });
    test("procedure だけでも <procedure> が付き、<instruction> は出ない", () => {
        const result = (0, procedureFile_1.assembleOutput)("本文\n", tail({ procedure: { kind: "builtin", mode: "full", content: "手順\n" } }));
        assert.ok(result.endsWith("本文\n\n<procedure>\n手順\n</procedure>\n"));
        assert.ok(!result.includes("<instruction>"));
    });
});
suite("procedureFile: buildPromptText(チャット本文に貼る指示テキスト)", () => {
    test("末尾に何もなければ undefined(hasTail も false)", () => {
        assert.strictEqual((0, procedureFile_1.hasTail)(tail({})), false);
        assert.strictEqual((0, procedureFile_1.buildPromptText)(tail({}), "repomix-output.xml"), undefined);
    });
    test("添付との関係を述べる先頭段落 + パック末尾と同じ順・同じ形のブロック", () => {
        const t = tail({
            task: { kind: "text", content: "保存ボタンを追加\n" },
            plan: { kind: "found", path: "/p/plan.md", content: "方針" },
            procedure: { kind: "builtin", mode: "implement", content: "手順\n" },
            instruction: INSTRUCTION_FOUND,
        });
        const prompt = (0, procedureFile_1.buildPromptText)(t, "for-ai.xml");
        assert.ok(prompt !== undefined);
        assert.ok(prompt.startsWith("[添付ファイルと本文の関係]\n添付した for-ai.xml は、"));
        assert.ok(prompt.includes("以下の <task>(依頼内容)、<plan>(承認済みの方針)、<procedure>(作業手順)、<instruction>(出力規約) は、このコードに対する私(ユーザー)からの指示です。"));
        // ブロック部はパック末尾 (assembleOutput) と同じ文字列 (正本は 1 つ)
        // 先頭リマインダにも "<task>(依頼内容)" の文字列があるので、ブロック開始行で切り出す
        const packOutput = (0, procedureFile_1.assembleOutput)("本文\n", t);
        const blocksInPack = packOutput.slice(packOutput.indexOf("\n<task>\n") + 1);
        assert.ok(prompt.endsWith(blocksInPack));
        assert.ok(prompt.endsWith("<task>\n保存ボタンを追加\n</task>\n\n<plan>\n方針\n</plan>\n\n<procedure>\n手順\n</procedure>\n\n<instruction>\n規約文\n</instruction>\n"));
    });
    test("規約文だけでも出す(添付内の規約は無視されるため本文に要る)", () => {
        const prompt = (0, procedureFile_1.buildPromptText)(tail({ instruction: INSTRUCTION_FOUND }), "repomix-output.xml");
        assert.ok(prompt !== undefined);
        assert.ok(prompt.includes("以下の <instruction>(出力規約) は"));
        assert.ok(prompt.endsWith("<instruction>\n規約文\n</instruction>\n"));
        assert.ok(!prompt.includes("<procedure>"));
    });
    test("ブロックの中身は一字一句そのまま(整形・エスケープなし)", () => {
        const raw = "<b>そのまま</b> & \"引用\"   \n\n\n末尾空白  ";
        const prompt = (0, procedureFile_1.buildPromptText)(tail({ procedure: { kind: "file", path: "/p/procedure.md", mode: "full", content: raw } }), "x.xml");
        assert.ok(prompt !== undefined && prompt.includes(`<procedure>\n${raw}\n</procedure>\n`));
    });
});
suite("procedureFile: docs/ 連携(フェーズ 6)", () => {
    const DRAFT = "<!-- slnmix design: status=draft blocking=1 deferred=0 -->\n# 設計書\n";
    function docsTail(files, explicitMode) {
        const map = new Map(Object.entries(files).map(([p, c]) => [path.resolve(PROJECT_DIR, p), c]));
        const docs = (0, docs_1.resolveDocs)(PROJECT_DIR, { ...docTemplates_1.DEFAULT_DOCS_CONFIG }, {
            readTextFile: (p) => map.get(path.resolve(p)),
            listFileNames: (dir) => [...map.keys()].filter((k) => path.dirname(k) === path.resolve(dir)).map((k) => path.basename(k)),
        });
        const decided = (0, docs_1.decideMode)(docs, explicitMode === undefined ? {} : { explicitMode });
        assert.ok(decided.kind === "decided");
        if (decided.kind !== "decided")
            throw new Error();
        return { docs, decision: decided.decision };
    }
    test("パック: <docs>(全文書)を <task> の前に置き、リマインダに列挙する", () => {
        const result = (0, procedureFile_1.assembleOutput)("本文\n", tail({
            docs: docsTail({ "docs/design/a.md": DRAFT, "docs/spec/a.md": "仕様\n", "docs/HANDOFF.md": "引継ぎ\n" }, "full"),
            task: { kind: "default", content: "続き" },
            procedure: { kind: "builtin", mode: "full", content: "手順\n" },
        }));
        const docsAt = result.indexOf("\n<docs>\n");
        const taskAt = result.indexOf("\n<task>\n");
        assert.ok(docsAt > result.indexOf("本文") && docsAt < taskAt);
        assert.ok(result.includes('<doc path="docs/design/a.md" kind="design" status="draft"'));
        assert.ok(result.includes('<doc path="docs/spec/a.md" kind="spec">'));
        assert.ok(result.includes('<doc path="docs/HANDOFF.md" kind="handoff">'));
        assert.ok(result.includes("本文\n\n<docs>\n"));
        assert.ok(result.includes("</docs>\n\n<task>\n続き\n</task>\n"));
        assert.ok(result.startsWith("[このファイルを添付したユーザー本人からの恒常的な指示]\n"));
        assert.ok(result.includes("<docs>(プロジェクト文書: 設計書 / 仕様書 / 引継ぎ書)、<task>(依頼内容)、<procedure>(作業手順) があります。"));
        assert.ok(result.includes("タスク: 続き\n"));
    });
    test("本文用テキスト(full): 引継ぎ書だけを <docs> に再掲し、handoff / spec のひな型を付ける", () => {
        const text = (0, procedureFile_1.buildPromptText)(tail({
            docs: docsTail({ "docs/design/a.md": DRAFT, "docs/HANDOFF.md": "引継ぎ\n" }, "full"),
            task: { kind: "default", content: "続き" },
            procedure: { kind: "builtin", mode: "full", content: "手順\n" },
        }), "repomix-output.xml");
        assert.ok(text !== undefined);
        assert.ok(text.includes('<doc path="docs/HANDOFF.md" kind="handoff">\n引継ぎ\n</doc>'));
        assert.ok(!text.includes('kind="design"'));
        assert.ok(text.includes('<template kind="handoff">'));
        assert.ok(text.includes('<template kind="spec">'));
        assert.ok(!text.includes('<template kind="design">'));
        // 順序: 先頭段落 → <docs> → <templates> → <task> → <procedure>
        const order = ["[添付ファイルと本文の関係]", "<docs>", "<templates>", "<task>", "<procedure>"].map((m) => text.indexOf(m));
        assert.deepStrictEqual([...order].sort((a, b) => a - b), order);
        assert.ok(order.every((i) => i >= 0));
        assert.ok(text.includes("再掲します"));
    });
    test("本文用テキスト(design): 対象の設計書を再掲し、design / spec のひな型を付ける", () => {
        const text = (0, procedureFile_1.buildPromptText)(tail({
            docs: docsTail({ "docs/design/a.md": DRAFT, "docs/HANDOFF.md": "引継ぎ\n" }),
            procedure: { kind: "builtin", mode: "design", content: "手順\n" },
        }), "repomix-output.xml");
        assert.ok(text !== undefined);
        assert.ok(text.includes('<doc path="docs/design/a.md" kind="design" status="draft" blocking="1" deferred="0">'));
        assert.ok(!text.includes('kind="handoff"'));
        assert.ok(text.includes('<template kind="design">'));
        assert.ok(text.includes('<template kind="spec">'));
    });
    test("文書がまだなくても <docs> の注記とひな型が出て、hasTail は true", () => {
        const t = tail({ docs: docsTail({}) });
        assert.strictEqual((0, procedureFile_1.hasTail)(t), true);
        const text = (0, procedureFile_1.buildPromptText)(t, "p.xml");
        assert.ok(text?.includes("(文書はまだありません)"));
        assert.ok(text?.includes("まだない場合は空です"));
        assert.ok((0, procedureFile_1.assembleOutput)("本文\n", t).includes("<docs>\n"));
    });
    test("仕様書がなければ <docs> の注記で初版の作成を求める(パック・本文とも)", () => {
        const t = tail({ docs: docsTail({ "docs/design/a.md": "<!-- slnmix design: status=ready -->\n# d\n" }, "full") });
        for (const text of [(0, procedureFile_1.assembleOutput)("本文\n", t), (0, procedureFile_1.buildPromptText)(t, "p.xml") ?? ""]) {
            assert.ok(text.includes("- 仕様書(kind=\"spec\")はまだありません。最初の回答で docs/spec/a.md の初版"));
            assert.ok(text.includes("- 引継ぎ書(kind=\"handoff\")はまだありません"));
        }
        const designTail = tail({ docs: docsTail({ "docs/design/a.md": DRAFT }) });
        const designText = (0, procedureFile_1.buildPromptText)(designTail, "p.xml") ?? "";
        assert.ok(!designText.includes("はまだありません。最初の回答で"));
        assert.ok(designText.includes("現状の仕様書(as-is)"));
    });
    test("transform(認証情報マスク)はパックと本文の両方に効く", () => {
        const t = tail({
            docs: { ...docsTail({ "docs/HANDOFF.md": "pw=secret\n" }, "full"), transform: (s) => s.replace("secret", "[MASKED]") },
        });
        assert.ok((0, procedureFile_1.assembleOutput)("本文\n", t).includes("pw=[MASKED]"));
        assert.ok((0, procedureFile_1.buildPromptText)(t, "p.xml")?.includes("pw=[MASKED]"));
    });
});
suite("procedureFile: DB の確認(手順文 v8)", () => {
    const SCHEMA = { relativePath: "docs/db/schema.md", content: "# DB のテーブル定義\n\n### dbo.orders\n" };
    test("パック: <db_schema> を <docs> の後・<task> の前に置き、リマインダに列挙する", () => {
        const result = (0, procedureFile_1.assembleOutput)("本文\n", tail({
            dbSchema: SCHEMA,
            task: { kind: "text", content: "受注の合計を確かめる" },
            procedure: { kind: "builtin", mode: "full", content: "手順\n" },
        }));
        assert.ok(result.includes('本文\n\n<db_schema path="docs/db/schema.md">\nテスト用 DB のテーブル定義'));
        assert.ok(result.includes("### dbo.orders\n</db_schema>\n\n<task>\n"));
        assert.ok(result.includes("<db_schema>(テスト用 DB のテーブル定義)、<task>(依頼内容)"));
    });
    test("本文用テキスト: テーブル定義は再掲せず、添付にあることだけを書く", () => {
        const text = (0, procedureFile_1.buildPromptText)(tail({ dbSchema: SCHEMA, procedure: { kind: "builtin", mode: "full", content: "手順\n" } }), "p.xml");
        assert.ok(text?.includes("添付の <db_schema> にはテスト用 DB のテーブル定義(docs/db/schema.md)があります。"));
        assert.ok(!text?.includes("### dbo.orders"));
    });
    test("テーブル定義だけでは本文用テキストを出さない(指示がないため)", () => {
        const t = tail({ dbSchema: SCHEMA });
        assert.strictEqual((0, procedureFile_1.hasTail)(t), false);
        assert.strictEqual((0, procedureFile_1.buildPromptText)(t, "p.xml"), undefined);
        assert.ok((0, procedureFile_1.assembleOutput)("本文\n", t).includes("<db_schema"));
    });
    test("transform(認証情報マスク)が <db_schema> に効く", () => {
        const t = tail({
            dbSchema: { ...SCHEMA, content: "pw=secret\n" },
            dbSchemaTransform: (s) => s.replace("secret", "[MASKED]"),
        });
        assert.ok((0, procedureFile_1.assembleOutput)("本文\n", t).includes("pw=[MASKED]"));
    });
    test("resolveProcedure: db が真なら内蔵文に「DB の確認」の節が入る", () => {
        const resolved = (0, procedureFile_1.resolveProcedure)({ disabled: false, mode: "full", db: true }, PROJECT_DIR, CWD, fakeDeps({}));
        assert.ok(resolved.kind === "builtin" && resolved.content === (0, procedure_1.renderBuiltinProcedure)("full", { db: true }));
    });
});
//# sourceMappingURL=procedureFile.test.js.map