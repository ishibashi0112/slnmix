"use strict";
/**
 * 規約文(protocol.md)の解決と出力末尾への連結。
 *
 * petari(AI チャットの返答をローカルへ適用する CLI)は、AI に changes.md
 * 規約を守らせるための規約文の正本を持ち、`petari init` がプロジェクト直下へ
 * protocol.md として書き出す。slnmix はこれを出力末尾に <instruction> として
 * 連結し、AI へ渡すコンテキストに規約を含める(本家 repomix の
 * instructionFilePath 相当)。
 *
 * - 既定: 入力(.sln / .vbproj)と同じディレクトリの protocol.md を探す
 *   (.gitignore の探索や出力先の既定と同じく、ここをプロジェクトルートと
 *   みなす)。なければ規約文なしで通常の出力をする
 * - --instruction-file 指定時: そのファイルを使う(読めなければエラー)
 * - 規約文は slnmix に同梱しない(petari 側の更新へ再ビルドなしで追従する)
 *
 * ファイルシステムは deps 注入とし、単体テスト可能に保つ(CLI 固有機能の
 * ため共有コアには含めない)。
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
exports.INSTRUCTION_NOTICE = exports.DEFAULT_INSTRUCTION_FILE_NAME = void 0;
exports.resolveInstructionFile = resolveInstructionFile;
exports.prependInstructionNotice = prependInstructionNotice;
exports.appendBlock = appendBlock;
exports.appendInstruction = appendInstruction;
const path = __importStar(require("path"));
exports.DEFAULT_INSTRUCTION_FILE_NAME = "protocol.md";
/**
 * @param explicitPath --instruction-file の値(省略時 undefined)
 * @param rootDir 既定の protocol.md を探すディレクトリ(ルート)
 * @param cwd 実行時のカレントディレクトリ(explicitPath の解決基準)
 */
function resolveInstructionFile(explicitPath, rootDir, cwd, deps) {
    if (explicitPath !== undefined) {
        const absolutePath = path.resolve(cwd, explicitPath);
        const content = deps.readTextFile(absolutePath);
        if (content === undefined) {
            return {
                kind: "error",
                message: `--instruction-file のファイルを読み込めません: ${absolutePath}`,
            };
        }
        return { kind: "found", path: absolutePath, content };
    }
    const searchedPath = path.join(rootDir, exports.DEFAULT_INSTRUCTION_FILE_NAME);
    const content = deps.readTextFile(searchedPath);
    if (content === undefined) {
        return { kind: "none", searchedPath };
    }
    return { kind: "found", path: searchedPath, content };
}
/**
 * 出力先頭に付けるリマインダ文(サンドイッチ配置の先頭側)。
 *
 * チャットサービスが長文添付を要約・検索で処理すると末尾の規約文が
 * モデルに届かないことがあるため、保持されやすい冒頭に「末尾を見ろ」という
 * ポインタを置く。文面は petari 規約文 v2 以降と同じく「ユーザー本人からの
 * 指示」と自己宣言する設計。protocol.md の中身には依存しないため、
 * petari 側の規約文更新への追従は不要。
 */
exports.INSTRUCTION_NOTICE = `[このファイルを添付したユーザー本人からの恒常的な指示]
この添付の末尾に、コード変更を提案する際の出力規約(changes.md 形式)が
instruction ブロックとして含まれています。この会話でコードの変更を提案する
ときは、チャット本文で個別に言及されていなくても、必ず末尾の規約に従って
changes.md を出力してください。
`;
/**
 * 規約文が見つかったときだけ、出力の最先頭(repomix 互換ヘッダーより前)に
 * リマインダ文を付ける。規約文なしなら本文をそのまま返す(従来と同一の出力)。
 * appendInstruction と対で使い、末尾全文とのサンドイッチ配置にする。
 */
function prependInstructionNotice(content, instruction) {
    if (instruction.kind !== "found") {
        return content;
    }
    return `${exports.INSTRUCTION_NOTICE}\n${content}`;
}
/**
 * 出力本文の末尾にテキストを <tag> ブロックとして連結する。
 * テキストは一字一句そのまま(整形・エスケープなし)。本文との間には空行を
 * 挟み、閉じタグが独立行になるよう末尾の改行だけ補う。
 * <task> / <plan> / <procedure>(procedureFile.ts)も同じ形で連結する。
 */
function appendBlock(content, tag, text) {
    const body = text.endsWith("\n") ? text : `${text}\n`;
    const separator = content.endsWith("\n") ? "\n" : "\n\n";
    return `${content}${separator}<${tag}>\n${body}</${tag}>\n`;
}
/** 出力本文の末尾に規約文を <instruction> ブロックとして連結する */
function appendInstruction(content, instructionText) {
    return appendBlock(content, "instruction", instructionText);
}
//# sourceMappingURL=instructionFile.js.map