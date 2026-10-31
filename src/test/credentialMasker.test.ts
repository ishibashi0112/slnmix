/**
 * credentialMasker の単体テスト。
 * 実業務プロジェクト(NBOM040)で実際に検出された形を含む
 * VB レガシーコードのパターンで検証する。
 */

import * as assert from "assert";
import { maskCredentials, maskLinesForDisplay } from "../services/credentialMasker";

const VB = { vbSource: true };
const GENERIC = { vbSource: false };

suite("credentialMasker: VB 変数代入リテラル", () => {
	test("パスワード系変数への代入をマスクする(実例由来)", () => {
		const result = maskCredentials(
			'Public Pub_KMSS_DB_Pswd As String = "inf001"',
			VB,
		);
		assert.strictEqual(
			result.content,
			'Public Pub_KMSS_DB_Pswd As String = "[MASKED]"',
		);
		assert.strictEqual(result.findings[0].kind, "パスワード");
	});

	test("ユーザーID系変数への代入をマスクする(実例由来)", () => {
		const result = maskCredentials('wk_Bics_User = "komori"', VB);
		assert.strictEqual(result.content, 'wk_Bics_User = "[MASKED]"');
		assert.strictEqual(result.findings[0].kind, "ユーザーID");
	});

	test("変数・式からの代入(リテラルでない)は触らない", () => {
		const code = 'Pub_DB_Para_Nbom.DB_Pswd = wk_DbPara(1)';
		assert.strictEqual(maskCredentials(code, VB).content, code);
	});

	test("空文字リテラルは触らない", () => {
		const code = 'Public Pub_LoginUserName As String = ""';
		assert.strictEqual(maskCredentials(code, VB).content, code);
	});

	test("認証と無関係な変数名は触らない", () => {
		const code = [
			'ComboBox_Unit.ValueMember = "UNIT_ID"',
			'wk_Row("UNIT_ID") = ""',
			'.ActiveSheet.Columns(0).Label = "ﾕﾆｯﾄｺｰﾄﾞ"',
			'Pub_KMSS_DB_Conn As String = "KSIS01"',
		].join("\n");
		assert.strictEqual(maskCredentials(code, VB).content, code);
	});
});

suite("credentialMasker: VB 文字列リテラル内の接続文字列", () => {
	test("PWD= / User ID= の値をマスクする(実例由来)", () => {
		const code = [
			'wk_ConStr = wk_ConStr & "Server=SSDB01;"',
			'wk_ConStr = wk_ConStr & "User ID=sales_admin;"',
			'wk_ConStr = wk_ConStr & "PWD=kss2015_Admin;"',
			'wk_ConStr = wk_ConStr & "Initial Catalog=kss;"',
		].join("\n");
		const result = maskCredentials(code, VB);
		assert.ok(result.content.includes('"User ID=[MASKED];"'));
		assert.ok(result.content.includes('"PWD=[MASKED];"'));
		// サーバー名・カタログ名は認証情報ではないため残す
		assert.ok(result.content.includes('"Server=SSDB01;"'));
		assert.ok(result.content.includes('"Initial Catalog=kss;"'));
		assert.strictEqual(result.findings.length, 2);
	});

	test("値が変数連結(リテラル外)の場合は触らない", () => {
		const code =
			'wk_ConStr = wk_ConStr & "Password=" & In_Pswd & ";"';
		assert.strictEqual(maskCredentials(code, VB).content, code);
	});

	test("SQL のバインド変数(:NAME)や比較式は触らない", () => {
		const code = [
			'wk_Sql = wk_Sql & " Where UNIT_ID = :UNIT_ID"',
			"'     TNTO = '\" & In_Tnto & \"'\"",
		].join("\n");
		assert.strictEqual(maskCredentials(code, VB).content, code);
	});
});

suite("credentialMasker: 非 VB ファイル(config / XML)", () => {
	test("接続文字列属性の Password / User ID をマスクする", () => {
		const xml =
			'<add name="Db" connectionString="Data Source=SV1;User ID=sa;Password=p@ss w0rd;" />';
		const result = maskCredentials(xml, GENERIC);
		assert.ok(result.content.includes("User ID=[MASKED];"));
		assert.ok(result.content.includes("Password=[MASKED];"));
		assert.ok(result.content.includes("Data Source=SV1;"));
	});

	test('password="値" の属性形式をマスクする', () => {
		const xml = '<credential username="admin" password="secret123" />';
		const result = maskCredentials(xml, GENERIC);
		assert.ok(result.content.includes('username="[MASKED]"'));
		assert.ok(result.content.includes('password="[MASKED]"'));
	});
});

