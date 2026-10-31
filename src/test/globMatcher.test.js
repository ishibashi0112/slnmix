"use strict";
/**
 * globMatcher の単体テスト(MSBuild ワイルドカードの最小限の解釈)。
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
const globMatcher_1 = require("../globMatcher");
suite("globMatcher", () => {
    test("**/*.vb は任意の深さの .vb に一致し、他の拡張子には一致しない", () => {
        assert.ok((0, globMatcher_1.globMatches)("**/*.vb", "Program.vb"));
        assert.ok((0, globMatcher_1.globMatches)("**/*.vb", "Forms/MainForm.Designer.vb"));
        assert.ok((0, globMatcher_1.globMatches)("**/*.vb", "a/b/c/d.vb"));
        assert.ok(!(0, globMatcher_1.globMatches)("**/*.vb", "Program.vbproj"));
        assert.ok(!(0, globMatcher_1.globMatches)("**/*.vb", "readme.md"));
    });
    test("bin/** は bin 直下と配下に一致し、bin 以外には一致しない", () => {
        assert.ok((0, globMatcher_1.globMatches)("bin/**", "bin/Debug/x.vb"));
        assert.ok((0, globMatcher_1.globMatches)("bin/**", "bin/x.vb"));
        assert.ok(!(0, globMatcher_1.globMatches)("bin/**", "src/bin/x.vb"));
        assert.ok(!(0, globMatcher_1.globMatches)("bin/**", "binary/x.vb"));
    });
    test("**/.*/** はドットで始まるフォルダ配下に一致する", () => {
        assert.ok((0, globMatcher_1.globMatches)("**/.*/**", ".vs/x.vb"));
        assert.ok((0, globMatcher_1.globMatches)("**/.*/**", "a/.git/b/x.vb"));
        assert.ok(!(0, globMatcher_1.globMatches)("**/.*/**", "a/b/x.vb"));
        assert.ok(!(0, globMatcher_1.globMatches)("**/.*/**", "a/.hidden.vb"));
    });
    test("* はセグメント内、? は 1 文字。`\\` と `/` は同一視、大文字小文字は区別しない", () => {
        assert.ok((0, globMatcher_1.globMatches)("Forms\\*.vb", "forms/MainForm.vb"));
        assert.ok(!(0, globMatcher_1.globMatches)("Forms/*.vb", "Forms/Sub/MainForm.vb"));
        assert.ok((0, globMatcher_1.globMatches)("Form?.vb", "Form1.vb"));
        assert.ok(!(0, globMatcher_1.globMatches)("Form?.vb", "Form10.vb"));
        assert.ok((0, globMatcher_1.globMatches)("Excluded\\**", "Excluded\\Old.vb"));
    });
    test("正規表現のメタ文字はリテラルとして扱う", () => {
        assert.ok((0, globMatcher_1.globMatches)("a.b/c+d.vb", "a.b/c+d.vb"));
        assert.ok(!(0, globMatcher_1.globMatches)("a.b/c+d.vb", "axb/cd.vb"));
    });
    test("normalizeGlobPath: 区切りを / に揃え、先頭の ./ を落とす", () => {
        assert.strictEqual((0, globMatcher_1.normalizeGlobPath)(".\\Forms\\A.vb"), "Forms/A.vb");
        assert.strictEqual((0, globMatcher_1.normalizeGlobPath)("./a//b"), "a/b");
    });
});
suite("globMatcher: ブレース展開", () => {
    test("{ts,tsx} は選択肢として展開される", () => {
        assert.ok((0, globMatcher_1.globMatches)("**/*.{ts,tsx,css}", "src/App.tsx"));
        assert.ok((0, globMatcher_1.globMatches)("**/*.{ts,tsx,css}", "src/a/b.css"));
        assert.ok(!(0, globMatcher_1.globMatches)("**/*.{ts,tsx,css}", "src/a/b.md"));
    });
    test("ブレースが複数あっても展開される", () => {
        assert.ok((0, globMatcher_1.globMatches)("{src,lib}/**/*.{js,jsx}", "lib/x/y.jsx"));
        assert.ok(!(0, globMatcher_1.globMatches)("{src,lib}/**/*.{js,jsx}", "test/x.js"));
    });
    test("閉じていないブレースはリテラル扱い", () => {
        assert.ok((0, globMatcher_1.globMatches)("a{b.vb", "a{b.vb"));
    });
});
//# sourceMappingURL=globMatcher.test.js.map