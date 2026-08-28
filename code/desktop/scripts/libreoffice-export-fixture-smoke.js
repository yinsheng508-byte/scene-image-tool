#!/usr/bin/env node
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { pathToFileURL } = require("url");
const archiver = require("archiver");
const { detectDarwinLibreOfficeRuntime } = require("../platform/darwin/libreoffice-runtime");

const DEFAULT_TIMEOUT_MS = 120000;
const FIXTURE_ROOT = path.join(__dirname, "..", "test-fixtures", "export-basic");
const DEFAULT_OUTPUT_ROOT = path.join(__dirname, "..", "_test_output", "export-fixture-smoke");

function parsePositiveInt(value, fallback) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return fallback;
  const integerValue = Math.floor(numberValue);
  return integerValue > 0 ? integerValue : fallback;
}

function parseArgs(argv) {
  const args = {
    manifest: path.join(FIXTURE_ROOT, "manifest.json"),
    output: DEFAULT_OUTPUT_ROOT,
    report: "",
    timeoutMs: DEFAULT_TIMEOUT_MS,
    runtimeMode: "auto",
    keepOutput: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--manifest" && argv[index + 1]) {
      args.manifest = argv[index + 1];
      index += 1;
    } else if (token === "--output" && argv[index + 1]) {
      args.output = argv[index + 1];
      index += 1;
    } else if (token === "--report" && argv[index + 1]) {
      args.report = argv[index + 1];
      index += 1;
    } else if (token === "--timeout" && argv[index + 1]) {
      args.timeoutMs = parsePositiveInt(argv[index + 1], DEFAULT_TIMEOUT_MS);
      index += 1;
    } else if (token === "--runtime-mode" && argv[index + 1]) {
      args.runtimeMode = String(argv[index + 1] || "").trim().toLowerCase() || "auto";
      index += 1;
    } else if (token === "--keep-output") {
      args.keepOutput = true;
    }
  }
  return args;
}

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function sanitizeFileName(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    || `fixture-${Date.now()}`;
}

function loadManifest(manifestPath) {
  const payload = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const cases = Array.isArray(payload.cases) ? payload.cases : [];
  return cases
    .map((item) => ({
      id: sanitizeFileName(item.id),
      type: String(item.type || "").trim().toLowerCase(),
      title: String(item.title || "").trim(),
      body: Array.isArray(item.body) ? item.body.map((line) => String(line || "")) : []
    }))
    .filter((item) => item.id && (item.type === "docx" || item.type === "pptx"));
}

function writeReport(reportPath, payload) {
  if (!reportPath) return;
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function createZip(entries, targetPath) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    const output = fs.createWriteStream(targetPath);
    const archive = archiver("zip", { zlib: { level: 9 } });
    output.on("close", resolve);
    output.on("error", reject);
    archive.on("error", reject);
    archive.pipe(output);
    entries.forEach((entry) => {
      archive.append(entry.content, { name: entry.name });
    });
    archive.finalize();
  });
}

