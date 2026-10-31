"use strict";
/**
 * slnmix.config.json(任意)の読み込み。
 *
 * ルート(.sln のあるディレクトリ)直下に置く。**なくても動く**。
 * ハイブリッド構成(WinForms + WebView2 + React)で、.vbproj に乗らない
 * web 側・契約側のディレクトリを同じパックへ入れるための設定。
 *
 * - extraRoots: 宣言されたディレクトリだけを走査する(ディレクトリ走査を
 *   しない原則の、明示的でスコープの狭い例外)
 * - contractSchema / generatedDirs: 同じ場所に webview2-bridge.gen.json が
 *   あれば自動検出して既定値にする。明示すれば上書き
 * - kind: "generic"(v0.17.0〜)で .sln / .vbproj のないプロジェクト(TypeScript 等)
 *   を extraRoots だけでパックする。既定は "solution"(従来どおり)
 *
 * 壊れた設定でもクラッシュせず、診断に残して設定なしとして続行する。
 * ファイルシステムは deps 注入(単体テスト可能)。
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
exports.CONFIG_KINDS = exports.GEN_CONFIG_FILE_NAME = exports.CONFIG_FILE_NAME = void 0;
exports.isConfigKind = isConfigKind;
exports.normalizeRootRelative = normalizeRootRelative;
exports.defaultIncludeFor = defaultIncludeFor;
exports.loadSlnmixConfig = loadSlnmixConfig;
const path = __importStar(require("path"));
const docTemplates_1 = require("./assets/docTemplates");
const globMatcher_1 = require("./globMatcher");
exports.CONFIG_FILE_NAME = "slnmix.config.json";
exports.GEN_CONFIG_FILE_NAME = "webview2-bridge.gen.json";
/**
 * プロジェクトの構成の種類。
 * - "solution": .sln / .vbproj の論理構成に基づく(既定。従来どおり)
 * - "generic": .sln / .vbproj を使わず、extraRoots に宣言されたディレクトリだけで
 *   パックする(VB.NET 以外のプロジェクト向け。v0.17.0〜)。引数なしの `npx slnmix`
 *   がこの設定を見て .sln の探索を省く。明示フラグにしたのは「.sln を探さなかった」
 *   理由をログで示すため(決定ログ 2026-10-10)
 */
exports.CONFIG_KINDS = ["solution", "generic"];
function isConfigKind(value) {
    return exports.CONFIG_KINDS.includes(value);
}
/** kind ごとの include 既定 */
const DEFAULT_INCLUDE = {
    web: ["**/*.{ts,tsx,js,jsx,css,json,html}"],
    /** VB.NET 以外のプロジェクトのソース(kind: "generic" の --init-config が使う) */
    src: ["**/*.{ts,tsx,js,jsx,mjs,cjs,css,scss,json,html,md}"],
    contract: ["**/*.ts"],
    /** 自動テスト(e2e/ 等)。kind: "test" があれば手順文に「自動テスト」の節が入る */
    test: ["**/*.{ts,tsx,json,md}"],
};
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function asString(value) {
    return typeof value === "string" ? value : undefined;
}
function asStringArray(value) {
    if (!Array.isArray(value) || !value.every((v) => typeof v === "string")) {
        return undefined;
    }
    return value;
}
/** ルート相対パスを `/` 区切り・末尾スラッシュなしに正規化 */
function normalizeRootRelative(value) {
    return (0, globMatcher_1.normalizeGlobPath)(value).replace(/\/+$/, "");
}
function parseJson(text) {
    return JSON.parse(text.replace(/^﻿/, ""));
}
function defaultIncludeFor(kind) {
    return [...(DEFAULT_INCLUDE[kind] ?? ["**/*"])];
}
function parseExtraRoots(value, diagnostics) {
    if (value === undefined) {
        return [];
    }
    if (!Array.isArray(value)) {
        diagnostics.push({
            severity: "warning",
            message: `${exports.CONFIG_FILE_NAME}: extraRoots は配列で指定してください(無視します)`,
        });
        return [];
    }
    const roots = [];
    value.forEach((entry, index) => {
        if (!isRecord(entry)) {
            diagnostics.push({
                severity: "warning",
                message: `${exports.CONFIG_FILE_NAME}: extraRoots[${index}] はオブジェクトで指定してください(無視します)`,
            });
            return;
        }
        const rawPath = asString(entry["path"]);
        if (rawPath === undefined || rawPath.trim() === "") {
            diagnostics.push({
                severity: "warning",
                message: `${exports.CONFIG_FILE_NAME}: extraRoots[${index}] に path がありません(無視します)`,
            });
            return;
        }
        const rootPath = normalizeRootRelative(rawPath);
        if (rootPath === "" || rootPath.startsWith("../") || path.isAbsolute(rawPath)) {
            diagnostics.push({
                severity: "warning",
                message: `${exports.CONFIG_FILE_NAME}: extraRoots[${index}].path はルート配下の相対パスで指定してください: ${rawPath}(無視します)`,
            });
            return;
        }
        const kind = asString(entry["kind"])?.trim() || "extra";
        const include = asStringArray(entry["include"]);
        if (entry["include"] !== undefined && include === undefined) {
            diagnostics.push({
                severity: "warning",
                message: `${exports.CONFIG_FILE_NAME}: extraRoots[${index}].include は文字列の配列で指定してください(既定を使います)`,
            });
        }
        const exclude = asStringArray(entry["exclude"]);
        if (entry["exclude"] !== undefined && exclude === undefined) {
            diagnostics.push({
                severity: "warning",
                message: `${exports.CONFIG_FILE_NAME}: extraRoots[${index}].exclude は文字列の配列で指定してください(無視します)`,
            });
        }
        roots.push({
            path: rootPath,
            kind,
            include: include !== undefined && include.length > 0 ? include : defaultIncludeFor(kind),
            exclude: exclude ?? [],
        });
    });
    return roots;
}
/**
 * webview2-bridge.gen.json から contractSchema / generatedDirs の既定値を取る。
 * 形式: { schemaOut, ts: { outDir }, vb: { outDir } }(いずれも任意)
 */
