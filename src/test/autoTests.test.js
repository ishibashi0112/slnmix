"use strict";
/**
 * 自動テストの有無の判定(autoTests)の単体テスト。
 * 手順文 v6 の「自動テスト」の節を入れるかどうかは、この判定だけで決まる。
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
const autoTests_1 = require("../autoTests");
suite("autoTests: isAutoTestPath", () => {
    test("e2e/ で始まる、または /e2e/ を含むパス", () => {
        assert.ok((0, autoTests_1.isAutoTestPath)("e2e/screen/order.spec.ts"));
        assert.ok((0, autoTests_1.isAutoTestPath)("e2e/fixtures/db.ts"));
        assert.ok((0, autoTests_1.isAutoTestPath)("apps/web/e2e/api/parts.spec.ts"));
        assert.ok((0, autoTests_1.isAutoTestPath)("apps\\web\\e2e\\host\\order.spec.ts"), "区切りが \\ でも同じ");
    });
    test("末尾が .spec.ts / .spec.tsx / .test.ts / .test.tsx", () => {
        assert.ok((0, autoTests_1.isAutoTestPath)("apps/web/src/format.test.ts"));
        assert.ok((0, autoTests_1.isAutoTestPath)("apps/web/src/Order.test.tsx"));
        assert.ok((0, autoTests_1.isAutoTestPath)("tests/order.spec.ts"));
        assert.ok((0, autoTests_1.isAutoTestPath)("tests/Order.spec.tsx"));
        assert.ok((0, autoTests_1.isAutoTestPath)("Tests/Order.Spec.TS"), "大文字小文字は区別しない");
    });
    test("該当しないパス(e2e という名前を含むだけ、拡張子違い、VB)", () => {
        assert.ok(!(0, autoTests_1.isAutoTestPath)("App/Forms/OrderForm.vb"));
        assert.ok(!(0, autoTests_1.isAutoTestPath)("apps/web/src/App.tsx"));
        assert.ok(!(0, autoTests_1.isAutoTestPath)("apps/web/src/e2e-helper.ts"), "e2e/ というディレクトリではない");
        assert.ok(!(0, autoTests_1.isAutoTestPath)("me2e/x.ts"));
        assert.ok(!(0, autoTests_1.isAutoTestPath)("apps/web/src/spec.ts"));
        assert.ok(!(0, autoTests_1.isAutoTestPath)("apps/web/src/order.test.js"), ".js は対象外");
        assert.ok(!(0, autoTests_1.isAutoTestPath)("apps/web/src/order.spec.ts.bak"));
    });
});
suite("autoTests: detectAutoTests", () => {
    test("パックにも extraRoots にも無ければ「なし」(旧 WinForms のみのプロジェクト)", () => {
        const result = (0, autoTests_1.detectAutoTests)(["App/Forms/OrderForm.vb", "App/Module1.vb", "App/App.config"], [{ kind: "web" }, { kind: "contract" }]);
        assert.deepStrictEqual(result, { present: false, matchedPaths: [], testRoot: false });
        assert.strictEqual((0, autoTests_1.describeAutoTests)(result), "なし");
    });
    test("パック内のテストファイルで「あり」。一致したパスを出力順に持つ", () => {
        const result = (0, autoTests_1.detectAutoTests)([
            "App/Forms/OrderForm.vb",
            "apps/web/src/App.tsx",
            "apps/web/src/format.test.ts",
            "e2e/screen/order.spec.ts",
        ], [{ kind: "web" }]);
        assert.strictEqual(result.present, true);
        assert.deepStrictEqual(result.matchedPaths, [
            "apps/web/src/format.test.ts",
            "e2e/screen/order.spec.ts",
        ]);
        assert.strictEqual(result.testRoot, false);
        assert.strictEqual((0, autoTests_1.describeAutoTests)(result), "あり(パック内に apps/web/src/format.test.ts ほか 1 件)");
    });
    test("extraRoots の kind: \"test\" だけでも「あり」(ディレクトリが空でも意識づけはする)", () => {
        const result = (0, autoTests_1.detectAutoTests)(["App/Module1.vb"], [{ kind: "web" }, { kind: "test" }]);
        assert.deepStrictEqual(result, { present: true, matchedPaths: [], testRoot: true });
        assert.strictEqual((0, autoTests_1.describeAutoTests)(result), 'あり(extraRoots に kind: "test")');
    });
    test("両方あれば理由を併記。1 件なら「ほか」を付けない", () => {
        const result = (0, autoTests_1.detectAutoTests)(["e2e/api/parts.spec.ts"], [{ kind: "test" }]);
        assert.strictEqual((0, autoTests_1.describeAutoTests)(result), 'あり(パック内に e2e/api/parts.spec.ts / extraRoots に kind: "test")');
    });
    test("kind は完全一致(tests / Test は対象外。推測しない)", () => {
        assert.strictEqual((0, autoTests_1.detectAutoTests)([], [{ kind: "tests" }]).present, false);
        assert.strictEqual((0, autoTests_1.detectAutoTests)([], [{ kind: "Test" }]).present, false);
    });
});
//# sourceMappingURL=autoTests.test.js.map