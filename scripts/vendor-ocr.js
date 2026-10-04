// 端末内の文字認識（Tesseract.js）の部品を public/vendor/ocr/ にコピーする（npm install 時に自動実行）
// 日本語データは軽量版（LSTMのみ・整数化、約2MB）
import { cpSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const req = createRequire(join(root, "package.json"));
const pkg = name => dirname(req.resolve(`${name}/package.json`));
const out = join(root, "public", "vendor", "ocr");
mkdirSync(join(out, "core"), { recursive: true });
mkdirSync(join(out, "lang"), { recursive: true });

const files = [
  [join(pkg("tesseract.js"), "dist", "tesseract.min.js"), join(out, "tesseract.min.js")],
  [join(pkg("tesseract.js"), "dist", "worker.min.js"), join(out, "worker.min.js")],
  // 端末の対応状況に応じてどれか1つだけ読み込まれる
  ...["tesseract-core-lstm.wasm.js", "tesseract-core-simd-lstm.wasm.js", "tesseract-core-relaxedsimd-lstm.wasm.js"]
    .map(f => [join(pkg("tesseract.js-core"), f), join(out, "core", f)]),
  [join(pkg("@tesseract.js-data/jpn"), "4.0.0_best_int", "jpn.traineddata.gz"), join(out, "lang", "jpn.traineddata.gz")],
];
for (const [from, to] of files) {
  if (!existsSync(from)) { console.error("見つからない: " + from); process.exit(1); }
  cpSync(from, to);
}
console.log("OCR の部品をコピーしました: " + out);