function readGenConfig(rootDir, deps, diagnostics) {
    const text = deps.readTextFile(path.join(rootDir, exports.GEN_CONFIG_FILE_NAME));
    if (text === undefined) {
        return undefined;
    }
    let parsed;
    try {
        parsed = parseJson(text);
    }
    catch (error) {
        diagnostics.push({
            severity: "warning",
            message: `${exports.GEN_CONFIG_FILE_NAME} を JSON として読めません(無視します): ${error instanceof Error ? error.message : String(error)}`,
        });
        return undefined;
    }
    if (!isRecord(parsed)) {
        return undefined;
    }
    const generatedDirs = [];
    for (const section of ["vb", "ts"]) {
        const sub = parsed[section];
        const outDir = isRecord(sub) ? asString(sub["outDir"]) : undefined;
        if (outDir !== undefined && outDir.trim() !== "") {
            generatedDirs.push(normalizeRootRelative(outDir));
        }
    }
    const schemaOut = asString(parsed["schemaOut"]);
    const contract = asString(parsed["contract"]);
    return {
        contractSchema: schemaOut !== undefined && schemaOut.trim() !== ""
            ? normalizeRootRelative(schemaOut)
            : undefined,
        contractFile: contract !== undefined && contract.trim() !== ""
            ? normalizeRootRelative(contract)
            : undefined,
        generatedDirs,
    };
}
/**
 * docs 設定を読む。`true` なら既定配置、オブジェクトなら各キーを既定に重ねる。
 * ルート外・絶対パスは警告して既定値に戻す(壊れた設定でも連携を落とさない)。
 */
function parseDocsConfig(value, diagnostics) {
    if (value === undefined || value === false || value === null) {
        return undefined;
    }
    if (value === true) {
        return { ...docTemplates_1.DEFAULT_DOCS_CONFIG };
    }
    if (!isRecord(value)) {
        diagnostics.push({
            severity: "warning",
            message: `${exports.CONFIG_FILE_NAME}: docs は true またはオブジェクトで指定してください(無視します)`,
        });
        return undefined;
    }
    const pick = (key) => {
        const raw = value[key];
        if (raw === undefined) {
            return docTemplates_1.DEFAULT_DOCS_CONFIG[key];
        }
        const text = asString(raw);
        if (text === undefined || text.trim() === "") {
            diagnostics.push({
                severity: "warning",
                message: `${exports.CONFIG_FILE_NAME}: docs.${key} は文字列で指定してください(既定 ${docTemplates_1.DEFAULT_DOCS_CONFIG[key]} を使います)`,
            });
            return docTemplates_1.DEFAULT_DOCS_CONFIG[key];
        }
        const normalized = normalizeRootRelative(text);
        if (normalized === "" || normalized.startsWith("../") || path.isAbsolute(text)) {
            diagnostics.push({
                severity: "warning",
                message: `${exports.CONFIG_FILE_NAME}: docs.${key} はルート配下の相対パスで指定してください: ${text}(既定 ${docTemplates_1.DEFAULT_DOCS_CONFIG[key]} を使います)`,
            });
            return docTemplates_1.DEFAULT_DOCS_CONFIG[key];
        }
        return normalized;
    };
    return { design: pick("design"), spec: pick("spec"), handoff: pick("handoff") };
}
/** `kind`: "solution" / "generic"。それ以外は警告して既定の "solution" */
function parseKind(value, diagnostics) {
    if (value === undefined) {
        return "solution";
    }
    const text = asString(value)?.trim();
    if (text !== undefined && isConfigKind(text)) {
        return text;
    }
    diagnostics.push({
        severity: "warning",
        message: `${exports.CONFIG_FILE_NAME}: kind は ${exports.CONFIG_KINDS.map((k) => `"${k}"`).join(" / ")} のいずれかを指定してください: ${String(value)}(既定の "solution" を使います)`,
    });
    return "solution";
}
const TARGET_EXTENSION = /\.(sln|vbproj)$/i;
/** `target`: ルート配下の相対パスで .sln / .vbproj を指す。それ以外は警告して無視 */
function parseTarget(value, diagnostics) {
    if (value === undefined) {
        return undefined;
    }
    const text = asString(value);
    if (text === undefined || text.trim() === "") {
        diagnostics.push({
            severity: "warning",
            message: `${exports.CONFIG_FILE_NAME}: target は文字列で指定してください(無視します)`,
        });
        return undefined;
    }
    const normalized = normalizeRootRelative(text);
    if (normalized === "" || normalized.startsWith("../") || path.isAbsolute(text)) {
        diagnostics.push({
            severity: "warning",
            message: `${exports.CONFIG_FILE_NAME}: target はルート配下の相対パスで指定してください: ${text}(無視します)`,
        });
        return undefined;
    }
    if (!TARGET_EXTENSION.test(normalized)) {
        diagnostics.push({
            severity: "warning",
            message: `${exports.CONFIG_FILE_NAME}: target は .sln / .vbproj を指定してください: ${text}(無視します)`,
        });
        return undefined;
    }
    return normalized;
}
/**
 * @param rootDir ルート(slnmix.config.json のあるディレクトリ。無ければ .sln / .vbproj のあるディレクトリ)の絶対パス
 */
