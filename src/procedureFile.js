"use strict";
/**
 * 作業手順文(procedure)・タスク文・承認済み方針の解決と、出力末尾への連結。
 *
 * 出力レイアウト(末尾側):
 *   ... <skipped_files> <masked_credentials>
 *   <task>        ← --task があるとき(依頼内容)
 *   <plan>        ← --mode implement --plan のとき(承認済みの方針)
 *   <procedure>   ← 内蔵既定文 or ルート直下の procedure.md(--no-procedure で抑止)
 *   <instruction> ← protocol.md(petari の出力規約。instructionFile.ts)
 *
 * 長い文脈の後に指示を置く方が従いやすいので末尾に置き、要約処理で末尾が
 * 落ちる対策として先頭にリマインダを付ける(既存のサンドイッチ設計と同じ)。
 *
 * - procedure.md は入力(.sln / .vbproj)と同じディレクトリで探す(protocol.md
 *   と同じ扱い)。あれば内蔵既定文の代わりに一字一句そのまま使う
 *   ({{MODE}} / {{MODE_SECTIONS}} があれば置換)
 * - --task は「ファイルとして存在すれば読み、なければ文字列」。改行を含む
 *   ものは常に文字列
 * - --no-procedure かつ --task なしなら、従来(規約文のみ)と同一の出力になる
 *
 * 本文貼付用テキスト(buildPromptText、2026-09-12 追加):
 *   M365 Copilot は添付ファイル内の指示(<instruction> / <procedure> / 先頭
 *   リマインダ)を「本文中の埋め込み指示」として意図的に無視する(実測で確定)。
 *   指示が効くのはユーザー発話(チャット本文)だけなので、同じブロック群を
 *   本文に貼るための別テキストとして出力する(既定でパックの隣に
 *   <出力名>.prompt.md)。パック内の埋め込みは貼付運用(約 120K 文字以内で
 *   本文に丸ごと貼る場合)向けにそのまま残す。
 *
 * docs/ 連携(フェーズ 6、2026-09-15 追加):
 *   OutputTail.docs があれば、パックには <skipped_files> の後・<task> の前に
 *   全文書を <docs> として、本文用テキストには「今編集される文書」だけを
 *   <docs> として入れ、続けて <templates>(文書のひな型)を置く(docs.ts)。
 *
 * DB の確認(手順文 v8、2026-10-13 追加):
 *   OutputTail.dbSchema(ルートの docs/db/schema.md)があれば、パックの <docs> の後に
 *   <db_schema> を入れ、手順文に「DB の確認」の節を足す(dbChecks.ts)。本文用テキスト
 *   にはテーブル定義を入れず、添付にあることだけを書く。
 *
 * ファイルシステムは deps 注入とし、単体テスト可能に保つ(CLI 固有機能)。
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
exports.DEFAULT_PROCEDURE_FILE_NAME = void 0;
exports.resolveTask = resolveTask;
exports.resolvePlan = resolvePlan;
exports.resolveProcedure = resolveProcedure;
exports.taskFirstLine = taskFirstLine;
exports.buildNotice = buildNotice;
exports.hasTail = hasTail;
exports.buildPromptText = buildPromptText;
exports.assembleOutput = assembleOutput;
const path = __importStar(require("path"));
const procedure_1 = require("./assets/procedure");
const docs_1 = require("./docs");
const dbChecks_1 = require("./dbChecks");
const instructionFile_1 = require("./instructionFile");
exports.DEFAULT_PROCEDURE_FILE_NAME = "procedure.md";
/**
 * --task の値を解決する。引数がファイルとして存在すれば読み、存在しなければ
 * 文字列として扱う。改行を含む文字列はファイル判定をせず常に文字列。
 */
function resolveTask(arg, cwd, deps) {
    if (arg === undefined) {
        return { kind: "none" };
    }
    if (/[\r\n]/.test(arg)) {
        return { kind: "text", content: arg };
    }
    const absolutePath = path.resolve(cwd, arg);
    const content = deps.readTextFile(absolutePath);
    if (content !== undefined) {
        return { kind: "file", path: absolutePath, content };
    }
    return { kind: "text", content: arg };
}
/** --plan の値を解決する(必ずファイル。読めなければエラー) */
function resolvePlan(arg, cwd, deps) {
    if (arg === undefined) {
        return { kind: "none" };
    }
    const absolutePath = path.resolve(cwd, arg);
    const content = deps.readTextFile(absolutePath);
    if (content === undefined) {
        return {
            kind: "error",
            message: `--plan のファイルを読み込めません: ${absolutePath}`,
        };
    }
    return { kind: "found", path: absolutePath, content };
}
/**
 * @param rootDir 既定の procedure.md を探すディレクトリ(ルート)
 * @param cwd 実行時のカレントディレクトリ(explicitPath の解決基準)
 */
