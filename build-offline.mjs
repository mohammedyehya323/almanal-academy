import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const assetsDir = path.join(projectRoot, "dist", "public", "assets");
const files = await readdir(assetsDir);
const jsFiles = files.filter((name) => /^index-.*\.js$/.test(name));
const cssFiles = files.filter((name) => /^index-.*\.css$/.test(name));

if (jsFiles.length !== 1 || cssFiles.length !== 1) {
  throw new Error(
    `Expected one bundled JavaScript and one CSS file in ${assetsDir}; found ${jsFiles.length} JS and ${cssFiles.length} CSS. Run pnpm build first.`,
  );
}

const [js, css] = await Promise.all([
  readFile(path.join(assetsDir, jsFiles[0]), "utf8"),
  readFile(path.join(assetsDir, cssFiles[0]), "utf8"),
]);

if (/\bimport\s*(?:\(|["'{*])|\bexport\s*\{/.test(js)) {
  throw new Error("The JS build contains external modules and cannot be embedded as one file.");
}

const safeJs = js.replace(/<\/script/gi, "<\\/script");
const safeCss = css.replace(/<\/style/gi, "<\\/style");
const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="theme-color" content="#f7f6f0">
  <meta name="description" content="مختبر الأرقام — أداة محلية لتدريب الحساب الذهني.">
  <title>مختبر الأرقام | تحدّي الحساب الذهني</title>
  <style>${safeCss}</style>
</head>
<body>
  <div id="root"></div>
  <script>${safeJs}</script>
</body>
</html>
`;

const output = path.join(projectRoot, "hisab-dhihni-local.html");
await writeFile(output, html, "utf8");
console.log(`\nتم إنشاء الملف المحلي بنجاح:\n${output}\n`);