function loadSlnmixConfig(rootDir, deps) {
    const diagnostics = [];
    const config = {
        kind: "solution",
        extraRoots: [],
        generatedDirs: [],
        sources: [],
    };
    let explicitSchema;
    let explicitContractFile;
    let explicitGenerated;
    const text = deps.readTextFile(path.join(rootDir, exports.CONFIG_FILE_NAME));
    if (text !== undefined) {
        let parsed;
        try {
            parsed = parseJson(text);
        }
        catch (error) {
            diagnostics.push({
                severity: "warning",
                message: `${exports.CONFIG_FILE_NAME} を JSON として読めません(設定なしとして続行): ${error instanceof Error ? error.message : String(error)}`,
            });
            parsed = undefined;
        }
        if (parsed !== undefined && !isRecord(parsed)) {
            diagnostics.push({
                severity: "warning",
                message: `${exports.CONFIG_FILE_NAME} のトップレベルはオブジェクトで指定してください(設定なしとして続行)`,
            });
            parsed = undefined;
        }
        if (isRecord(parsed)) {
            config.sources.push(exports.CONFIG_FILE_NAME);
            config.kind = parseKind(parsed["kind"], diagnostics);
            const target = parseTarget(parsed["target"], diagnostics);
            if (target !== undefined) {
                if (config.kind === "generic") {
                    diagnostics.push({
                        severity: "warning",
                        message: `${exports.CONFIG_FILE_NAME}: kind が "generic" のため target は使いません(無視します): ${target}`,
                    });
                }
                else {
                    config.target = target;
                }
            }
            config.extraRoots = parseExtraRoots(parsed["extraRoots"], diagnostics);
            if (config.kind === "generic" && config.extraRoots.length === 0) {
                diagnostics.push({
                    severity: "warning",
                    message: `${exports.CONFIG_FILE_NAME}: kind が "generic" のときは extraRoots に少なくとも 1 つのディレクトリが必要です(出力対象がありません)`,
                });
            }
            config.docs = parseDocsConfig(parsed["docs"], diagnostics);
            const schema = asString(parsed["contractSchema"]);
            if (schema !== undefined && schema.trim() !== "") {
                explicitSchema = normalizeRootRelative(schema);
            }
            const contractFile = asString(parsed["contractFile"]);
            if (contractFile !== undefined && contractFile.trim() !== "") {
                explicitContractFile = normalizeRootRelative(contractFile);
            }
            const generated = asStringArray(parsed["generatedDirs"]);
            if (parsed["generatedDirs"] !== undefined && generated === undefined) {
                diagnostics.push({
                    severity: "warning",
                    message: `${exports.CONFIG_FILE_NAME}: generatedDirs は文字列の配列で指定してください(無視します)`,
                });
            }
            if (generated !== undefined) {
                explicitGenerated = generated
                    .map(normalizeRootRelative)
                    .filter((dir) => dir !== "");
            }
        }
    }
    const gen = readGenConfig(rootDir, deps, diagnostics);
    if (gen !== undefined) {
        config.sources.push(exports.GEN_CONFIG_FILE_NAME);
    }
    config.contractSchema = explicitSchema ?? gen?.contractSchema;
    config.contractFile = explicitContractFile ?? gen?.contractFile;
    config.generatedDirs = explicitGenerated ?? gen?.generatedDirs ?? [];
    return { config, diagnostics };
}
//# sourceMappingURL=slnmixConfig.js.map