suite("credentialMasker: 汎用シークレット形式", () => {
	test("AWS アクセスキーをマスクする", () => {
		const result = maskCredentials("key = AKIAIOSFODNN7EXAMPLE", GENERIC);
		assert.ok(!result.content.includes("AKIAIOSFODNN7EXAMPLE"));
		assert.ok(result.content.includes("[MASKED]"));
	});

	test("GitHub トークンをマスクする", () => {
		const result = maskCredentials(
			"url = https://ghp_abcdefghijklmnopqrstuvwxyz123456@github.com",
			GENERIC,
		);
		assert.ok(!result.content.includes("ghp_abcdefghijk"));
	});

	test("Bearer トークンはトークン部のみマスクする", () => {
		const result = maskCredentials(
			"Authorization: Bearer abcdef1234567890TOKEN",
			GENERIC,
		);
		assert.ok(/Bearer \[MASKED\]/.test(result.content));
	});

	test("PRIVATE KEY ブロックは BEGIN/END を残して中身をマスクする", () => {
		const pem = [
			"-----BEGIN RSA PRIVATE KEY-----",
			"MIIEpAIBAAKCAQEA1234567890",
			"abcdefghijklmnop",
			"-----END RSA PRIVATE KEY-----",
		].join("\n");
		const result = maskCredentials(pem, GENERIC);
		assert.ok(result.content.includes("-----BEGIN RSA PRIVATE KEY-----"));
		assert.ok(result.content.includes("-----END RSA PRIVATE KEY-----"));
		assert.ok(!result.content.includes("MIIEpAIBA"));
		assert.strictEqual(result.findings[0].kind, "秘密鍵");
	});

	test("コメントアウトされた認証情報コードもマスクする(実例由来)", () => {
		const code = [
			"'Case \"3\"",
			"'    wk_Bics_Pswd = \"komori\"",
			"'    In_Label.Text = \"BICS 本番環境(ツバゴ)\"",
		].join("\n");
		const result = maskCredentials(code, VB);
		assert.ok(!result.content.includes("komori"));
		assert.ok(result.content.includes('wk_Bics_Pswd = "[MASKED]"'));
		// 認証と無関係なコメント行は触らない
		assert.ok(result.content.includes('In_Label.Text = "BICS 本番環境(ツバゴ)"'));
	});

	test("行番号が findings に記録される", () => {
		const code = ['Dim a As String = "x"', 'wk_Pswd = "secret1"'].join("\n");
		const result = maskCredentials(code, VB);
		assert.strictEqual(result.findings.length, 1);
		assert.strictEqual(result.findings[0].line, 2);
	});
});

suite("credentialMasker: 日本語識別子・日本語キー", () => {
	test("日本語の秘密系変数への代入をマスクする", () => {
		const result = maskCredentials('パスワード = "himitsu123"', VB);
		assert.strictEqual(result.content, 'パスワード = "[MASKED]"');
		assert.strictEqual(result.findings[0].kind, "パスワード");
	});

	test("複合語の日本語変数(接続パスワード等)もマスクする", () => {
		const result = maskCredentials(
			'Public 接続パスワード As String = "abc"',
			VB,
		);
		assert.strictEqual(
			result.content,
			'Public 接続パスワード As String = "[MASKED]"',
		);
	});

	test("日本語のユーザー系変数への代入をマスクする", () => {
		const result = maskCredentials('ログインユーザ名 = "yamada"', VB);
		assert.strictEqual(result.content, 'ログインユーザ名 = "[MASKED]"');
		assert.strictEqual(result.findings[0].kind, "ユーザーID");
	});

	test("リテラル内の日本語キー=値をマスクする(半角カナ含む)", () => {
		const result = maskCredentials(
			'wk = "ﾊﾟｽﾜｰﾄﾞ=abc123;ユーザーID=yamada;"',
			VB,
		);
		assert.ok(result.content.includes("ﾊﾟｽﾜｰﾄﾞ=[MASKED];"));
		assert.ok(result.content.includes("ユーザーID=[MASKED];"));
	});

	test("設定ファイルの日本語キー(全角=・属性形式)をマスクする", () => {
		const text = ['パスワード=abc123', '<設定 パスワード="p@ss" />'].join("\n");
		const result = maskCredentials(text, GENERIC);
		assert.ok(!result.content.includes("abc123"));
		assert.ok(!result.content.includes("p@ss"));
		assert.ok(result.content.includes('パスワード="[MASKED]"'));
	});

	test("UI 文言(=を伴わない日本語)は触らない", () => {
		const code = [
			'Label1.Text = "パスワードを入力してください"',
			'Msg = "ユーザー名または暗証番号が違います"',
			'Title.Text = "パスワード: 8文字以上"',
		].join("\n");
		assert.strictEqual(maskCredentials(code, VB).content, code);
	});
});

