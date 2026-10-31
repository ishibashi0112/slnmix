"use strict";
/**
 * initConfig(--init-config)の単体テスト。ファイルシステムは fake を注入する。
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
const initConfig_1 = require("../initConfig");
const ROOT = path.resolve("/work/tsproj");
/** dirs: ルート相対のディレクトリ名。files: ルート直下のファイル名(内容は空) */
function fakeFs(dirs, files = []) {
    const fileMap = new Map(files.map((name) => [path.join(ROOT, name), ""]));
    const dirSet = new Set([ROOT, ...dirs.map((d) => path.join(ROOT, d))]);
    return {
        files: fileMap,
        deps: {
            isDirectory: (p) => dirSet.has(path.resolve(p)),
            isFile: (p) => fileMap.has(path.resolve(p)),
            listFileNames: (p) => path.resolve(p) === ROOT
                ? [...fileMap.keys()].map((k) => path.basename(k))
                : undefined,
            writeTextFile: (p, content) => {
                fileMap.set(path.resolve(p), content);
            },
        },
    };
}
suite("initConfig", () => {
    test("src と tests があれば両方を extraRoots に書く(kind は src / test)", () => {
        const fs = fakeFs(["src", "tests", "node_modules", "dist"], ["package.json"]);
        const result = (0, initConfig_1.initConfig)(ROOT, fs.deps);
        assert.strictEqual(result.kind, "created");
        if (result.kind !== "created")
            return;
        assert.strictEqual(result.path, path.join(ROOT, "slnmix.config.json"));
        assert.deepStrictEqual(result.roots, [
            { path: "src", kind: "src" },
            { path: "tests", kind: "test" },
        ]);
        assert.deepStrictEqual(JSON.parse(result.content), {
            kind: "generic",
            extraRoots: [
                { path: "src", kind: "src" },
                { path: "tests", kind: "test" },
            ],
        });
        assert.strictEqual(fs.files.get(path.join(ROOT, "slnmix.config.json")), result.content);
        assert.ok(result.content.endsWith("}\n"), "末尾は改行で終える");
    });
    test("候補は実在するものだけ(src のみなら test は書かない)", () => {
        const result = (0, initConfig_1.initConfig)(ROOT, fakeFs(["src"]).deps);
        assert.ok(result.kind === "created");
        assert.deepStrictEqual(result.roots, [{ path: "src", kind: "src" }]);
    });
    test("複数の候補(app と e2e)も拾う。順序は候補名の順", () => {
        const result = (0, initConfig_1.initConfig)(ROOT, fakeFs(["e2e", "app", "lib"]).deps);
        assert.ok(result.kind === "created");
        assert.deepStrictEqual(result.roots, [
            { path: "app", kind: "src" },
            { path: "lib", kind: "src" },
            { path: "e2e", kind: "test" },
        ]);
    });
    test("既に slnmix.config.json があれば変えない(冪等)", () => {
        const fs = fakeFs(["src"], ["slnmix.config.json"]);
        fs.files.set(path.join(ROOT, "slnmix.config.json"), '{ "kind": "solution" }');
        const result = (0, initConfig_1.initConfig)(ROOT, fs.deps);
        assert.deepStrictEqual(result, { kind: "kept", path: path.join(ROOT, "slnmix.config.json") });
        assert.strictEqual(fs.files.get(path.join(ROOT, "slnmix.config.json")), '{ "kind": "solution" }');
    });
    test(".sln / .vbproj がある場所では作らない(solution 構成で動くため)", () => {
        const fs = fakeFs(["src"], ["App.sln", "readme.txt"]);
        const result = (0, initConfig_1.initConfig)(ROOT, fs.deps);
        assert.ok(result.kind === "error" && result.message.includes("App.sln"));
        assert.ok(!fs.files.has(path.join(ROOT, "slnmix.config.json")));
    });
    test("ソースの候補ディレクトリが無ければ推測で書かずエラー + 設定例", () => {
        const fs = fakeFs(["docs", "tests"]);
        const result = (0, initConfig_1.initConfig)(ROOT, fs.deps);
        assert.ok(result.kind === "error");
        assert.ok(result.message.includes("見つかりません"));
        assert.ok(result.message.includes(initConfig_1.EXAMPLE_CONFIG));
        assert.ok(!fs.files.has(path.join(ROOT, "slnmix.config.json")));
    });
});
//# sourceMappingURL=initConfig.test.js.map