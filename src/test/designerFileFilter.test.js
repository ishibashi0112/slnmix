"use strict";
/**
 * designerFileFilter の単体テスト(CLI 固有・共有コア外)。
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
const designerFileFilter_1 = require("../designerFileFilter");
suite("designerFileFilter: buildDesignerFileMatcher", () => {
    test("ファイル名の全体一致で含める(パスが違っても一致)", () => {
        const matcher = (0, designerFileFilter_1.buildDesignerFileMatcher)(["OrderForm.Designer.vb"]);
        assert.strictEqual(matcher("Forms\\OrderForm.Designer.vb"), true);
        assert.strictEqual(matcher("OrderForm.Designer.vb"), true);
        assert.strictEqual(matcher("Forms\\OtherForm.Designer.vb"), false);
    });
    test("論理パスの全体一致でも含める", () => {
        const matcher = (0, designerFileFilter_1.buildDesignerFileMatcher)(["Forms\\OrderForm.Designer.vb"]);
        assert.strictEqual(matcher("Forms\\OrderForm.Designer.vb"), true);
        assert.strictEqual(matcher("Sub\\Forms\\OrderForm.Designer.vb"), false);
    });
    test("大文字小文字は区別しない(Windows のファイル名前提)", () => {
        const matcher = (0, designerFileFilter_1.buildDesignerFileMatcher)(["orderform.designer.vb"]);
        assert.strictEqual(matcher("Forms\\OrderForm.Designer.vb"), true);
    });
    test("* は任意の文字列にマッチする", () => {
        const matcher = (0, designerFileFilter_1.buildDesignerFileMatcher)(["Order*"]);
        assert.strictEqual(matcher("Forms\\OrderForm.Designer.vb"), true);
        assert.strictEqual(matcher("Forms\\OrderForm.resx"), true);
        assert.strictEqual(matcher("My Project\\Application.Designer.vb"), false);
    });
    test("部分一致では含めない(前方一致には * が必要)", () => {
        const matcher = (0, designerFileFilter_1.buildDesignerFileMatcher)(["OrderForm"]);
        assert.strictEqual(matcher("Forms\\OrderForm.Designer.vb"), false);
    });
    test("パターンの / は \\ として扱う", () => {
        const matcher = (0, designerFileFilter_1.buildDesignerFileMatcher)(["Forms/OrderForm.Designer.vb"]);
        assert.strictEqual(matcher("Forms\\OrderForm.Designer.vb"), true);
    });
    test("複数パターンはいずれかに一致すれば含める", () => {
        const matcher = (0, designerFileFilter_1.buildDesignerFileMatcher)([
            "OrderForm.Designer.vb",
            "Application.*",
        ]);
        assert.strictEqual(matcher("Forms\\OrderForm.Designer.vb"), true);
        assert.strictEqual(matcher("My Project\\Application.Designer.vb"), true);
        assert.strictEqual(matcher("Forms\\OtherForm.Designer.vb"), false);
    });
    test("正規表現のメタ文字はそのままの文字として扱う", () => {
        const matcher = (0, designerFileFilter_1.buildDesignerFileMatcher)(["Form(1).Designer.vb"]);
        assert.strictEqual(matcher("Form(1).Designer.vb"), true);
        assert.strictEqual(matcher("Form1x.Designer.vb"), false);
    });
    test("パターンが空なら何も含めない", () => {
        const matcher = (0, designerFileFilter_1.buildDesignerFileMatcher)([]);
        assert.strictEqual(matcher("Forms\\OrderForm.Designer.vb"), false);
    });
});
//# sourceMappingURL=designerFileFilter.test.js.map