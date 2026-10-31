"use strict";
/**
 * `slnmix build` のエラー整形(v0.20.0、設計書 §22)。純粋関数のみ
 * (MSBuild の起動は msbuildRunner.ts、ファイル読み取りは deps)。
 *
 * MSBuild のログ(標準のエラー形式)からエラーを取り出し、Copilot Chat に貼って
 * 修正を頼める文面にする。各エラーには今の実ファイルの周辺行を付ける
 * (パックを作った後に petari で書き換わっていることが多く、AI が古い内容で
 * SEARCH を書くと petari の適用に失敗するため)。
 * 抜粋・エラーの本文・ログの末尾・ファイルとして読めないエラーの発生元は、パックと同じ規則で
 * 認証情報らしき値を [MASKED] に伏せる (この文面も AI に貼るため。v0.22.2)。抜粋はファイル全体を
 * 伏せてから切り出し (行の位置は元のまま)、パックが .gitignore で除外するファイルの抜粋は載せない。
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
exports.parseMsbuildErrors = parseMsbuildErrors;
exports.resolveErrorFile = resolveErrorFile;
exports.displayPath = displayPath;
exports.maskValues = maskValues;
exports.buildErrorReport = buildErrorReport;
const path = __importStar(require("path"));
const credentialMasker_1 = require("./services/credentialMasker");
/**
 * MSBuild の標準のエラー形式:
 *   origin[(location)] : [subcategory] error|warning code : text [project]
 * 先頭の "12>"(並列ビルドのノード番号)と字下げは無視する。
 * error / warning の語はローカライズされない(本文は日本語になる)
 */
const CANONICAL = /^\s*(?:\d+>)?\s*(.+?)(?:\(([\d,-]+)\))?\s*:\s*(?:[^:]*?\s)?error\s+([A-Za-z]+\d+)\s*:\s*(.*?)\s*(?:\[([^\]]+)\])?\s*$/;
function parseMsbuildErrors(log) {
    const errors = [];
    const seen = new Set();
    for (const raw of log.split(/\r?\n/)) {
        const m = CANONICAL.exec(raw);
        if (m === null) {
            continue;
        }
        const [, origin = "", location, code = "", message = "", project] = m;
        // location は (行) / (行-行) / (行,列) / (行,列-列) / (行,列,行,列)
        const [lineText, columnText] = (location ?? "").split(",");
        const toNumber = (text) => {
            const n = Number.parseInt((text ?? "").split("-")[0] ?? "", 10);
            return Number.isFinite(n) ? n : undefined;
        };
        const line = toNumber(lineText);
        const column = toNumber(columnText);
        // MSBuild は同じエラーを本文と末尾の一覧で 2 回出すことがある
        const key = [origin, line, column, code, message].join("\u0000");
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        errors.push({
            origin: origin.trim(),
            ...(line !== undefined ? { line } : {}),
            ...(column !== undefined ? { column } : {}),
            code,
            message,
            ...(project !== undefined ? { project } : {}),
        });
    }
    return errors;
}
/** ファイルを指すエラーか(ツール名の origin は含まない) */
function looksLikePath(origin) {
    return /[\\/]/.test(origin) || /\.[A-Za-z0-9]+$/.test(origin);
}
/** Windows の絶対パス(C:\ / \\server)か */
function isWindowsAbsolute(p) {
    return /^[A-Za-z]:[\\/]/.test(p) || p.startsWith("\\\\");
}
/** エラーのファイルの絶対パス(相対ならプロジェクトの場所を基準にする) */
function resolveErrorFile(error) {
    if (!looksLikePath(error.origin)) {
        return undefined;
    }
    const p = error.origin;
    if (isWindowsAbsolute(p)) {
        return path.win32.normalize(p);
    }
    if (path.isAbsolute(p)) {
        return path.normalize(p);
    }
    if (error.project === undefined) {
        return undefined;
    }
    const pathApi = isWindowsAbsolute(error.project) ? path.win32 : path;
    return pathApi.resolve(pathApi.dirname(error.project), p);
}
/** ルート相対の / 区切り(パックの <file path> と同じ形)。ルートの外なら絶対パスのまま */
function displayPath(absolute, rootDir) {
    const pathApi = isWindowsAbsolute(absolute) || isWindowsAbsolute(rootDir) ? path.win32 : path;
    const rel = pathApi.relative(rootDir, absolute);
    if (rel === "" || rel.startsWith("..") || pathApi.isAbsolute(rel)) {
        return absolute;
    }
    return rel.split(pathApi.sep).join("/");
}
const DEFAULT_MAX_ERRORS = 20;
const DEFAULT_CONTEXT_LINES = 4;
/** 拡張子 → コードフェンスの言語名(読みやすさのためだけ) */
function fenceLanguage(file) {
    const ext = path.extname(file).toLowerCase();
    return ext === ".vb" ? "vb" : ext === ".cs" ? "csharp" : "";
}
function renderExcerpt(lines, target, context) {
    const start = Math.max(1, target - context);
    const end = Math.min(lines.length, target + context);
    const width = String(end).length;
    const out = [];
    for (let n = start; n <= end; n++) {
        const mark = n === target ? ">" : " ";
        out.push(`${mark} ${String(n).padStart(width)} │${lines[n - 1] ?? ""}`);
    }
    return out;
}
const isWordChar = (ch) => ch !== undefined && /[A-Za-z0-9_]/.test(ch);
/**
 * 文面の中の values を [MASKED] に伏せる(長いものから)。英数字で始まる・終わる値は、前後が英数字で
 * ない位置だけ(短い値が別の語の一部を伏せないように)
 */