function createDocxEntries(testCase) {
  const paragraphs = [testCase.title, ...testCase.body]
    .filter(Boolean)
    .map((line) => `<w:p><w:r><w:t>${escapeXml(line)}</w:t></w:r></w:p>`)
    .join("");
  return [
    {
      name: "[Content_Types].xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`
    },
    {
      name: "_rels/.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`
    },
    {
      name: "docProps/core.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <dc:title>${escapeXml(testCase.title)}</dc:title>
  <dc:creator>scene-image-tool smoke</dc:creator>
</cp:coreProperties>`
    },
    {
      name: "docProps/app.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
  <Application>scene-image-tool</Application>
</Properties>`
    },
    {
      name: "word/document.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paragraphs}
    <w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>
  </w:body>
</w:document>`
    }
  ];
}

function createThemeXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="SceneSmoke">
  <a:themeElements>
    <a:clrScheme name="SceneSmoke">
      <a:dk1><a:srgbClr val="1F2937"/></a:dk1>
      <a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>
      <a:dk2><a:srgbClr val="111827"/></a:dk2>
      <a:lt2><a:srgbClr val="F9FAFB"/></a:lt2>
      <a:accent1><a:srgbClr val="2563EB"/></a:accent1>
      <a:accent2><a:srgbClr val="059669"/></a:accent2>
      <a:accent3><a:srgbClr val="D97706"/></a:accent3>
      <a:accent4><a:srgbClr val="7C3AED"/></a:accent4>
      <a:accent5><a:srgbClr val="DC2626"/></a:accent5>
      <a:accent6><a:srgbClr val="0891B2"/></a:accent6>
      <a:hlink><a:srgbClr val="2563EB"/></a:hlink>
      <a:folHlink><a:srgbClr val="7C3AED"/></a:folHlink>
    </a:clrScheme>
    <a:fontScheme name="SceneSmoke">
      <a:majorFont><a:latin typeface="Arial"/><a:ea typeface="Arial"/><a:cs typeface="Arial"/></a:majorFont>
      <a:minorFont><a:latin typeface="Arial"/><a:ea typeface="Arial"/><a:cs typeface="Arial"/></a:minorFont>
    </a:fontScheme>
    <a:fmtScheme name="SceneSmoke">
      <a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>
      <a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>
      <a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>
      <a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst>
    </a:fmtScheme>
  </a:themeElements>
</a:theme>`;
}

function createPptxEntries(testCase) {
  const title = escapeXml(testCase.title);
  const bodyText = escapeXml(testCase.body.join("  "));
  return [
    {
      name: "[Content_Types].xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`
    },
    {
      name: "_rels/.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`
    },
    {
      name: "docProps/core.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <dc:title>${title}</dc:title>
  <dc:creator>scene-image-tool smoke</dc:creator>
</cp:coreProperties>`
    },
    {
      name: "docProps/app.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
  <Application>scene-image-tool</Application>
  <Slides>1</Slides>
</Properties>`
    },
    {
      name: "ppt/presentation.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
  <p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst>
  <p:sldSz cx="9144000" cy="5143500" type="screen16x9"/>
  <p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>`
    },
    {
      name: "ppt/_rels/presentation.xml.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>
</Relationships>`
    },
    {
      name: "ppt/slides/slide1.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="685800" y="685800"/><a:ext cx="7772400" cy="914400"/></a:xfrm></p:spPr>
        <p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="3400" b="1"/><a:t>${title}</a:t></a:r></a:p></p:txBody>
      </p:sp>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="3" name="Body"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="685800" y="1828800"/><a:ext cx="7772400" cy="1600200"/></a:xfrm></p:spPr>
        <p:txBody><a:bodyPr wrap="square"/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="2200"/><a:t>${bodyText}</a:t></a:r></a:p></p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>`
    },
    {
      name: "ppt/slides/_rels/slide1.xml.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>`
    },
    {
      name: "ppt/slideLayouts/slideLayout1.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" type="blank" preserve="1">
  <p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sldLayout>`
    },
    {
      name: "ppt/slideLayouts/_rels/slideLayout1.xml.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`
    },
    {
      name: "ppt/slideMasters/slideMaster1.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld>
  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
  <p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>
  <p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles>
</p:sldMaster>`
    },
    {
      name: "ppt/slideMasters/_rels/slideMaster1.xml.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
</Relationships>`
    },
    {
      name: "ppt/theme/theme1.xml",
      content: createThemeXml()
    }
  ];
}

async function generateFixture(testCase, fixturesDir) {
  const filePath = path.join(fixturesDir, `${testCase.id}.${testCase.type}`);
  const entries = testCase.type === "docx"
    ? createDocxEntries(testCase)
    : createPptxEntries(testCase);
  await createZip(entries, filePath);
  return filePath;
}

function detectLibreOfficeRuntime(runtimeMode = "auto") {
  if (process.platform === "darwin") {
    return detectDarwinLibreOfficeRuntime({ runtimeMode });
  }
  const envPath = String(process.env.LIBREOFFICE_PATH || "").trim();
  if (envPath && fs.existsSync(envPath)) {
    return {
      ok: true,
      platform: process.platform,
      capability: "libreoffice",
      source: "env",
      path: envPath,
      version: "",
      warnings: [],
      errorCode: "",
      message: "LibreOffice runtime detected from LIBREOFFICE_PATH.",
      actions: []
    };
  }
  return {
    ok: false,
    platform: process.platform,
    capability: "libreoffice",
    source: "",
    path: "",
    version: "",
    warnings: ["smoke_runtime_probe_not_implemented_for_platform"],
    errorCode: "LO_MISSING_BINARY",
    message: "LibreOffice runtime was not detected for this smoke test.",
    actions: ["Install LibreOffice or set LIBREOFFICE_PATH"]
  };
}

function killChild(child) {
  if (!child?.pid) return;
  try {
    child.kill("SIGTERM");
  } catch (error) {
    // Ignore cleanup errors.
  }
}

function runLibreOfficeConvert(runtime, inputPath, outputDir, timeoutMs) {
  return new Promise((resolve) => {
    const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "scene-lo-fixture-profile-"));
    const startedAt = Date.now();
    const child = spawn(runtime.path, [
      `-env:UserInstallation=${pathToFileURL(profileDir).href}`,
      "--headless",
      "--nologo",
      "--nodefault",
      "--nolockcheck",
      "--nofirststartwizard",
      "--convert-to",
      "pdf",
      "--outdir",
      outputDir,
      inputPath
    ], {
      env: {
        ...process.env,
        HOME: process.env.HOME || os.homedir()
      }
    });
    const stdoutChunks = [];
    const stderrChunks = [];
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      killChild(child);
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => stdoutChunks.push(Buffer.from(chunk)));
    child.stderr?.on("data", (chunk) => stderrChunks.push(Buffer.from(chunk)));
    child.on("close", (code) => {
      clearTimeout(timeoutId);
      fs.rmSync(profileDir, { recursive: true, force: true });
      resolve({
        exitCode: Number.isFinite(Number(code)) ? Number(code) : -1,
        timedOut,
        durationMs: Date.now() - startedAt,
        stdout: Buffer.concat(stdoutChunks).toString("utf8").trim(),
        stderr: Buffer.concat(stderrChunks).toString("utf8").trim()
      });
    });
    child.on("error", (error) => {
      clearTimeout(timeoutId);
      fs.rmSync(profileDir, { recursive: true, force: true });
      resolve({
        exitCode: -1,
        timedOut,
        durationMs: Date.now() - startedAt,
        stdout: "",
        stderr: error?.message || String(error || "unknown")
      });
    });
  });
}

