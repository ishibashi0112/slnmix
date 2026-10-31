"use strict";
/**
 * extraRootsCollector の単体テスト。ファイルシステムは fake を注入する。
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
const path = __importStar(require("path"));
const extraRootsCollector_1 = require("../services/extraRootsCollector");
const slnmixConfig_1 = require("../slnmixConfig");
const ROOT = path.resolve("/work/repo");
function fakeDeps(filesByDir, ignored = []) {
    return {
        listFilesRecursive: (dir) => {
            const rel = path.relative(ROOT, dir).split(path.sep).join("/");
            const files = filesByDir[rel];
            return files?.map((f) => path.join(dir, ...f.split("/")));
        },
        ignoreReasonFor: (abs) => ignored.some((i) => abs.endsWith(i)) ? path.join(ROOT, ".gitignore") : undefined,
    };
}
function webRoot(overrides = {}) {
    return {
        path: "apps/web",
        kind: "web",
        include: (0, slnmixConfig_1.defaultIncludeFor)("web"),
        exclude: [],
        ...overrides,
    };
}
suite("extraRootsCollector", () => {
    test("include の既定に一致するファイルだけを集め、ルート相対パスで返す", () => {
        const result = (0, extraRootsCollector_1.collectExtraRoots)(ROOT, [webRoot()], fakeDeps({
            "apps/web": ["src/App.tsx", "src/api.ts", "index.html", "README.md", "src/a.css"],
        }));
        assert.deepStrictEqual(result.files.map((f) => f.relativePath), ["apps/web/index.html", "apps/web/src/a.css", "apps/web/src/api.ts", "apps/web/src/App.tsx"]);
        assert.ok(result.files.every((f) => f.kind === "web" && f.rootPath === "apps/web"));
        assert.ok(result.files.every((f) => path.isAbsolute(f.absolutePath)));
        assert.ok(result.diagnostics.some((d) => d.message.includes("include 対象外 1 件")));
    });
    test("node_modules / dist / build / .vite / *.map / .env* は include に関わらず除外(件数のみ診断)", () => {
        const result = (0, extraRootsCollector_1.collectExtraRoots)(ROOT, [webRoot({ include: ["**/*"] })], fakeDeps({
            "apps/web": [
                "src/App.tsx",
                "node_modules/react/index.js",
                "dist/assets/index.js",
                "build/x.js",
                ".vite/deps/x.js",
                "src/App.tsx.map",
                ".env",
                ".env.local",
                "src/.env.production",
            ],
        }));
        assert.deepStrictEqual(result.files.map((f) => f.relativePath), ["apps/web/src/App.tsx"]);
        assert.strictEqual(result.skipped.length, 0);
        assert.ok(result.diagnostics.some((d) => d.message.includes("既定の除外 8 件")));
    });
    test("exclude・バイナリ・.gitignore は理由付きで skipped に載る", () => {
        const result = (0, extraRootsCollector_1.collectExtraRoots)(ROOT, [webRoot({ include: ["**/*"], exclude: ["src/generated/**"] })], fakeDeps({
            "apps/web": ["src/App.tsx", "src/generated/contract.ts", "public/logo.png", "src/local.ts"],
        }, ["local.ts"]));
        assert.deepStrictEqual(result.files.map((f) => f.relativePath), ["apps/web/src/App.tsx"]);
        assert.deepStrictEqual(result.skipped.map((s) => [s.relativePath, s.reason.split("(")[0]]), [
            ["apps/web/src/generated/contract.ts", "extraRoots の exclude に一致"],
            ["apps/web/public/logo.png", "バイナリ拡張子"],
            ["apps/web/src/local.ts", ".gitignore により除外"],
        ]);
    });
    test("走査できないディレクトリは警告してスキップ(他のルートは続行)", () => {
        const result = (0, extraRootsCollector_1.collectExtraRoots)(ROOT, [webRoot({ path: "missing" }), webRoot({ path: "contract", kind: "contract", include: ["**/*.ts"] })], fakeDeps({ contract: ["contract.ts"] }));
        assert.deepStrictEqual(result.files.map((f) => f.relativePath), ["contract/contract.ts"]);
        assert.ok(result.diagnostics.some((d) => d.severity === "warning" && d.message.includes("missing")));
    });
});
//# sourceMappingURL=extraRootsCollector.test.js.map