import * as assert from "node:assert";
import { run, type RunDeps } from "../cli";
import { planForward } from "../forward";

suite("slnmix → tazuna の引数の読み替え", () => {
  test("引数なし・入力とオプションは tazuna pack に渡す", () => {
    assert.deepStrictEqual(planForward([]), {
      kind: "forward",
      args: ["pack"],
      notice: "[slnmix] slnmix は tazuna に統合されました。同じ処理を npx tazuna pack で実行します(今後は npx tazuna pack を使ってください)。",
    });
    const plan = planForward(["MyApp.sln", "--task", "init", "--no-clip"]);
    assert.strictEqual(plan.kind, "forward");
    assert.deepStrictEqual(plan.kind === "forward" ? plan.args : [], ["pack", "MyApp.sln", "--task", "init", "--no-clip"]);
  });

  test("init / build はそのまま tazuna の init / build に渡す", () => {
    const init = planForward(["init", "--yes", "--no-repomix"]);
    assert.deepStrictEqual(init.kind === "forward" ? init.args : [], ["init", "--yes", "--no-repomix"]);
    assert.ok(init.kind === "forward" && init.notice.includes("npx tazuna init"));
    const build = planForward(["build", "--configuration", "Release"]);
    assert.deepStrictEqual(build.kind === "forward" ? build.args : [], ["build", "--configuration", "Release"]);
    assert.ok(build.kind === "forward" && build.notice.includes("npx tazuna build"));
  });

  test("build という名前のフォルダは ./build と書けば入力として tazuna pack に渡る", () => {
    const plan = planForward(["./build"]);
    assert.deepStrictEqual(plan.kind === "forward" ? plan.args : [], ["pack", "./build"]);
  });

  test("--version は自分で答える(tazuna pack は受け付けない)", () => {
    assert.deepStrictEqual(planForward(["--version"]), { kind: "version" });
    assert.deepStrictEqual(planForward(["MyApp.sln", "-v"]), { kind: "version" });
  });
});

suite("slnmix の起動", () => {
  function fakeDeps(exitCode = 0): RunDeps & { calls: string[][]; out: string[]; err: string[] } {
    const calls: string[][] = [];
    const out: string[] = [];
    const err: string[] = [];
    return {
      calls,
      out,
      err,
      locateTazuna: () => ({ cliPath: "/x/node_modules/tazuna/dist/cli.js", version: "0.15.0" }),
      ownVersion: () => "0.23.0",
      spawn: (command, args) => {
        calls.push([command, ...args]);
        return exitCode;
      },
      stdout: (line) => out.push(line),
      stderr: (line) => err.push(line),
    };
  }

  test("tazuna の CLI を同じ node で起動し、終了コードを返す。統合の案内は標準エラーへ", () => {
    const deps = fakeDeps(3);
    assert.strictEqual(run(["--stdout"], deps), 3);
    assert.deepStrictEqual(deps.calls, [[process.execPath, "/x/node_modules/tazuna/dist/cli.js", "pack", "--stdout"]]);
    assert.deepStrictEqual(deps.out, []);
    assert.strictEqual(deps.err.length, 1);
  });

  test("--version は起動せずに版を出す", () => {
    const deps = fakeDeps();
    assert.strictEqual(run(["--version"], deps), 0);
    assert.deepStrictEqual(deps.calls, []);
    assert.deepStrictEqual(deps.out, ["0.23.0(tazuna 0.15.0 を呼びます)"]);
  });

  test("tazuna が見つからなければ案内して 1", () => {
    const deps = fakeDeps();
    deps.locateTazuna = () => {
      throw new Error("Cannot find module 'tazuna/package.json'");
    };
    assert.strictEqual(run([], deps), 1);
    assert.deepStrictEqual(deps.calls, []);
    assert.ok(deps.err[0]?.includes("npx tazuna"));
  });
});
