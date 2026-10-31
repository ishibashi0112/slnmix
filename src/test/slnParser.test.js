"use strict";
/**
 * slnParser の単体テスト。
 * fixture の Sample.sln と、インライン文字列による頑健性ケースで検証する。
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
const slnParser_1 = require("../slnParser");
const FIXTURES_ROOT = path.resolve(__dirname, "..", "..", "test-fixtures");
const realFs = { fileExists: (p) => fs.existsSync(p) };
function parseSampleSln() {
    const solutionPath = path.join(FIXTURES_ROOT, "solution", "Sample.sln");
    return (0, slnParser_1.parseSln)(fs.readFileSync(solutionPath, "utf8"), solutionPath, realFs);
}
suite("slnParser: Sample.sln fixture", () => {
    const result = parseSampleSln();
    test(".vbproj のプロジェクトのみ抽出する", () => {
        assert.deepStrictEqual(result.projects.map((p) => p.name), ["Basic", "LinkedApp", "Gone"]);
    });
    test("名前・GUID・相対パスを取得する", () => {
        const basic = result.projects[0];
        assert.strictEqual(basic.name, "Basic");
        assert.strictEqual(basic.relativePath, "..\\basic\\Basic.vbproj");
        assert.strictEqual(basic.projectGuid, "A1111111-1111-1111-1111-111111111111");
        assert.strictEqual(basic.projectTypeGuid, "F184B08F-C81C-45F6-A57F-5ABD9991F28F");
    });
    test("相対パスを .sln 基準の絶対パスへ解決し、存在確認する", () => {
        const basic = result.projects[0];
        assert.strictEqual(basic.absolutePath, path.join(FIXTURES_ROOT, "basic", "Basic.vbproj"));
        assert.strictEqual(basic.exists, true);
        const gone = result.projects[2];
        assert.strictEqual(gone.exists, false);
    });
    test("Solution Folder と他言語プロジェクトはスキップし診断に残す", () => {
        assert.ok(result.diagnostics.some((d) => d.severity === "info" && d.message.includes("Solution Folder")));
        assert.ok(result.diagnostics.some((d) => d.severity === "info" && d.message.includes("CSharpLib.csproj")));
    });
});
suite("slnParser: 入力の頑健性", () => {
    test("BOM 付きでも解析できる", () => {
        const content = "\uFEFF" +
            "Microsoft Visual Studio Solution File, Format Version 12.00\n" +
            'Project("{F184B08F-C81C-45F6-A57F-5ABD9991F28F}") = "App", "App\\App.vbproj", "{B1111111-1111-1111-1111-111111111111}"\n' +
            "EndProject\n";
        const result = (0, slnParser_1.parseSln)(content, "/tmp/sol/Test.sln", {
            fileExists: () => true,
        });
        assert.strictEqual(result.projects.length, 1);
        assert.strictEqual(result.projects[0].name, "App");
    });
    test("VB プロジェクトが 1 件もない場合は警告を残す", () => {
        const content = "Microsoft Visual Studio Solution File, Format Version 12.00\n";
        const result = (0, slnParser_1.parseSln)(content, "/tmp/sol/Empty.sln", realFs);
        assert.strictEqual(result.projects.length, 0);
        assert.ok(result.diagnostics.some((d) => d.severity === "warning" && d.message.includes("見つかりません")));
    });
    test(".sln らしくない内容にはヘッダー警告を出す", () => {
        const result = (0, slnParser_1.parseSln)("<xml />", "/tmp/sol/NotSln.sln", realFs);
        assert.ok(result.diagnostics.some((d) => d.severity === "warning" && d.message.includes("ヘッダー")));
    });
});
suite("slnParser: 同フォルダの未参照 .vbproj 警告", () => {
    const CONTENT = "Microsoft Visual Studio Solution File, Format Version 12.00\n" +
        'Project("{F184B08F-C81C-45F6-A57F-5ABD9991F28F}") = "App", "App.vbproj", "{B1111111-1111-1111-1111-111111111111}"\n' +
        "EndProject\n";
    function fakeDeps(names) {
        return {
            fileExists: () => true,
            listFileNames: () => names,
        };
    }
    test(".sln から参照されていない同フォルダの .vbproj に警告を出す", () => {
        const result = (0, slnParser_1.parseSln)(CONTENT, "/tmp/sol/Test.sln", fakeDeps(["App.vbproj", "Old.vbproj", "readme.txt"]));
        const warnings = result.diagnostics.filter((d) => d.severity === "warning" && d.message.includes("参照されていない"));
        assert.strictEqual(warnings.length, 1);
        assert.ok(warnings[0].message.includes("Old.vbproj"));
    });
    test("参照済み .vbproj は大文字小文字が違っても警告しない", () => {
        const result = (0, slnParser_1.parseSln)(CONTENT, "/tmp/sol/Test.sln", fakeDeps(["APP.VBPROJ"]));
        assert.ok(!result.diagnostics.some((d) => d.message.includes("参照されていない")));
    });
    test("listFileNames が渡されない場合はこのチェックをスキップする", () => {
        const result = (0, slnParser_1.parseSln)(CONTENT, "/tmp/sol/Test.sln", {
            fileExists: () => true,
        });
        assert.ok(!result.diagnostics.some((d) => d.message.includes("参照されていない")));
    });
    test("ディレクトリを読めない場合(undefined)もスキップする", () => {
        const result = (0, slnParser_1.parseSln)(CONTENT, "/tmp/sol/Test.sln", {
            fileExists: () => true,
            listFileNames: () => undefined,
        });
        assert.ok(!result.diagnostics.some((d) => d.message.includes("参照されていない")));
    });
});
//# sourceMappingURL=slnParser.test.js.map