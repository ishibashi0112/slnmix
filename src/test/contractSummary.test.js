"use strict";
/**
 * contractSummary の単体テスト。hybrid fixture の contract.schema.json
 * (webview2-bridge の gen が出したもの)を正として検証する。
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
const contractSummary_1 = require("../services/contractSummary");
const FIXTURES_ROOT = path.resolve(__dirname, "..", "..", "test-fixtures");
suite("contractSummary: summarizeContractSchema", () => {
    const schemaText = fs.readFileSync(path.join(FIXTURES_ROOT, "hybrid", "contract", "contract.schema.json"), "utf8");
    test("methods / events / types を一覧にする", () => {
        const result = (0, contractSummary_1.summarizeContractSchema)(schemaText);
        assert.ok(result.ok);
        assert.deepStrictEqual(result.lines, [
            "methods:",
            "- parts.search(input: { keyword: string; limit?: integer }) -> { items: Part[] }",
            "events:",
            "- progress(payload: { percent: number; message?: string })",
            "types:",
            "- Part { partNo: string; name: string; qty: integer; updatedAt: string(ISO 8601) }",
        ]);
        assert.strictEqual(result.methodCount, 1);
        assert.strictEqual(result.eventCount, 1);
        assert.strictEqual(result.typeCount, 1);
    });
    test("contractVersion が未知なら要約せず理由を返す", () => {
        const result = (0, contractSummary_1.summarizeContractSchema)(JSON.stringify({ contractVersion: 2, methods: {} }));
        assert.ok(!result.ok);
        assert.ok(result.reason.includes("contractVersion: 2"));
    });
    test("contractVersion がなければ未知の形式", () => {
        const result = (0, contractSummary_1.summarizeContractSchema)(JSON.stringify({ methods: {} }));
        assert.ok(!result.ok && result.reason.includes("なし"));
    });
    test("JSON でなければ理由付きで失敗(クラッシュしない)", () => {
        const result = (0, contractSummary_1.summarizeContractSchema)("not json");
        assert.ok(!result.ok && result.reason.includes("JSON"));
    });
    test("空の契約は (なし) を書く", () => {
        const result = (0, contractSummary_1.summarizeContractSchema)(JSON.stringify({ contractVersion: 1 }));
        assert.ok(result.ok);
        assert.deepStrictEqual(result.lines, [
            "methods:",
            "(なし)",
            "events:",
            "(なし)",
            "types:",
            "(なし)",
        ]);
    });
});
suite("contractSummary: renderType", () => {
    test("$ref は $defs の名前に、それ以外の参照は unknown に", () => {
        assert.strictEqual((0, contractSummary_1.renderType)({ $ref: "#/$defs/Part" }), "Part");
        assert.strictEqual((0, contractSummary_1.renderType)({ $ref: "#/other" }), "unknown(#/other)");
    });
    test("配列・enum・union・null 許容", () => {
        assert.strictEqual((0, contractSummary_1.renderType)({ type: "array", items: { type: "string" } }), "string[]");
        assert.strictEqual((0, contractSummary_1.renderType)({ type: "array", items: { anyOf: [{ type: "string" }, { type: "null" }] } }), "(string | null)[]");
        assert.strictEqual((0, contractSummary_1.renderType)({ enum: ["a", "b"] }), '"a" | "b"');
        assert.strictEqual((0, contractSummary_1.renderType)({ type: ["string", "null"] }), "string | null");
        assert.strictEqual((0, contractSummary_1.renderType)({ const: 1 }), "1");
    });
    test("Record と深い入れ子の打ち切り", () => {
        assert.strictEqual((0, contractSummary_1.renderType)({ type: "object", additionalProperties: { type: "number" } }), "Record<string, number>");
        const deep = {
            type: "object",
            properties: {
                a: { type: "object", properties: { b: { type: "object", properties: { c: { type: "string" } } } } },
            },
        };
        assert.strictEqual((0, contractSummary_1.renderType)(deep), "{ a?: { b?: {...} } }");
    });
    test("解釈できない形は unknown(推測しない)", () => {
        assert.strictEqual((0, contractSummary_1.renderType)({}), "unknown");
        assert.strictEqual((0, contractSummary_1.renderType)("string"), "unknown");
    });
});
//# sourceMappingURL=contractSummary.test.js.map