function maskValues(text, values) {
    let out = text;
    for (const value of [...values].sort((a, b) => b.length - a.length)) {
        let from = 0;
        let result = "";
        for (;;) {
            const at = out.indexOf(value, from);
            if (at < 0)
                break;
            const end = at + value.length;
            const bounded = (!isWordChar(value[0]) || !isWordChar(out[at - 1])) &&
                (!isWordChar(value[value.length - 1]) || !isWordChar(out[end]));
            result += out.slice(from, at) + (bounded ? credentialMasker_1.MASK_TOKEN : value);
            from = end;
        }
        out = result + out.slice(from);
    }
    return out;
}
/**
 * Copilot Chat に貼る文面。エラーが 1 件も取り出せなかったときは
 * ログの末尾をそのまま載せる(MSBuild 自体が動かなかった等)
 */
function buildErrorReport(errors, logTail, options) {
    const maxErrors = options.maxErrors ?? DEFAULT_MAX_ERRORS;
    const context = options.contextLines ?? DEFAULT_CONTEXT_LINES;
    const mask = options.mask;
    const maskText = (text) => mask === undefined ? text : (0, credentialMasker_1.maskCredentials)(text, { vbSource: false, strict: mask.strict }).content;
    const parts = [
        "## ビルドエラー",
        "",
        `slnmix build でビルドしたところ、エラーが ${errors.length} 件出ました。` +
            "修正を、これまでと同じ規約の changes.md で出してください。",
        "",
        "- 抜粋は今の実ファイルの内容です。パックの内容と食い違うときは、抜粋が正です",
        "- SEARCH には抜粋の「│」より右側をそのままコピーしてください(行頭の > と行番号は含めません)",
        "- 先頭のエラーが原因で後続のエラーが出ていることがあります。先頭から確かめてください",
        ...(mask === undefined
            ? []
            : ["- 認証情報らしき値は [MASKED] に伏せています。[MASKED] はそのまま残し、値を推測しないでください"]),
    ];
    if (errors.length === 0) {
        parts.push("", "エラーの行を取り出せませんでした。ビルドのログの末尾を載せます。", "", "```", maskText(logTail.trimEnd()), "```");
        return parts.join("\n") + "\n";
    }
    // 同じファイルのエラーが続くことが多いので、伏せた行はファイルごとに 1 回だけ作る
    const maskedFiles = new Map();
    // 抜粋で伏せた値。エラーの本文がその値を引用することがある(引用符を忘れた値が識別子として
    // 報告されるなど)ため、本文からも伏せる。null = 対応づけられないファイルがあった
    let fileValues = new Set();
    const linesOf = (file) => {
        if (!maskedFiles.has(file)) {
            const lines = options.readLines(file);
            if (lines !== undefined && mask !== undefined) {
                const values = (0, credentialMasker_1.maskedValuesForDisplay)(lines, { path: file, strict: mask.strict });
                if (values === null)
                    fileValues = null;
                else
                    for (const value of values)
                        fileValues?.add(value);
            }
            maskedFiles.set(file, lines === undefined || mask === undefined
                ? lines
                : (0, credentialMasker_1.maskLinesForDisplay)(lines, { path: file, strict: mask.strict }));
        }
        return maskedFiles.get(file);
    };
    const shown = errors.slice(0, maxErrors);
    // 本文を伏せる前に、載せるエラーのファイルをすべて読んでおく
    for (const error of shown) {
        const file = resolveErrorFile(error);
        if (file !== undefined)
            linesOf(file);
    }
    const maskMessage = (text) => {
        if (mask === undefined)
            return text;
        const values = fileValues;
        if (values === null) {
            // どの値を伏せたか分からないファイルがあるときは、VB のソースとしての伏せ方も重ねる
            return (0, credentialMasker_1.maskCredentials)(maskText(text), { vbSource: true, strict: mask.strict }).content;
        }
        return maskValues(maskText(text), [...values]);
    };
    shown.forEach((error, index) => {
        const file = resolveErrorFile(error);
        const lines = file === undefined ? undefined : linesOf(file);
        const located = file === undefined
            ? error.origin
            : `${displayPath(file, options.rootDir)}${error.line !== undefined ? `:${error.line}` : ""}`;
        // 読めるファイルのパスはそのまま。ファイルでない発生元(パスに見える接続文字列など)は伏せる
        const where = lines === undefined ? maskText(located) : located;
        parts.push("", `### ${index + 1}. ${where} — ${error.code}`, maskMessage(error.message));
        if (file === undefined || error.line === undefined) {
            return;
        }
        if (options.excludedBy?.(file) !== undefined) {
            parts.push("", "(.gitignore / .repomixignore でパックから除外しているファイルのため、抜粋は載せません)");
            return;
        }
        if (lines === undefined || error.line > lines.length) {
            parts.push("", "(ファイルを読めなかったため抜粋はありません)");
            return;
        }
        parts.push("", "```" + fenceLanguage(file), ...renderExcerpt(lines, error.line, context), "```");
    });
    if (errors.length > shown.length) {
        parts.push("", `(ほかに ${errors.length - shown.length} 件のエラーは省略しました)`);
    }
    return parts.join("\n") + "\n";
}
//# sourceMappingURL=buildErrors.js.map