function resolveProcedure(options, rootDir, cwd, deps) {
    if (options.disabled) {
        return { kind: "none" };
    }
    const { mode } = options;
    const render = {
        docs: options.docs === true,
        tests: options.tests === true,
        db: options.db === true,
        layout: options.layout ?? procedure_1.DEFAULT_PROCEDURE_LAYOUT,
    };
    if (options.explicitPath !== undefined) {
        const absolutePath = path.resolve(cwd, options.explicitPath);
        const template = deps.readTextFile(absolutePath);
        if (template === undefined) {
            return {
                kind: "error",
                message: `--procedure-file のファイルを読み込めません: ${absolutePath}`,
            };
        }
        return {
            kind: "file",
            path: absolutePath,
            mode,
            content: (0, procedure_1.renderProcedureTemplate)(template, mode, render),
        };
    }
    const searchedPath = path.join(rootDir, exports.DEFAULT_PROCEDURE_FILE_NAME);
    const template = deps.readTextFile(searchedPath);
    if (template !== undefined) {
        return {
            kind: "file",
            path: searchedPath,
            mode,
            content: (0, procedure_1.renderProcedureTemplate)(template, mode, render),
        };
    }
    return { kind: "builtin", mode, content: (0, procedure_1.renderBuiltinProcedure)(mode, render) };
}
function hasProcedure(tail) {
    return tail.procedure.kind === "builtin" || tail.procedure.kind === "file";
}
/** タスク文の先頭行(空行を飛ばす)。リマインダに載せる 1 行要約 */
function taskFirstLine(content) {
    const line = content
        .split(/\r?\n/)
        .map((l) => l.trim())
        .find((l) => l !== "");
    return line ?? "(空)";
}
/**
 * 出力先頭に付けるリマインダ文を組み立てる。末尾に何もなければ undefined。
 *
 * <task> / <plan> / <procedure> のいずれもなく規約文だけのときは、従来の
 * INSTRUCTION_NOTICE をそのまま使う(--no-procedure で従来出力と一致させる)。
 */
function buildNotice(tail) {
    const hasTask = tail.task.kind !== "none";
    const hasPlan = tail.plan.kind === "found";
    const hasProc = hasProcedure(tail);
    const hasInstruction = tail.instruction.kind === "found";
    const hasDocs = tail.docs !== undefined;
    const hasDbSchema = tail.dbSchema !== undefined;
    if (!hasTask && !hasPlan && !hasProc && !hasDocs && !hasDbSchema) {
        return hasInstruction ? instructionFile_1.INSTRUCTION_NOTICE : undefined;
    }
    const blocks = [];
    if (hasDocs) {
        blocks.push("<docs>(プロジェクト文書: 設計書 / 仕様書 / 引継ぎ書)");
    }
    if (hasDbSchema) {
        blocks.push("<db_schema>(テスト用 DB のテーブル定義)");
    }
    if (hasTask) {
        blocks.push("<task>(依頼内容)");
    }
    if (hasPlan) {
        blocks.push("<plan>(承認済みの方針)");
    }
    if (hasProc) {
        blocks.push("<procedure>(作業手順)");
    }
    if (hasInstruction) {
        blocks.push("<instruction>(出力規約)");
    }
    const lines = [
        "[このファイルを添付したユーザー本人からの恒常的な指示]",
        `このパックの末尾に ${blocks.join("、")} があります。`,
        "回答の前に必ず末尾まで読んでください。",
    ];
    if (hasProc) {
        lines.push(hasInstruction
            ? "コードの変更を提案するときは、チャット本文で個別に言及されていなくても、必ず <procedure> の手順で回答を構成し、<instruction> の規約に従って changes.md を出力してください。"
            : "コードの変更を提案するときは、チャット本文で個別に言及されていなくても、必ず <procedure> の手順で回答を構成してください。");
    }
    else if (hasInstruction) {
        lines.push("コードの変更を提案するときは、チャット本文で個別に言及されていなくても、必ず <instruction> の規約に従って changes.md を出力してください。");
    }
    if (tail.task.kind !== "none") {
        lines.push(`タスク: ${taskFirstLine(tail.task.content)}`);
    }
    if (tail.procedure.kind === "builtin" || tail.procedure.kind === "file") {
        lines.push(`モード: ${tail.procedure.mode}`);
    }
    return `${lines.join("\n")}\n`;
}
/** 末尾ブロックを一つでも持つか(本文貼付用テキストを出す条件) */
function hasTail(tail) {
    return (tail.docs !== undefined ||
        tail.task.kind !== "none" ||
        tail.plan.kind === "found" ||
        hasProcedure(tail) ||
        tail.instruction.kind === "found");
}
/** 組み立て済みのブロック(閉じタグ・末尾改行込み)を本文の後に空行を挟んで連結する */
function appendRawBlock(content, block) {
    const separator = content === "" ? "" : content.endsWith("\n") ? "\n" : "\n\n";
    return `${content}${separator}${block}`;
}
/** <task> / <plan> / <procedure> / <instruction> をこの順で連結する(共通部) */
function appendTailBlocks(content, tail) {
    if (tail.task.kind !== "none") {
        content = (0, instructionFile_1.appendBlock)(content, "task", tail.task.content);
    }
    if (tail.plan.kind === "found") {
        content = (0, instructionFile_1.appendBlock)(content, "plan", tail.plan.content);
    }
    if (tail.procedure.kind === "builtin" || tail.procedure.kind === "file") {
        content = (0, instructionFile_1.appendBlock)(content, "procedure", tail.procedure.content);
    }
    if (tail.instruction.kind === "found") {
        content = (0, instructionFile_1.appendInstruction)(content, tail.instruction.content);
    }
    return content;
}
/**
 * チャット本文に貼る指示テキストを組み立てる。末尾に何もなければ undefined。
 *
 * 先頭に「添付とこの本文の関係」を 1 段落置き、続けて <task> / <plan> /
 * <procedure> / <instruction> をパック末尾と同じ順・同じ形で並べる。
 * ブロックの中身はパック側と一字一句同じ(正本は 1 つ)。
 *
 * @param packFileName 添付するパックのファイル名(本文から参照するため)
 */