suite("credentialMasker: メソッド引数", () => {
	test("秘密系メソッドの引数リテラルをマスクする", () => {
		const result = maskCredentials('Login("admin", "pass123")', VB);
		assert.strictEqual(result.content, 'Login("[MASKED]", "[MASKED]")');
		assert.strictEqual(result.findings.length, 2);
	});

	test("名前付き引数(password:=)をマスクする", () => {
		const result = maskCredentials(
			'Connect(server, password:="secret1", timeout:=30)',
			VB,
		);
		assert.strictEqual(
			result.content,
			'Connect(server, password:="[MASKED]", timeout:=30)',
		);
	});

	test("メンバー経由の呼び出し(auth.SetPassword)もマスクする", () => {
		const result = maskCredentials('auth.SetPassword("abc")', VB);
		assert.strictEqual(result.content, 'auth.SetPassword("[MASKED]")');
	});

	test("無関係なメソッドの引数は触らない", () => {
		const code = [
			'MsgBox("パスワードを入力")',
			'wk_Row("UNIT_ID") = ""',
			'Format(dt, "yyyy/MM/dd")',
		].join("\n");
		assert.strictEqual(maskCredentials(code, VB).content, code);
	});

	test("閉じた括弧の後(引数外)は触らない", () => {
		const code = '.Columns(0).Label = "ﾕﾆｯﾄｺｰﾄﾞ"';
		assert.strictEqual(maskCredentials(code, VB).content, code);
	});
});

suite("credentialMasker: 高エントロピー値(厳格モード)", () => {
	test("リテラル内のランダム英数字列を既定でマスクする", () => {
		const result = maskCredentials(
			'Dim k As String = "x9Kp2mQ7vR4tW8nZ3cJ6bL1s"',
			VB,
		);
		assert.ok(!result.content.includes("x9Kp2mQ7"));
		assert.strictEqual(result.findings[0].kind, "高エントロピー値");
	});

	test("設定ファイル内の base64 らしき値もマスクする", () => {
		const result = maskCredentials(
			"<value>QWxhZGRpbjra29wZW4gc2Vz4W1l</value>",
			GENERIC,
		);
		assert.ok(!result.content.includes("QWxhZGRpb"));
	});

	test("GUID・普通の語・日本語文はマスクしない", () => {
		const code = [
			'Dim g As String = "{8A5B1234-C81C-45F6-A57F-5ABD9991F28F}"',
			'Dim s As String = "Windows10Update2026Info"',
			'Dim path As String = "C:\\Program Files\\MyApp2026\\bin"',
		].join("\n");
		assert.strictEqual(maskCredentials(code, VB).content, code);
	});

	test("識別子・コード構造は触らない(リテラル外は対象外)", () => {
		const code = "Dim wk_NBOM_2026_TotalCount1x9K As Integer = 0";
		assert.strictEqual(maskCredentials(code, VB).content, code);
	});

	test("strict: false で高エントロピーマスクだけ無効化できる", () => {
		const code = 'Dim k As String = "x9Kp2mQ7vR4tW8nZ3cJ6bL1s"';
		const result = maskCredentials(code, { vbSource: true, strict: false });
		assert.strictEqual(result.content, code);
		// 変数名ヒントによるマスクは strict: false でも生きている
		const withHint = maskCredentials(
			'wk_Pswd = "abc"',
			{ vbSource: true, strict: false },
		);
		assert.strictEqual(withHint.content, 'wk_Pswd = "[MASKED]"');
	});
});


suite("credentialMasker: 一部だけ伏せたトークンの残り(厳格モード)", () => {
	test("Bearer トークンの「.」の後ろの短い部分も伏せる", () => {
		const vb = 'req.Headers.Add("Authorization", "Bearer Ab1Cd2Ef3Gh4Ij5Kl6Mn7Op8.sEcReTtAiLvAlUe")';
		const result = maskCredentials(vb, VB);
		assert.ok(!result.content.includes("sEcReTtAiLvAlUe"), result.content);
		assert.ok(result.content.includes('"Bearer [MASKED]"'));
	});

	test("JWT の 20 文字未満の部分も伏せる", () => {
		const jwt = "token: eyJhbGciOiJub25lIn0.eyJ1c2VyIjoiYWRtaW4iLCJyb2xlIjoiYWRtaW4ifQ.abcdefghijklmnop";
		const result = maskCredentials(jwt, GENERIC);
		assert.strictEqual(result.content, "token: [MASKED]");
	});

	test("すべて伏せた部分だけなら変えない", () => {
		const jwt =
			"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
		assert.strictEqual(maskCredentials(jwt, GENERIC).content, "[MASKED].[MASKED].[MASKED]");
		assert.strictEqual(maskCredentials("Use Bearer [MASKED].", GENERIC).content, "Use Bearer [MASKED].");
	});
});

