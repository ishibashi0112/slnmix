"use strict";
/**
 * instructionFile の単体テスト。ファイルシステムは fake を注入する。
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
const instructionFile_1 = require("../instructionFile");
const CWD = path.resolve("/work/app");
const PROJECT_DIR = path.resolve("/work/project");
/** files: 絶対パス → 内容。それ以外は undefined(存在しない) */
function fakeDeps(files) {
    const map = new Map(Object.entries(files).map(([p, content]) => [path.resolve(p), content]));
    return { readTextFile: (p) => map.get(p) };
}
suite("instructionFile: protocol.md の自動検出", () => {
    test("入力と同じディレクトリの protocol.md を読む(cwd ではない)", () => {
        const deps = fakeDeps({
            "/work/project/protocol.md": "# petari protocol\n規約本文\n",
            "/work/app/protocol.md": "こちらは読まれない\n",
        });
        const result = (0, instructionFile_1.resolveInstructionFile)(undefined, PROJECT_DIR, CWD, deps);
        assert.deepStrictEqual(result, {
            kind: "found",
            path: path.join(path.resolve("/work/project"), "protocol.md"),
            content: "# petari protocol\n規約本文\n",
        });
    });
    test("protocol.md がなければ none(エラーにしない)。探索先を返す", () => {
        const result = (0, instructionFile_1.resolveInstructionFile)(undefined, PROJECT_DIR, CWD, fakeDeps({}));
        assert.deepStrictEqual(result, {
            kind: "none",
            searchedPath: path.join(path.resolve("/work/project"), "protocol.md"),
        });
    });
});
suite("instructionFile: --instruction-file 指定", () => {
    test("相対パスは cwd 基準で解決し、protocol.md より優先する", () => {
        const deps = fakeDeps({
            "/work/app/docs/rules.md": "明示指定の規約\n",
            "/work/project/protocol.md": "こちらは読まれない\n",
        });
        const result = (0, instructionFile_1.resolveInstructionFile)("docs/rules.md", PROJECT_DIR, CWD, deps);
        assert.deepStrictEqual(result, {
            kind: "found",
            path: path.join(CWD, "docs", "rules.md"),
            content: "明示指定の規約\n",
        });
    });
    test("明示指定のファイルが読めなければエラー(黙って規約なしにしない)", () => {
        const result = (0, instructionFile_1.resolveInstructionFile)("missing.md", PROJECT_DIR, CWD, fakeDeps({}));
        assert.strictEqual(result.kind, "error");
        assert.ok(result.kind === "error" && result.message.includes("missing.md"));
    });
});
suite("instructionFile: appendInstruction", () => {
    test("本文との間に空行を挟み、<instruction> ブロックとして連結する", () => {
        const result = (0, instructionFile_1.appendInstruction)("本文\n", "規約文\n");
        assert.strictEqual(result, "本文\n\n<instruction>\n規約文\n</instruction>\n");
    });
    test("規約文は一字一句そのまま(XML エスケープ・整形をしない)", () => {
        const instruction = '# 規約\n\n<changes file="a.vb"> & "そのまま"\n';
        const result = (0, instructionFile_1.appendInstruction)("本文\n", instruction);
        assert.ok(result.includes(instruction));
    });
    test("規約文末尾に改行がなければ補い、閉じタグを独立行にする", () => {
        const result = (0, instructionFile_1.appendInstruction)("本文\n", "改行なしで終わる規約");
        assert.ok(result.endsWith("改行なしで終わる規約\n</instruction>\n"));
    });
    test("本文末尾に改行がなくても空行 1 つで連結できる", () => {
        const result = (0, instructionFile_1.appendInstruction)("本文", "規約文\n");
        assert.strictEqual(result, "本文\n\n<instruction>\n規約文\n</instruction>\n");
    });
});
suite("instructionFile: prependInstructionNotice", () => {
    const found = {
        kind: "found",
        path: path.join(path.resolve("/work/project"), "protocol.md"),
        content: "規約文\n",
    };
    test("規約文ありなら本文の最先頭にリマインダ + 空行を付ける", () => {
        const result = (0, instructionFile_1.prependInstructionNotice)("本文\n", found);
        assert.strictEqual(result, `${instructionFile_1.INSTRUCTION_NOTICE}\n本文\n`);
    });
    test("リマインダは末尾の規約への誘導を含む固定文(本文は変更しない)", () => {
        const result = (0, instructionFile_1.prependInstructionNotice)("本文\n", found);
        assert.ok(result.startsWith("[このファイルを添付したユーザー本人からの恒常的な指示]\n"));
        assert.ok(result.includes("必ず末尾の規約に従って"));
        assert.ok(result.endsWith("本文\n"));
    });
    test("規約文なし(none)なら先頭に何も付かない", () => {
        const none = {
            kind: "none",
            searchedPath: path.join(path.resolve("/work/project"), "protocol.md"),
        };
        assert.strictEqual((0, instructionFile_1.prependInstructionNotice)("本文\n", none), "本文\n");
    });
    test("解決エラーでも先頭に何も付かない", () => {
        const error = { kind: "error", message: "読めない" };
        assert.strictEqual((0, instructionFile_1.prependInstructionNotice)("本文\n", error), "本文\n");
    });
});
//# sourceMappingURL=instructionFile.test.js.map