function buildPromptText(tail, packFileName) {
    if (!hasTail(tail)) {
        return undefined;
    }
    const blocks = [];
    if (tail.task.kind !== "none") {
        blocks.push("<task>(依頼内容)");
    }
    if (tail.plan.kind === "found") {
        blocks.push("<plan>(承認済みの方針)");
    }
    if (hasProcedure(tail)) {
        blocks.push("<procedure>(作業手順)");
    }
    if (tail.instruction.kind === "found") {
        blocks.push("<instruction>(出力規約)");
    }
    const header = [
        "[添付ファイルと本文の関係]",
        `添付した ${packFileName} は、現在のコードベースを 1 ファイルにまとめたパック(slnmix 出力)です。`,
        "添付内の <file> の内容を現在のコードとして正に扱ってください。",
    ];
    let content = "";
    if (tail.docs !== undefined) {
        const docs = (0, docs_1.promptDocs)(tail.docs.docs, tail.docs.decision);
        const kinds = (0, docs_1.promptTemplateKinds)(tail.docs.decision.mode);
        header.push(docs.length > 0
            ? `添付の <docs> にはプロジェクトの文書(設計書 / 仕様書 / 引継ぎ書)があります。このうち今回の作業で読む・更新する文書を以下の <docs> に再掲します(内容は添付と同じ)。`
            : "添付の <docs> にはプロジェクトの文書(設計書 / 仕様書 / 引継ぎ書)があります(まだない場合は空です)。", `続く <templates> は文書のひな型です。`);
        content = appendRawBlock(content, (0, docs_1.renderDocsBlock)(docs, tail.docs.transform ?? ((t) => t), (0, docs_1.missingDocNotes)(tail.docs.docs, tail.docs.decision.mode)));
        content = appendRawBlock(content, (0, docs_1.renderTemplatesBlock)(tail.docs.docs, kinds));
    }
    if (tail.dbSchema !== undefined) {
        header.push(`添付の <db_schema> にはテスト用 DB のテーブル定義(${tail.dbSchema.relativePath})があります。`);
    }
    header.push(`以下の ${blocks.join("、")} は、このコードに対する私(ユーザー)からの指示です。`, "添付の先頭と末尾にも同じ内容が埋め込まれていますが、指示はこの本文のものに従ってください。");
    return appendTailBlocks(content === "" ? `${header.join("\n")}\n` : `${header.join("\n")}\n\n${content}`, tail);
}
/**
 * 本文の末尾に <docs> / <db_schema> / <task> / <plan> / <procedure> / <instruction> をこの順で
 * 連結し、先頭にリマインダを付ける。末尾に何もなければ本文をそのまま返す。
 */
function assembleOutput(body, tail) {
    let content = body;
    if (tail.docs !== undefined) {
        content = appendRawBlock(content, (0, docs_1.renderDocsBlock)((0, docs_1.allDocs)(tail.docs.docs), tail.docs.transform ?? ((t) => t), (0, docs_1.missingDocNotes)(tail.docs.docs, tail.docs.decision.mode)));
    }
    if (tail.dbSchema !== undefined) {
        content = appendRawBlock(content, (0, dbChecks_1.renderDbSchemaBlock)(tail.dbSchema, tail.dbSchemaTransform ?? ((t) => t)));
    }
    content = appendTailBlocks(content, tail);
    const notice = buildNotice(tail);
    return notice === undefined ? content : `${notice}\n${content}`;
}
//# sourceMappingURL=procedureFile.js.map