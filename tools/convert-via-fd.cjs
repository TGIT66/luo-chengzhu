/*
 * 用「文件句柄」而非「管道」启动捆绑的 LibreOffice 助手完成 docx -> pdf 转换。
 *
 * 背景：捆绑的 libreoffice-kit CLI 用 stdio:'pipe' 启动助手，在当前 DSH 沙箱下
 * 会因命名管道被禁止而报 spawn EPERM。这里按官方 runNative 的同一套参数与
 * 环境变量复刻调用，只把 stdout/stderr 改写成日志文件句柄，并用 spawnSync
 * 同步等待，最后解析助手输出的 JSON。
 */
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const KIT = "D:\\deepseek harness\\resources\\app.asar.unpacked\\dsh\\node_modules\\@deepseek-ai\\libreoffice-kit-win32-x64";
const EXE = path.join(KIT, "bin", "libreoffice-kit.exe");
const PROGRAM_DIR = path.join(KIT, "program", "program");

const input = process.argv[2];
const output = process.argv[3];
const fontsDir = process.argv[4] || null;

if (!input || !output) {
  console.error("usage: node convert-via-fd.cjs <input.docx> <output.pdf> [fontDir]");
  process.exit(2);
}

const scratch = path.join(__dirname, ".qa", "convert");
fs.rmSync(scratch, { recursive: true, force: true });
const profile = path.join(scratch, "profile");
fs.mkdirSync(path.join(profile, "user"), { recursive: true });

// 用副本作为输入，避免 LibreOffice 在交付目录里留下 .~lock 文件
const inputCopy = path.join(scratch, "input.docx");
fs.copyFileSync(input, inputCopy);

// 与 prepareNativeFontProfile 一致：私有 profile 的字体替换表（留空 = 不做替换）
const XCU =
  '<?xml version="1.0" encoding="UTF-8"?><oor:items xmlns:oor="http://openoffice.org/2001/registry">' +
  '<item oor:path="/org.openoffice.Office.Calc/Input"><prop oor:name="WarnActiveSheet" oor:op="fuse">' +
  '<value>false</value></prop></item><item oor:path="/org.openoffice.VCL/FontSubstitutions/en"></item></oor:items>\n';
fs.writeFileSync(path.join(profile, "user", "registrymodifications.xcu"), XCU);

const ENV_KEYS = ["PATH", "SystemRoot", "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT", "LANG", "LC_ALL", "TZ"];
const env = {};
for (const k of ENV_KEYS) if (process.env[k] !== undefined) env[k] = process.env[k];
Object.assign(env, { HOME: profile, USERPROFILE: profile, TMPDIR: profile, TMP: profile, TEMP: profile });

const fontFiles = [];
if (fontsDir && fs.existsSync(fontsDir)) {
  for (const name of fs.readdirSync(fontsDir)) {
    if (/\.(ttf|ttc|otf)$/i.test(name)) fontFiles.push(path.join(fontsDir, name));
  }
}

const args = [
  "--program-directory", PROGRAM_DIR,
  "--input-path", inputCopy,
  "--output-path", output,
  "--profile-directory", profile,
  "--max-output-bytes", "134217728",
  "--max-image-resolution", "144",
  "--format", "pdf",
  "--recalculate", "false",
];
for (const f of fontFiles) args.push("--font-file", f);

const outLog = fs.openSync(path.join(scratch, "stdout.log"), "w");
const errLog = fs.openSync(path.join(scratch, "stderr.log"), "w");

const started = Date.now();
const r = spawnSync(EXE, args, {
  stdio: ["ignore", outLog, errLog],
  windowsHide: true,
  env,
  timeout: 300000,
});
fs.closeSync(outLog);
fs.closeSync(errLog);

const stdout = fs.readFileSync(path.join(scratch, "stdout.log"), "utf8");
const stderr = fs.readFileSync(path.join(scratch, "stderr.log"), "utf8").slice(-4000);

console.log(JSON.stringify({
  elapsedMs: Date.now() - started,
  status: r.status,
  signal: r.signal,
  spawnError: r.error ? String(r.error) : null,
  fontFileCount: fontFiles.length,
  stdoutTail: stdout.slice(-1500),
  stderrTail: stderr,
  outputExists: fs.existsSync(output),
  outputBytes: fs.existsSync(output) ? fs.statSync(output).size : 0,
}, null, 2));
