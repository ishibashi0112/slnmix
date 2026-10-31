"use strict";
/**
 * initDocs(--init-docs)の単体テスト。ファイルシステムは fake を注入する。
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
const docTemplates_1 = require("../assets/docTemplates");
const initDocs_1 = require("../initDocs");
const ROOT = path.resolve("/work/repo");
function fakeFs(files = {}, dirs = []) {
    const fileMap = new Map(Object.entries(files).map(([p, c]) => [path.resolve(ROOT, p), c]));
    const dirSet = new Set(dirs.map((d) => path.resolve(ROOT, d)));
    return {
        files: fileMap,
        dirs: dirSet,
        deps: {
            exists: (p) => fileMap.has(path.resolve(p)) || dirSet.has(path.resolve(p)),
            readTextFile: (p) => fileMap.get(path.resolve(p)),
            writeTextFile: (p, content) => {
                fileMap.set(path.resolve(p), content);
            },
            makeDirectory: (p) => {
                dirSet.add(path.resolve(p));
            },
        },
    };
}
function rel(fs, kind) {
    const keys = kind === "files" ? [...fs.files.keys()] : [...fs.dirs];
    return keys.map((k) => path.relative(ROOT, k).split(path.sep).join("/")).sort();
}
suite("initDocs", () => {
    test("何もない状態: config を作り、docs/design と docs/spec と README を作る", () => {
        const fs = fakeFs();
        const result = (0, initDocs_1.initDocs)(ROOT, fs.deps);
        assert.deepStrictEqual(result.errors, []);
        assert.deepStrictEqual(result.kept, []);
        assert.deepStrictEqual(result.created, [
            "slnmix.config.json",
            "docs/design/",
            "docs/spec/",
            "docs/README.md",
        ]);
        assert.deepStrictEqual(rel(fs, "dirs"), ["docs/design", "docs/spec"]);
        assert.deepStrictEqual(JSON.parse(fs.files.get(path.join(ROOT, "slnmix.config.json"))), { docs: { design: "docs/design", spec: "docs/spec", handoff: "docs/HANDOFF.md" } });
        assert.strictEqual(fs.files.get(path.join(ROOT, "docs", "README.md")), docTemplates_1.DOCS_README);
    });
    test("既存の config には docs だけ追記し、他のキーを保つ", () => {
        const fs = fakeFs({
            "slnmix.config.json": '﻿{\n  "extraRoots": [{ "path": "apps/web", "kind": "web" }]\n}\n',
        });
        const result = (0, initDocs_1.initDocs)(ROOT, fs.deps);
        assert.deepStrictEqual(result.errors, []);
        assert.strictEqual(result.created[0], "slnmix.config.json (docs 設定を追記)");
        const parsed = JSON.parse(fs.files.get(path.join(ROOT, "slnmix.config.json")));
        assert.deepStrictEqual(parsed["extraRoots"], [{ path: "apps/web", kind: "web" }]);
        assert.deepStrictEqual(parsed["docs"], { design: "docs/design", spec: "docs/spec", handoff: "docs/HANDOFF.md" });
    });
    test("2 回目は何も変えない(冪等)", () => {
        const fs = fakeFs();
        (0, initDocs_1.initDocs)(ROOT, fs.deps);
        const before = new Map(fs.files);
        const result = (0, initDocs_1.initDocs)(ROOT, fs.deps);
        assert.deepStrictEqual(result.created, []);
        assert.deepStrictEqual(result.kept, [
            "slnmix.config.json (docs 設定済み)",
            "docs/design/",
            "docs/spec/",
            "docs/README.md",
        ]);
        assert.deepStrictEqual([...fs.files.entries()], [...before.entries()]);
    });
    test("docs 設定が独自の配置なら、その配置でディレクトリを作る", () => {
        const fs = fakeFs({
            "slnmix.config.json": '{ "docs": { "design": "doc/design", "spec": "doc/spec", "handoff": "doc/H.md" } }',
        });
        const result = (0, initDocs_1.initDocs)(ROOT, fs.deps);
        assert.deepStrictEqual(result.created, ["doc/design/", "doc/spec/", "doc/README.md"]);
    });
    test("壊れた config は上書きせずエラーで止まる(ディレクトリも作らない)", () => {
        const fs = fakeFs({ "slnmix.config.json": "{ broken" });
        const result = (0, initDocs_1.initDocs)(ROOT, fs.deps);
        assert.strictEqual(result.errors.length, 1);
        assert.deepStrictEqual(result.created, []);
        assert.strictEqual(fs.files.get(path.join(ROOT, "slnmix.config.json")), "{ broken");
        assert.strictEqual(fs.dirs.size, 0);
    });
});
//# sourceMappingURL=initDocs.test.js.map