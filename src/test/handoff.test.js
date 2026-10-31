"use strict";
/**
 * planHandoff(Copilot Chat への受け渡し)の単体テスト。
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
const handoff_1 = require("../handoff");
suite("planHandoff", () => {
    test("パックが上限以内ならパック全体を貼る(添付不要)", () => {
        assert.deepStrictEqual((0, handoff_1.planHandoff)("x".repeat(100), "prompt", 100), {
            kind: "paste-pack",
            text: "x".repeat(100),
        });
    });
    test("パックが上限を超えれば本文用テキストを貼る(パックは添付)", () => {
        assert.deepStrictEqual((0, handoff_1.planHandoff)("x".repeat(101), "prompt", 100), {
            kind: "paste-prompt",
            text: "prompt",
        });
    });
    test("パックが大きく本文用テキストも無ければ何も入れない", () => {
        assert.deepStrictEqual((0, handoff_1.planHandoff)("x".repeat(101), undefined, 100), { kind: "none" });
    });
    test("本文用テキストが無くても小さいパックは貼る", () => {
        assert.deepStrictEqual((0, handoff_1.planHandoff)("pack", undefined, 100), { kind: "paste-pack", text: "pack" });
    });
});
//# sourceMappingURL=handoff.test.js.map