async function renderPdfFirstPage(pdfPath, pngPath) {
  const { PDFiumLibrary } = require("@hyzyla/pdfium");
  const sharp = require("sharp");
  const library = await PDFiumLibrary.init();
  const buffer = await fs.promises.readFile(pdfPath);
  const document = await library.loadDocument(buffer);
  try {
    const pages = Array.from(document.pages());
    if (pages.length === 0) {
      throw new Error("PDF has no pages");
    }
    const page = pages[0];
    await page.render({
      scale: 2,
      render: async (renderOptions) => {
        await sharp(renderOptions.data, {
          raw: {
            width: renderOptions.width,
            height: renderOptions.height,
            channels: 4
          }
        }).png({ compressionLevel: 1 }).toFile(pngPath);
        return Buffer.alloc(0);
      }
    });
    const meta = await sharp(pngPath).metadata();
    return {
      pageCount: pages.length,
      width: Number(meta.width) || 0,
      height: Number(meta.height) || 0
    };
  } finally {
    if (typeof document.destroy === "function") {
      document.destroy();
    }
  }
}

async function runSmoke() {
  const args = parseArgs(process.argv.slice(2));
  const outputRoot = path.resolve(args.output);
  const reportPath = args.report
    ? path.resolve(args.report)
    : path.join(outputRoot, "report.json");
  const runtime = detectLibreOfficeRuntime(args.runtimeMode);
  const report = {
    ok: false,
    skipped: false,
    platform: process.platform,
    runtimeMode: args.runtimeMode,
    runtime,
    outputRoot,
    reportPath,
    cases: [],
    summary: {
      total: 0,
      passed: 0,
      failed: 0
    }
  };

  if (!runtime.ok) {
    report.skipped = true;
    report.errorCode = runtime.errorCode || "LO_MISSING_BINARY";
    report.message = runtime.message || "LibreOffice runtime missing; export fixture smoke skipped.";
    writeReport(reportPath, report);
    console.log("[export-fixture-smoke] SKIP");
    console.log(JSON.stringify(report, null, 2));
    return 0;
  }

  if (!args.keepOutput) {
    fs.rmSync(outputRoot, { recursive: true, force: true });
  }
  const fixturesDir = path.join(outputRoot, "fixtures");
  const pdfDir = path.join(outputRoot, "pdf");
  const pngDir = path.join(outputRoot, "png");
  fs.mkdirSync(fixturesDir, { recursive: true });
  fs.mkdirSync(pdfDir, { recursive: true });
  fs.mkdirSync(pngDir, { recursive: true });

  const cases = loadManifest(path.resolve(args.manifest));
  report.summary.total = cases.length;
  for (const testCase of cases) {
    const fixturePath = await generateFixture(testCase, fixturesDir);
    const pdfPath = path.join(pdfDir, `${path.basename(fixturePath, path.extname(fixturePath))}.pdf`);
    const pngPath = path.join(pngDir, `${testCase.id}-1.png`);
    const processResult = await runLibreOfficeConvert(runtime, fixturePath, pdfDir, args.timeoutMs);
    const pdfExists = fs.existsSync(pdfPath);
    const pdfSize = pdfExists ? fs.statSync(pdfPath).size : 0;
    let renderResult = null;
    let renderError = "";
    if (pdfSize > 0) {
      try {
        renderResult = await renderPdfFirstPage(pdfPath, pngPath);
      } catch (error) {
        renderError = error?.message || String(error || "unknown");
      }
    }
    const pngExists = fs.existsSync(pngPath);
    const pngSize = pngExists ? fs.statSync(pngPath).size : 0;
    const ok = processResult.exitCode === 0
      && !processResult.timedOut
      && pdfSize > 0
      && pngSize > 0
      && !renderError;
    if (ok) report.summary.passed += 1;
    else report.summary.failed += 1;
    report.cases.push({
      id: testCase.id,
      type: testCase.type,
      ok,
      fixturePath,
      fixtureSize: fs.statSync(fixturePath).size,
      pdfPath,
      pdfSize,
      pngPath,
      pngSize,
      render: renderResult,
      renderError,
      process: processResult
    });
  }

  report.ok = report.summary.failed === 0 && report.summary.total > 0;
  report.message = report.ok
    ? "LibreOffice fixture export smoke passed."
    : "LibreOffice fixture export smoke failed.";
  writeReport(reportPath, report);
  console.log(report.ok ? "[export-fixture-smoke] PASS" : "[export-fixture-smoke] FAIL");
  console.log(JSON.stringify(report, null, 2));
  return report.ok ? 0 : 1;
}

runSmoke()
  .then((exitCode) => {
    process.exitCode = exitCode;
  })
  .catch((error) => {
    console.error("[export-fixture-smoke] ERROR", error?.stack || error?.message || String(error));
    process.exitCode = 1;
  });
