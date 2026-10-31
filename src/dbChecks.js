"use strict";
/**
 * AI チャットだけでの DB 確認・動作検証(手順文 v8 / v9、2026-10-13)。
 *
 * ルート直下の docs/db/schema.md(ashiato schema の出力。テスト用 DB の
 * テーブル定義で、行の値は含まない)があるときだけ、パックに <db_schema> として
 * 入れ、手順文に「DB の確認」「動作検証」の節を足す(procedure.ts の DB_SECTIONS)。
 * AI は確認用の SELECT を checks/*.sql で、操作と期待する DB の変化を
 * checks/*.verify.md で出し、ユーザーが ashiato query / ashiato verify で
 * 実行して結果をチャットに貼る。slnmix 自身は DB に接続しない。
 *
 * 本文用テキストには入れない(テーブルが多いと貼付の上限を超えるため。
 * 添付の中のデータは検索で参照される)。ファイルシステムは deps 注入。
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
exports.resolveDbSchema = resolveDbSchema;
exports.renderDbSchemaBlock = renderDbSchemaBlock;
exports.describeDbSchema = describeDbSchema;
const path = __importStar(require("path"));
const procedure_1 = require("./assets/procedure");
/** ルートの docs/db/schema.md を読む。なければ undefined(DB の確認は無効) */
function resolveDbSchema(rootDir, deps) {
    const content = deps.readTextFile(path.resolve(rootDir, ...procedure_1.DB_SCHEMA_PATH.split("/")));
    return content === undefined ? undefined : { relativePath: procedure_1.DB_SCHEMA_PATH, content };
}
function escapeAttribute(value) {
    return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
/**
 * <db_schema> ブロック(閉じタグ・末尾改行込み)。
 * @param transform 認証情報マスク等(文書と同じ変換を通す)
 */
function renderDbSchemaBlock(schema, transform = (t) => t) {
    const body = transform(schema.content).replace(/\r?\n$/, "");
    return `<db_schema path="${escapeAttribute(schema.relativePath)}">\nテスト用 DB のテーブル定義(ashiato schema の出力。行の値は含まない)。確認用の SQL はこの定義に合わせて書く。\n\n${body}\n</db_schema>\n`;
}
/** CLI の 1 行表示用 */
function describeDbSchema(schema) {
    return schema === undefined
        ? `なし(${procedure_1.DB_SCHEMA_PATH} がありません)`
        : `あり(${schema.relativePath}、${schema.content.length.toLocaleString("en-US")} 文字)`;
}
//# sourceMappingURL=dbChecks.js.map