suite("credentialMasker: maskLinesForDisplay(行の位置を保つ抜粋用)", () => {
	test("行数を変えずに伏せる", () => {
		const lines = ['Dim pwd As String = "s3cret"', "Open(pwd)"];
		assert.deepStrictEqual(maskLinesForDisplay(lines, { path: "a.vb" }), [
			'Dim pwd As String = "[MASKED]"',
			"Open(pwd)",
		]);
	});

	test("秘密鍵のブロックは本文を伏せ、行数と前後の行を変えない", () => {
		const body = "MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7";
		const lines = ["-----BEGIN PRIVATE KEY-----", body, body, "-----END PRIVATE KEY-----", "x = 1"];
		const masked = maskLinesForDisplay(lines, { path: "key.pem" });
		assert.strictEqual(masked.length, lines.length);
		assert.strictEqual(masked[0], lines[0]);
		assert.strictEqual(masked[3], lines[3]);
		assert.strictEqual(masked[4], "x = 1");
		assert.ok(!masked.join("\n").includes(body));
	});

	test("複数行の秘密鍵があっても、行継続の代入の値を伏せる(行ごとに伏せると漏れる)", () => {
		const lines = [
			'    Const PEM As String = "-----BEGIN RSA PRIVATE KEY-----" & vbCrLf &',
			'        "MIIEowIBAAKCAQEAu1SU1LfVLPHCozMxH2Mo4lgOEePzNm0tRgeLezV6ffAt0gun" & vbCrLf &',
			'        "VTLw7onLRnrq0/IzW7yWR7QkrmBL7jTKEn5u+qKhbwKfBstIs+bMY2Zkp18gnTxK" & vbCrLf &',
			'        "-----END RSA PRIVATE KEY-----"',
			"        Dim dbPassword As String = _",
			'            "Hunter2Secret"',
		];
		const masked = maskLinesForDisplay(lines, { path: "Keys.vb" });
		assert.strictEqual(masked.length, lines.length);
		assert.ok(!masked.join("\n").includes("Hunter2Secret"), masked.join("\n"));
		assert.ok(!masked.join("\n").includes("MIIEowIBAAKCAQEA"));
	});

	test("複数行にまたがる属性値を伏せる", () => {
		const lines = ['  <add key="Mail" password="Hunter2', '     Secret" />', "</configuration>"];
		const masked = maskLinesForDisplay(lines, { path: "App.config" });
		assert.ok(!masked.join("\n").includes("Hunter2"));
		assert.strictEqual(masked[2], "</configuration>");
	});

	test("1 行に収まった秘密鍵で、後ろの行の位置がずれない", () => {
		const lines = [
			'  key: "-----BEGIN PRIVATE KEY-----\\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASC\\n-----END PRIVATE KEY-----\\n"',
			'  conn: "Server=db1;Password=Hunter2Secret"',
		];
		const masked = maskLinesForDisplay(lines, { path: "a.yaml" });
		assert.strictEqual(masked.length, 2);
		assert.strictEqual(masked[1], '  conn: "Server=db1;Password=[MASKED]"');
	});

	test("END のない BEGIN の行で、後ろを伏せない", () => {
		const lines = ['Return s.StartsWith("-----BEGIN RSA PRIVATE KEY-----")', "Dim x = 1"];
		assert.deepStrictEqual(maskLinesForDisplay(lines, { path: "Pem.vb" }), lines);
	});

	test(".vb は汎用テキストとしての伏せ方の範囲も伏せる(generic 構成の追加ディレクトリと同じ)", () => {
		const lines = ["Module M", "    Private Const pass = 48291375", "End Module"];
		assert.ok(!maskCredentials(lines.join("\n"), GENERIC).content.includes("48291375"));
		assert.ok(!maskLinesForDisplay(lines, { path: "M.vb" }).join("\n").includes("48291375"));
	});

	test("strict のときは厳格でない伏せ方の範囲も伏せる", () => {
		const lines = ['h = "Bearer Ab1Cd2Ef3Gh4Ij5Kl6Mn7Op8.sEcReTtAiLvAlUe"'];
		assert.ok(!maskLinesForDisplay(lines, { path: "a.txt" }).join("").includes("sEcReT"));
	});

	test("strict: false では高エントロピー値を伏せない(--no-strict-mask)", () => {
		const lines = ['Dim k = "Zx9Qw8Er7Ty6Ui5Op4As3Df2"'];
		assert.ok(maskLinesForDisplay(lines, { path: "a.vb", strict: true })[0]?.includes("[MASKED]"));
		assert.deepStrictEqual(maskLinesForDisplay(lines, { path: "a.vb", strict: false }), lines);
	});
});
