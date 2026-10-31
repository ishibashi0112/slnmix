"use strict";
/**
 * .gitignore / .repomixignore の評価(Repomix エクスポート用)。
 *
 * 本家 repomix と同様に、ignore ファイルへ一致するファイルを
 * エクスポート対象から除外するための判定を行う。
 * パターンマッチングは git 仕様の実装として実績のある ignore パッケージに任せ、
 * 自前実装による仕様差を避ける。
 *
 * 探索範囲:
 * - 対象ファイルのディレクトリから上位へ ignore ファイルを収集する
 * - `.git` があるディレクトリ(リポジトリルート)で探索を打ち切る
 * - `.git` が見つからない場合は、基準ディレクトリ(.sln / .vbproj の場所)
 *   配下の ignore ファイルのみ適用する(無関係な上位フォルダの巻き込み防止)
 * - 近い ignore ファイルほど優先し、`!` による除外解除にも対応(git の仕様)
 *
 * ファイルシステムは deps 注入とし、単体テスト可能に保つ。
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
exports.GitignoreEvaluator = void 0;
const path = __importStar(require("path"));
const ignore = require("ignore");
/** 対象とする ignore ファイル名(本家 repomix と同じ組) */
const IGNORE_FILE_NAMES = [".gitignore", ".repomixignore"];
/** 上方向探索の上限(異常なパス構造での無限ループ防止) */
const MAX_WALK_UP = 64;
function cacheKey(directory) {
    return directory.toLowerCase();
}
/** child が base 配下(base 自身を含む)かどうか(大文字小文字は無視) */
function isWithin(base, child) {
    const rel = path.relative(base.toLowerCase(), child.toLowerCase());
    return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}
/** ignore パッケージ用の相対 POSIX パスへ変換(範囲外なら undefined) */
function toPosixRelative(fromDir, filePath) {
    const rel = path.relative(fromDir, filePath);
    if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) {
        return undefined;
    }
    return rel.split(path.sep).join("/");
}
class GitignoreEvaluator {
    deps;
    baseDir;
    dirCache = new Map();
    chainCache = new Map();
    constructor(deps, 
    /** .sln / .vbproj のあるディレクトリ(.git 不在時の探索境界) */
    baseDir) {
        this.deps = deps;
        this.baseDir = baseDir;
    }
    /**
     * ファイルが ignore 対象なら、根拠となった ignore ファイルのパスを返す。
     * 対象外なら undefined。
     */
    ignoreReasonFor(absoluteFilePath) {
        const chain = this.chainFor(path.dirname(absoluteFilePath));
        // 近い ignore ファイルの判定を優先する(git の仕様に合わせる)
        for (const entry of chain) {
            const rel = toPosixRelative(entry.directory, absoluteFilePath);
            if (rel === undefined) {
                continue;
            }
            const verdict = entry.matcher.test(rel);
            if (verdict.unignored) {
                return undefined;
            }
            if (verdict.ignored) {
                return entry.sourceFiles;
            }
        }
        return undefined;
    }
    /** ディレクトリから上方向へ、適用すべき ignore ファイルを近い順に集める */
    chainFor(fileDir) {
        const key = cacheKey(fileDir);
        const cached = this.chainCache.get(key);
        if (cached !== undefined) {
            return cached;
        }
        const directories = [];
        let repoRootFound = false;
        let current = fileDir;
        for (let depth = 0; depth < MAX_WALK_UP; depth++) {
            directories.push(current);
            if (this.deps.directoryExists(path.join(current, ".git"))) {
                repoRootFound = true;
                break;
            }
            const parent = path.dirname(current);
            if (parent === current) {
                break;
            }
            current = parent;
        }
        // .git が無い場合は基準ディレクトリ配下のみを対象にする
        const effective = repoRootFound
            ? directories
            : directories.filter((dir) => isWithin(this.baseDir, dir));
        const chain = [];
        for (const dir of effective) {
            const entry = this.dirIgnoreOf(dir);
            if (entry !== undefined) {
                chain.push(entry);
            }
        }
        this.chainCache.set(key, chain);
        return chain;
    }
    /** 1 ディレクトリ分の ignore ファイルを読み、マッチャーを作る(キャッシュ付き) */
    dirIgnoreOf(directory) {
        const key = cacheKey(directory);
        if (this.dirCache.has(key)) {
            return this.dirCache.get(key);
        }
        let content = "";
        const sources = [];
        for (const name of IGNORE_FILE_NAMES) {
            const filePath = path.join(directory, name);
            const text = this.deps.readTextFileIfExists(filePath);
            if (text !== undefined) {
                content += `${text}\n`;
                sources.push(filePath);
            }
        }
        const entry = content.trim() === ""
            ? undefined
            : {
                directory,
                matcher: ignore({ ignorecase: true }).add(content),
                sourceFiles: sources.join(", "),
            };
        this.dirCache.set(key, entry);
        return entry;
    }
}
exports.GitignoreEvaluator = GitignoreEvaluator;
//# sourceMappingURL=gitignoreService.js.map