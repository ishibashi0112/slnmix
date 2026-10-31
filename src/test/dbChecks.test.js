"use strict";
/**
 * dbChecks(AI チャットだけでの DB 確認)の単体テスト。ファイルシステムは fake を注入する。
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
const dbChecks_1 = require("../dbChecks");
const ROOT = path.resolve("/work/project");
suite("dbChecks", () => {
    test("ルートの docs/db/schema.md があれば読み、なければ undefined", () => {
        const file = path.resolve(ROOT, "docs", "db", "schema.md");
        const found = (0, dbChecks_1.resolveDbSchema)(ROOT, { readTextFile: (p) => (p === file ? "# DB\n" : undefined) });
        assert.deepStrictEqual(found, { relativePath: "docs/db/schema.md", content: "# DB\n" });
        assert.strictEqual((0, dbChecks_1.resolveDbSchema)(ROOT, { readTextFile: () => undefined }), undefined);
    });
    test("<db_schema> ブロック: path 属性・説明の 1 行・本文(末尾の改行は 1 つ)", () => {
        assert.strictEqual((0, dbChecks_1.renderDbSchemaBlock)({ relativePath: "docs/db/schema.md", content: "# DB\n\n### dbo.orders\n" }), '<db_schema path="docs/db/schema.md">\nテスト用 DB のテーブル定義(ashiato schema の出力。行の値は含まない)。確認用の SQL はこの定義に合わせて書く。\n\n# DB\n\n### dbo.orders\n</db_schema>\n');
    });
    test("表示: あり(文字数)/ なし", () => {
        assert.strictEqual((0, dbChecks_1.describeDbSchema)({ relativePath: "docs/db/schema.md", content: "x".repeat(1234) }), "あり(docs/db/schema.md、1,234 文字)");
        assert.strictEqual((0, dbChecks_1.describeDbSchema)(undefined), "なし(docs/db/schema.md がありません)");
    });
});
//# sourceMappingURL=dbChecks.test.js.map