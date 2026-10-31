"use strict";
/**
 * slnmix.config.json の extraRoots(.vbproj に乗らない web / 契約ディレクトリ)
 * からファイルを集める。
 *
 * 「ディレクトリ走査をしない」原則の、明示的でスコープの狭い例外。
 * 宣言されたディレクトリだけを走査し、include / exclude グロブ(globMatcher)
 * と既定の除外(node_modules / dist / build / .vite / *.map / .env* /
 * バイナリ拡張子 / .gitignore)を適用する。
 *
 * 除外したものは理由付きで skipped に残す(黙って捨てない)。ただし
 * node_modules 等の「既定で必ず除外」は件数だけ診断に残す(数千件になるため)。
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
exports.ALWAYS_EXCLUDE_GLOBS = void 0;
exports.collectExtraRoots = collectExtraRoots;
const path = __importStar(require("path"));
const globMatcher_1 = require("../globMatcher");
const binaryExtensions_1 = require("./binaryExtensions");
/** include に関わらず常に除外するパターン(追加ルートのディレクトリ基準) */
exports.ALWAYS_EXCLUDE_GLOBS = [
    "**/node_modules/**",
    "**/dist/**",
    "**/build/**",
    "**/.vite/**",
    "**/*.map",
    "**/.env",
    "**/.env.*",
];
const ALWAYS_EXCLUDE_REGEXPS = exports.ALWAYS_EXCLUDE_GLOBS.map(globMatcher_1.globToRegExp);
/**
 * @param rootDir ルートの絶対パス(extraRoots[].path の基準)
 */
function collectExtraRoots(rootDir, roots, deps) {
    const files = [];
    const skipped = [];
    const diagnostics = [];
    for (const root of roots) {
        const absoluteRoot = path.resolve(rootDir, ...root.path.split("/"));
        const listed = deps.listFilesRecursive(absoluteRoot);
        if (listed === undefined) {
            diagnostics.push({
                severity: "warning",
                message: `extraRoots のディレクトリを走査できません(スキップ): ${root.path}`,
            });
            continue;
        }
        const includeRegExps = root.include.map(globMatcher_1.globToRegExp);
        const excludeRegExps = root.exclude.map(globMatcher_1.globToRegExp);
        let alwaysExcludedCount = 0;
        let notIncludedCount = 0;
        const collected = [];
        for (const absolutePath of listed) {
            const relativeToRoot = (0, globMatcher_1.normalizeGlobPath)(path.relative(absoluteRoot, absolutePath));
            if (relativeToRoot === "" || relativeToRoot.startsWith("../")) {
                continue;
            }
            const relativePath = `${root.path}/${relativeToRoot}`;
            if (ALWAYS_EXCLUDE_REGEXPS.some((re) => re.test(relativeToRoot))) {
                alwaysExcludedCount += 1;
                continue;
            }
            if (!includeRegExps.some((re) => re.test(relativeToRoot))) {
                notIncludedCount += 1;
                continue;
            }
            if (excludeRegExps.some((re) => re.test(relativeToRoot))) {
                skipped.push({ relativePath, reason: "extraRoots の exclude に一致" });
                continue;
            }
            if ((0, binaryExtensions_1.isBinaryExtension)(path.basename(absolutePath))) {
                skipped.push({ relativePath, reason: "バイナリ拡張子" });
                continue;
            }
            const ignoreSource = deps.ignoreReasonFor?.(absolutePath);
            if (ignoreSource !== undefined) {
                skipped.push({ relativePath, reason: `.gitignore により除外(${ignoreSource})` });
                continue;
            }
            collected.push({ kind: root.kind, rootPath: root.path, relativePath, absolutePath });
        }
        collected.sort((a, b) => a.relativePath.toLowerCase().localeCompare(b.relativePath.toLowerCase()));
        files.push(...collected);
        diagnostics.push({
            severity: "info",
            message: `extraRoots [${root.kind}] ${root.path}: ${collected.length} 件(既定の除外 ${alwaysExcludedCount} 件、include 対象外 ${notIncludedCount} 件)`,
        });
    }
    return { files, skipped, diagnostics };
}
//# sourceMappingURL=extraRootsCollector.js.map