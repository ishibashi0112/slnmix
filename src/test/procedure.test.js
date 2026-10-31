"use strict";
/**
 * 内蔵作業手順文(assets/procedure)の単体テスト。
 * 4 モードの出力は test-fixtures/procedure/<mode>.md(docs 連携なし)、
 * <mode>.docs.md(docs 連携あり)、<mode>.tests.md(自動テストあり)、
 * <mode>.docs.tests.md(両方)のスナップショットで固定する。
 * 文面を意図的に変えたときは PROCEDURE_VERSION を上げ、スナップショットを更新する。
 * テストの無いプロジェクト向けの本文(<mode>.md / <mode>.docs.md)は v5 と
 * 同一に保つ(テスト戦略メモ §8。版数の行だけが変わる)。
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
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const procedure_1 = require("../assets/procedure");
const FIXTURES_ROOT = path.resolve(__dirname, "..", "..", "test-fixtures");
function fixture(name) {
    return fs.readFileSync(path.join(FIXTURES_ROOT, "procedure", name), "utf8");
}
suite("procedure: スナップショット", () => {
    for (const mode of procedure_1.PROCEDURE_MODES) {
        test(`${mode} モード(generic 構成)がスナップショットと一致する`, () => {
            assert.strictEqual((0, procedure_1.renderBuiltinProcedure)(mode, { layout: "generic" }), fixture(`${mode}.generic.md`));
        });
        test(`${mode} モード(generic 構成 + docs + 自動テスト)がスナップショットと一致する`, () => {
            assert.strictEqual((0, procedure_1.renderBuiltinProcedure)(mode, { layout: "generic", docs: true, tests: true }), fixture(`${mode}.generic.docs.tests.md`));
        });
        test(`${mode} モード: layout 省略は "solution" と同じ`, () => {
            assert.strictEqual((0, procedure_1.renderBuiltinProcedure)(mode, { layout: "solution" }), (0, procedure_1.renderBuiltinProcedure)(mode));
        });
        test(`${mode} モードの内蔵既定文がスナップショットと一致する`, () => {
            assert.strictEqual((0, procedure_1.renderBuiltinProcedure)(mode), fixture(`${mode}.md`));
        });
        test(`${mode} モード(docs 連携あり)がスナップショットと一致する`, () => {
            assert.strictEqual((0, procedure_1.renderBuiltinProcedure)(mode, { docs: true }), fixture(`${mode}.docs.md`));
        });
        test(`${mode} モード(自動テストあり)がスナップショットと一致する`, () => {
            assert.strictEqual((0, procedure_1.renderBuiltinProcedure)(mode, { tests: true }), fixture(`${mode}.tests.md`));
        });
        test(`${mode} モード(docs 連携 + 自動テストあり)がスナップショットと一致する`, () => {
            assert.strictEqual((0, procedure_1.renderBuiltinProcedure)(mode, { docs: true, tests: true }), fixture(`${mode}.docs.tests.md`));
        });
    }
    test("docs 連携なしの本文は docs あり本文の先頭部分と一致し、末尾に 2 節だけ足される", () => {
        for (const mode of procedure_1.PROCEDURE_MODES) {
            const plain = (0, procedure_1.renderBuiltinProcedure)(mode);
            const withDocs = (0, procedure_1.renderBuiltinProcedure)(mode, { docs: true });
            assert.strictEqual(withDocs, plain + procedure_1.DOCS_SECTIONS);
            assert.ok(!plain.includes("## 文書(docs/)の扱い"));
            assert.ok(withDocs.includes("## 文書(docs/)の扱い"));
            assert.ok(withDocs.includes("## チャットの継続と引継ぎ"));
        }
    });
    test("自動テストありは末尾に「自動テスト」の 1 節だけ足され、docs の節の後に来る", () => {
        for (const mode of procedure_1.PROCEDURE_MODES) {
            const plain = (0, procedure_1.renderBuiltinProcedure)(mode);
            const withTests = (0, procedure_1.renderBuiltinProcedure)(mode, { tests: true });
            const withBoth = (0, procedure_1.renderBuiltinProcedure)(mode, { docs: true, tests: true });
            assert.strictEqual(withTests, plain + procedure_1.TEST_SECTIONS);
            assert.strictEqual(withBoth, plain + procedure_1.DOCS_SECTIONS + procedure_1.TEST_SECTIONS);
            assert.ok(!plain.includes("## 自動テスト"));
            assert.ok(!(0, procedure_1.renderBuiltinProcedure)(mode, { docs: true }).includes("## 自動テスト"));
            assert.ok(withTests.includes("## 自動テスト"));
            assert.strictEqual(withTests.split("## 自動テスト").length, 2);
        }
    });
    test("テストなしの本文は v5 と同一(版数の行を除く)", () => {
        // v5 のスナップショットはこの版数置換だけで v6 に更新した。v6 で足したものは
        // すべて {{TEST_SECTIONS}} の中にあり、テストなしでは空文字になる。
        // v7(layout)も solution 構成では版数の行だけが変わる
        for (const mode of procedure_1.PROCEDURE_MODES) {
            const plain = (0, procedure_1.renderBuiltinProcedure)(mode);
            assert.ok(plain.startsWith(`<!-- slnmix procedure v${procedure_1.PROCEDURE_VERSION} (mode: `));
            assert.ok(!plain.includes("テスト"), `${mode}: テストなしの本文にテストの記述がある`);
            assert.ok(!plain.includes("data-testid"));
        }
    });
    test("自動テストの節: 3 層の置き場、観点表、data-testid、自己検証の 2 項目、design の完了条件", () => {
        assert.ok(procedure_1.TEST_SECTIONS.startsWith("\n## 自動テスト\n\n- "));
        assert.ok(procedure_1.TEST_SECTIONS.endsWith("\n"));
        for (const phrase of [
            "e2e/screen/",
            "e2e/api/",
            "e2e/host/",
            "*.test.ts",
            "| 読み取り元 | 観点 | 層 |",
            "Arrange(前提データ) / Act(操作) / Assert(確認)",
            "testId 接頭辞",
            'data-testid="<画面>-<役割>"',
            "変更した振る舞いにテストがあるか(ないなら理由)",
            "画面に追加した要素に data-testid を付けたか",
            "設計書 §9 の各バッチの完了条件を「自動テスト」と「手動確認」に分け",
            "e2e/<層>/<画面>.spec.ts",
        ]) {
            assert.ok(procedure_1.TEST_SECTIONS.includes(phrase), `自動テストの節に「${phrase}」がない`);
        }
        assert.strictEqual(procedure_1.TEST_SECTIONS.split("\n").filter((line) => line.startsWith("|")).length, 8, "観点表はヘッダ + 区切り + 6 行");
    });
});
suite("procedure: DB の確認(v8)・動作検証(v9)", () => {
    test("full モード(DB の確認あり)がスナップショットと一致する", () => {
        assert.strictEqual((0, procedure_1.renderBuiltinProcedure)("full", { db: true }), fixture("full.db.md"));
    });
    test("DB の確認ありは末尾に「DB の確認」の 1 節だけ足され、docs・テストの節の後に来る(どの構成・モードでも)", () => {
        for (const layout of ["solution", "generic"]) {
            for (const mode of procedure_1.PROCEDURE_MODES) {
                const plain = (0, procedure_1.renderBuiltinProcedure)(mode, { layout });
                const all = (0, procedure_1.renderBuiltinProcedure)(mode, { layout, docs: true, tests: true });
                assert.strictEqual((0, procedure_1.renderBuiltinProcedure)(mode, { layout, db: true }), plain + procedure_1.DB_SECTIONS);
                assert.strictEqual((0, procedure_1.renderBuiltinProcedure)(mode, { layout, docs: true, tests: true, db: true }), all + procedure_1.DB_SECTIONS);
                assert.ok(!all.includes("## DB の確認"));
            }
        }
    });
    test("DB の確認の節: SELECT だけ、checks/*.sql を create、実行コマンド、見出しになるコメント、行数の上限", () => {
        assert.ok(procedure_1.DB_SECTIONS.startsWith("\n## DB の確認(テスト用 DB)\n\n- "));
        assert.ok(procedure_1.DB_SECTIONS.endsWith("\n"));
        for (const phrase of [
            "<db_schema>",
            "推測しないでください",
            "npx ashiato schema --tables",
            "checks/<内容が分かる名前>.sql として create",
            "npx ashiato query checks/<名前>.sql",
            "書いてよいのは SELECT(WITH を含む)だけです",
            "1 文も実行されません",
            "-- コメントで 1 行",
            "先頭 50 行まで",
            "DB の事実として扱い",
        ]) {
            assert.ok(procedure_1.DB_SECTIONS.includes(phrase), `DB の確認の節に「${phrase}」がない`);
        }
    });
    test("動作検証の節(v9): checks/*.verify.md を create、実行コマンド、ashiato verify が読める書式", () => {
        const verify = procedure_1.DB_SECTIONS.slice(procedure_1.DB_SECTIONS.indexOf("\n## 動作検証(テスト用 DB)\n\n- "));
        assert.ok(verify.length < procedure_1.DB_SECTIONS.length, "動作検証の節がない");
        for (const phrase of [
            "checks/<内容が分かる名前>.verify.md として create",
            "npx ashiato verify checks/<名前>.verify.md",
            "「## 1. すること」の見出し",
            "「期待する DB の変化:」の 1 行",
            "「- テーブル名: 追加 1 行 (列=値, 列=値)」",
            "→ (更新後の列=値, ...)",
            "「- テーブル名: 変化なし」",
            "列=*",
            "列+=数 / 列-=数",
            "「- ほかのテーブル: 問わない」",
            "'...' で囲みます",
            "rewrite で出し直してください",
        ]) {
            assert.ok(verify.includes(phrase), `動作検証の節に「${phrase}」がない`);
        }
    });
});
suite("procedure: 描画", () => {
    test("プレースホルダが残らず、先頭コメントにバージョンとモードが入る", () => {
        for (const mode of procedure_1.PROCEDURE_MODES) {
            const rendered = (0, procedure_1.renderBuiltinProcedure)(mode);
            assert.ok(!rendered.includes("{{"), `${mode}: プレースホルダが残っている`);
            assert.ok(rendered.startsWith(`<!-- slnmix procedure v${procedure_1.PROCEDURE_VERSION} (mode: ${mode}) -->\n`));
            assert.ok(rendered.endsWith("\n"));
        }
    });
    test("テンプレートには {{MODE}} / {{MODE_SECTIONS}} / {{DOCS_SECTIONS}} / {{TEST_SECTIONS}} / {{DB_SECTIONS}} が 1 回ずつあり、docs → テスト → DB の順で末尾", () => {
        assert.strictEqual(procedure_1.PROCEDURE_TEMPLATE.split("{{MODE}}").length, 2);
        assert.strictEqual(procedure_1.PROCEDURE_TEMPLATE.split("{{MODE_SECTIONS}}").length, 2);
        assert.strictEqual(procedure_1.PROCEDURE_TEMPLATE.split("{{DOCS_SECTIONS}}").length, 2);
        assert.strictEqual(procedure_1.PROCEDURE_TEMPLATE.split("{{TEST_SECTIONS}}").length, 2);
        assert.strictEqual(procedure_1.PROCEDURE_TEMPLATE.split("{{DB_SECTIONS}}").length, 2);
        assert.ok(procedure_1.PROCEDURE_TEMPLATE.endsWith("{{DOCS_SECTIONS}}{{TEST_SECTIONS}}{{DB_SECTIONS}}"));
    });
    test("db: \"placeholder\" は {{DB_SECTIONS}} を残し、実行時に設定に応じて置換される", () => {
        const printed = (0, procedure_1.renderBuiltinProcedure)("full", { docs: "placeholder", tests: "placeholder", db: "placeholder" });
        assert.ok(printed.endsWith("{{DOCS_SECTIONS}}{{TEST_SECTIONS}}{{DB_SECTIONS}}"));
        assert.strictEqual((0, procedure_1.renderProcedureTemplate)(printed, "full", { db: true }), (0, procedure_1.renderBuiltinProcedure)("full", { db: true }));
        assert.strictEqual((0, procedure_1.renderProcedureTemplate)(printed, "full"), (0, procedure_1.renderBuiltinProcedure)("full"));
    });
    test("docs / tests: \"placeholder\" は {{DOCS_SECTIONS}} / {{TEST_SECTIONS}} を残す(--print-procedure 用)", () => {
        const printed = (0, procedure_1.renderBuiltinProcedure)("full", { docs: "placeholder", tests: "placeholder" });
        assert.ok(printed.endsWith("{{DOCS_SECTIONS}}{{TEST_SECTIONS}}"));
        assert.ok(!printed.includes("{{MODE"));
        // 残したプレースホルダは実行時に設定に応じて置換される(procedure.md の運用)
        assert.strictEqual((0, procedure_1.renderProcedureTemplate)(printed, "full", { docs: true }), (0, procedure_1.renderBuiltinProcedure)("full", { docs: true }));
        assert.strictEqual((0, procedure_1.renderProcedureTemplate)(printed, "full", { tests: true }), (0, procedure_1.renderBuiltinProcedure)("full", { tests: true }));
        assert.strictEqual((0, procedure_1.renderProcedureTemplate)(printed, "full", { docs: true, tests: true }), (0, procedure_1.renderBuiltinProcedure)("full", { docs: true, tests: true }));
        assert.strictEqual((0, procedure_1.renderProcedureTemplate)(printed, "full"), (0, procedure_1.renderBuiltinProcedure)("full"));
        // 片方だけ placeholder にもできる
        const docsOnly = (0, procedure_1.renderBuiltinProcedure)("full", { docs: "placeholder" });
        assert.ok(docsOnly.endsWith("{{DOCS_SECTIONS}}"));
        assert.ok(!docsOnly.includes("{{TEST_SECTIONS}}"));
    });
    test("design: 調査 / 設計書 / 確認事項 / 継続判定の 4 節でコード変更を出させない", () => {
        const headings = procedure_1.MODE_SECTIONS.design.match(/^### .+$/gm);
        assert.deepStrictEqual(headings, [
            "### 1. 調査",
            "### 2. 設計書",
            "### 3. 確認事項",
            "### 4. 継続判定",
        ]);
        assert.ok(procedure_1.MODE_SECTIONS.design.includes("コードの変更はこのモードでは出しません"));
        assert.ok(procedure_1.MODE_SECTIONS.design.includes("status=ready"));
        assert.ok(procedure_1.MODE_SECTIONS.design.includes("必須"));
        assert.ok(procedure_1.MODE_SECTIONS.design.includes("後回し"));
    });
    test("full: 調査 / 方針 / 変更 / 自己検証の 4 節", () => {
        const headings = procedure_1.MODE_SECTIONS.full.match(/^### .+$/gm);
        assert.deepStrictEqual(headings, [
            "### 1. 調査",
            "### 2. 方針",
            "### 3. 変更",
            "### 4. 自己検証",
        ]);
    });
    test("plan: 調査 / 方針 / 質問の 3 節で changes.md を出させない", () => {
        const headings = procedure_1.MODE_SECTIONS.plan.match(/^### .+$/gm);
        assert.deepStrictEqual(headings, ["### 1. 調査", "### 2. 方針", "### 3. 質問"]);
        assert.ok(procedure_1.MODE_SECTIONS.plan.includes("changes.md を出さないでください"));
        assert.ok(!procedure_1.MODE_SECTIONS.plan.includes("changes.md を出してください"));
    });
    test("implement: 方針の確認 / 変更 / 自己検証の 3 節で調査を省く", () => {
        const headings = procedure_1.MODE_SECTIONS.implement.match(/^### .+$/gm);
        assert.deepStrictEqual(headings, [
            "### 1. 方針の確認",
            "### 2. 変更",
            "### 3. 自己検証",
        ]);
        assert.ok(procedure_1.MODE_SECTIONS.implement.includes("<plan>"));
        assert.ok(!procedure_1.MODE_SECTIONS.implement.includes("### 1. 調査"));
    });
    test("full と implement の自己検証は同じ文面", () => {
        const verify = (text) => text.slice(text.indexOf("自己検証"));
        assert.strictEqual(verify(procedure_1.MODE_SECTIONS.full), verify(procedure_1.MODE_SECTIONS.implement));
    });
    test("renderProcedureTemplate: プレースホルダのないテンプレートはそのまま", () => {
        const custom = "# 独自の手順\n\n好きに書く\n";
        assert.strictEqual((0, procedure_1.renderProcedureTemplate)(custom, "plan"), custom);
    });
    test("renderProcedureTemplate: 複数回のプレースホルダもすべて置換する", () => {
        const custom = "mode={{MODE}}\n{{MODE_SECTIONS}}\nagain {{MODE}}\n";
        const rendered = (0, procedure_1.renderProcedureTemplate)(custom, "implement");
        assert.strictEqual(rendered, `mode=implement\n${procedure_1.MODE_SECTIONS.implement}\nagain implement\n`);
    });
    test("isProcedureMode", () => {
        assert.ok((0, procedure_1.isProcedureMode)("full"));
        assert.ok((0, procedure_1.isProcedureMode)("plan"));
        assert.ok((0, procedure_1.isProcedureMode)("implement"));
        assert.ok((0, procedure_1.isProcedureMode)("design"));
        assert.ok(!(0, procedure_1.isProcedureMode)("Full"));
        assert.ok(!(0, procedure_1.isProcedureMode)(""));
    });
});
suite("procedure: 構成の種類(layout、v7)", () => {
    test("solution のプレースホルダ置換後の文面は v6 と同じ語句を保つ", () => {
        const text = (0, procedure_1.renderBuiltinProcedure)("full", { tests: true });
        for (const phrase of [
            "一般的な VB.NET / React のコード",
            "<ui_summary> は Designer.vb からの要約です",
            ".vbproj は編集しないでください",
            "「どのフォームか」",
            "Option Strict On",
            "Handles 句",
            "Shift_JIS",
            "e2e/screen/",
        ]) {
            assert.ok(text.includes(phrase), `${phrase} がありません`);
        }
        assert.ok(!text.includes("{{LAYOUT:"), "プレースホルダが残っています");
    });
    test("generic の文面に VB.NET / WinForms 固有の記述が残らない", () => {
        for (const mode of procedure_1.PROCEDURE_MODES) {
            const text = (0, procedure_1.renderBuiltinProcedure)(mode, { layout: "generic", docs: true, tests: true });
            for (const phrase of [
                "VB.NET",
                "Designer",
                ".vbproj",
                "フォームか",
                "Option Strict",
                "Handles",
                "Shift_JIS",
                "e2e/screen/",
                "db.snapshot",
                "{{LAYOUT:",
            ]) {
                assert.ok(!text.includes(phrase), `${mode}: ${phrase} が残っています`);
            }
            assert.ok(text.startsWith(`<!-- slnmix procedure v${procedure_1.PROCEDURE_VERSION} (mode: ${mode}, layout: generic) -->\n`));
        }
    });
    test("generic でも共通の節(パックの読み方 / 回答の構成 / 判断の原則)と新規ファイルの規則は残る", () => {
        const text = (0, procedure_1.renderBuiltinProcedure)("full", { layout: "generic" });
        for (const phrase of [
            "## パックの読み方",
            "## 回答の構成",
            "## 判断の原則",
            "### 4. 自己検証",
            "新規ファイルは changes.md の create で出してください。パスは <file_summary> に示す物理パスの規則で書いてください",
            "<contract_summary> がある場合",
            "[MASKED] は伏せ字です",
            "骨格のみ(skeleton)",
        ]) {
            assert.ok(text.includes(phrase), `${phrase} がありません`);
        }
    });
    test("テンプレートの {{LAYOUT:...}} は LAYOUT_TEXT の両構成に同じキーで定義されている", () => {
        const names = [...procedure_1.PROCEDURE_TEMPLATE.matchAll(/\{\{LAYOUT:([A-Z_]+)\}\}/g)].map((m) => m[1]);
        assert.ok(names.length > 0);
        for (const name of names) {
            assert.ok(name !== undefined && name in procedure_1.LAYOUT_TEXT.solution, `solution に ${name} がありません`);
            assert.ok(name !== undefined && name in procedure_1.LAYOUT_TEXT.generic, `generic に ${name} がありません`);
        }
        assert.deepStrictEqual(Object.keys(procedure_1.LAYOUT_TEXT.solution).sort(), Object.keys(procedure_1.LAYOUT_TEXT.generic).sort());
    });
    test("MODE_SECTIONS / TEST_SECTIONS は solution 構成のもの(後方互換)。generic との差は自己検証とテストの置き場の行だけ", () => {
        assert.strictEqual(procedure_1.MODE_SECTIONS, procedure_1.MODE_SECTIONS_BY_LAYOUT.solution);
        assert.strictEqual(procedure_1.TEST_SECTIONS, procedure_1.TEST_SECTIONS_BY_LAYOUT.solution);
        // plan / design は自己検証を持たないので構成で変わらない
        assert.strictEqual(procedure_1.MODE_SECTIONS_BY_LAYOUT.generic.plan, procedure_1.MODE_SECTIONS_BY_LAYOUT.solution.plan);
        assert.strictEqual(procedure_1.MODE_SECTIONS_BY_LAYOUT.generic.design, procedure_1.MODE_SECTIONS_BY_LAYOUT.solution.design);
        assert.notStrictEqual(procedure_1.MODE_SECTIONS_BY_LAYOUT.generic.full, procedure_1.MODE_SECTIONS_BY_LAYOUT.solution.full);
        assert.notStrictEqual(procedure_1.MODE_SECTIONS_BY_LAYOUT.generic.implement, procedure_1.MODE_SECTIONS_BY_LAYOUT.solution.implement);
        assert.ok(procedure_1.MODE_SECTIONS_BY_LAYOUT.generic.full.includes("- 新規ファイルは create で出している"));
    });
    test("procedure.md(カスタム文)にプレースホルダが無ければ layout は影響しない", () => {
        const custom = "# 自前の手順\n{{MODE}} で動く\n";
        assert.strictEqual((0, procedure_1.renderProcedureTemplate)(custom, "full", { layout: "generic" }), (0, procedure_1.renderProcedureTemplate)(custom, "full"));
    });
});
//# sourceMappingURL=procedure.test.js.map