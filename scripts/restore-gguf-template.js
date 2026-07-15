/**
 * Restore original tokenizer.chat_template into the on-device GGUF
 * (undo ofln sanitize pads that Minja emitted as spaces).
 *
 * Run: node scripts/restore-gguf-template.js
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const DATA_OFF = 10934939;
const LEN = 7816;
const ROOT = path.join(__dirname, "..");
const HEAD = path.join(ROOT, ".tmp-gguf-test", "qwen08b-head.gguf");
const BIN = path.join(ROOT, ".tmp-gguf-test", "original-template.bin");

if (!fs.existsSync(HEAD)) {
  console.error("Missing", HEAD);
  process.exit(1);
}

const head = fs.readFileSync(HEAD);
const tpl = head.subarray(DATA_OFF, DATA_OFF + LEN);
fs.writeFileSync(BIN, tpl);
console.log("saved", BIN, "len", tpl.length);
console.log("preview", JSON.stringify(tpl.subarray(0, 48).toString("utf8")));

try {
  execSync("adb get-state", { stdio: "pipe" });
} catch {
  console.log("No adb device — local bin only");
  process.exit(0);
}

execSync(`adb push "${BIN}" /sdcard/Download/original-template.bin`, {
  stdio: "inherit",
});

execSync(
  'adb shell run-as com.ofln cp /sdcard/Download/original-template.bin files/original-template.bin',
  { stdio: "inherit" }
);
execSync(
  `adb shell run-as com.ofln dd if=files/original-template.bin of=files/Qwen3.5-0.8B-Q4_0.gguf bs=1 seek=${DATA_OFF} conv=notrunc`,
  { stdio: "inherit" }
);
const out = execSync(
  `adb shell run-as com.ofln dd if=files/Qwen3.5-0.8B-Q4_0.gguf bs=1 skip=${DATA_OFF} count=48`,
  { encoding: "buffer" }
);
const text = Buffer.from(out).toString("utf8");
console.log("device template head:", JSON.stringify(text));
if (!text.includes("{%- set image_count")) {
  console.error("FAIL: restore did not stick");
  process.exit(1);
}
console.log("PASS restored original chat_template on device");
