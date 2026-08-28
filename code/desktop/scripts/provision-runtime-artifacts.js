const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const desktopRoot = path.resolve(__dirname, "..");
const defaultManifestPath = path.join(desktopRoot, "resources", "runtime-manifest.json");

function printHelp() {
  console.log(`Usage: node scripts/provision-runtime-artifacts.js [options]

Options:
  --manifest <path>        Manifest path. Defaults to resources/runtime-manifest.json.
  --artifact-root <path>   Local artifact root. Also read from SCENE_RUNTIME_ARTIFACT_ROOT.
  --artifact <id>          Limit to one artifact. Can be repeated or comma-separated.
  --platform <name>        Platform filter. Defaults to process.platform.
  --dry-run                Print planned actions without copying files.
  --check-only             Validate targets and system paths without copying files.
  --strict                 Treat optional missing artifacts as errors.
  --strict-checksums       Treat missing per-file checksums as errors.
  --force                  Allow existing target files to be overwritten during copy.
  --json                   Print machine-readable JSON.
  --help                   Show this help.
`);
}

function parseArgs(argv) {
  const options = {
    manifestPath: defaultManifestPath,
    artifactRoot: process.env.SCENE_RUNTIME_ARTIFACT_ROOT || "",
    artifacts: new Set(),
    platform: process.platform,
    dryRun: false,
    checkOnly: false,
    strict: false,
    strictChecksums: false,
    force: false,
    json: false,
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const readValue = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`Missing value for ${arg}`);
      }
      index += 1;
      return value;
    };

    if (arg === "--manifest") {
      options.manifestPath = path.resolve(readValue());
    } else if (arg === "--artifact-root" || arg === "--source-root") {
      options.artifactRoot = path.resolve(readValue());
    } else if (arg === "--artifact") {
      readValue().split(",").map((item) => item.trim()).filter(Boolean)
        .forEach((item) => options.artifacts.add(item));
    } else if (arg === "--platform") {
      options.platform = readValue();
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--check-only") {
      options.checkOnly = true;
    } else if (arg === "--strict") {
      options.strict = true;
    } else if (arg === "--strict-checksums") {
      options.strictChecksums = true;
    } else if (arg === "--force") {
      options.force = true;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Unable to read manifest ${filePath}: ${error.message}`);
  }
}

function isFile(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch (error) {
    return false;
  }
}

function isDirectory(filePath) {
  try {
    return fs.statSync(filePath).isDirectory();
  } catch (error) {
    return false;
  }
}

function resolvePath(baseDir, inputPath) {
  if (!inputPath) return null;
  if (path.isAbsolute(inputPath)) return path.normalize(inputPath);
  return path.resolve(baseDir, inputPath);
}

function toDisplayPath(filePath) {
  if (!filePath) return "";
  const relative = path.relative(desktopRoot, filePath);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative)
    ? relative
    : filePath;
}

function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  const buffer = fs.readFileSync(filePath);
  hash.update(buffer);
  return hash.digest("hex");
}

function normalizeSha256(value) {
  const text = String(value || "").trim().toLowerCase();
  return /^[a-f0-9]{64}$/.test(text) ? text : "";
}

function platformMatches(artifact, platformName) {
  const platforms = Array.isArray(artifact.platforms) ? artifact.platforms : [];
  return platforms.length === 0 || platforms.includes(platformName) || platforms.includes("all");
}

function shouldFailMissing(artifact, options) {
  if (options.dryRun) return false;
  if (options.strict) return true;
  if (options.artifacts.size > 0) return true;
  return Boolean(artifact.required);
}

function createResult(artifact) {
  return {
    id: artifact.id,
    name: artifact.name || artifact.id,
    kind: artifact.kind,
    targetPath: artifact.targetPath || null,
    status: "pending",
    path: null,
    copied: false,
    warnings: [],
    errors: [],
    actions: []
  };
}

function addMissing(result, message, artifact, options, includeAction = true) {
  result.status = "missing";
  if (includeAction) {
    result.actions.push(message);
  }
  if (shouldFailMissing(artifact, options)) {
    result.errors.push(message);
  } else {
    result.warnings.push(message);
  }
}

function validateHash(filePath, expectedSha256, result, label, options) {
  const expected = normalizeSha256(expectedSha256);
  if (!expected) {
    if (options.strictChecksums) {
      result.errors.push(`${label} is missing a sha256 checksum.`);
    }
    return true;
  }
  const actual = sha256File(filePath);
  if (actual !== expected) {
    result.status = "error";
    result.errors.push(`${label} sha256 mismatch. expected=${expected} actual=${actual}`);
    return false;
  }
  return true;
}

function getLocalSourcePath(artifact, options) {
  const source = artifact.source || {};
  if (source.type !== "local-artifact-root") return null;
  if (!options.artifactRoot) return null;
  return resolvePath(options.artifactRoot, source.path || artifact.id);
}

function validateExpectedEntries(targetRoot, artifact, result, options) {
  let ok = true;
  const requiredDirectories = Array.isArray(artifact.requiredDirectories) ? artifact.requiredDirectories : [];
  requiredDirectories.forEach((entry) => {
    const directoryPath = resolvePath(targetRoot, entry);
    if (!isDirectory(directoryPath)) {
      ok = false;
      addMissing(result, `Missing required directory: ${toDisplayPath(directoryPath)}`, artifact, options, false);
    }
  });

  const requiredFiles = Array.isArray(artifact.requiredFiles) ? artifact.requiredFiles : [];
  requiredFiles.forEach((entry) => {
    const relativePath = typeof entry === "string" ? entry : entry.path;
    const filePath = resolvePath(targetRoot, relativePath);
    if (!isFile(filePath)) {
      ok = false;
      addMissing(result, `Missing required file: ${toDisplayPath(filePath)}`, artifact, options, false);
      return;
    }
    if (!validateHash(filePath, entry.sha256, result, toDisplayPath(filePath), options)) {
      ok = false;
    }
  });
  return ok;
}

function provisionFileArtifact(artifact, result, options) {
  const targetPath = resolvePath(desktopRoot, artifact.targetPath);
  result.path = targetPath;
  if (isFile(targetPath)) {
    validateHash(targetPath, artifact.sha256, result, toDisplayPath(targetPath), options);
    if (result.errors.length === 0) result.status = "ok";
    return result;
  }

  const sourcePath = getLocalSourcePath(artifact, options);
  if (!sourcePath) {
    addMissing(result, `Provide --artifact-root containing ${artifact.source?.path || artifact.id}`, artifact, options);
    return result;
  }
  if (!isFile(sourcePath)) {
    addMissing(result, `Source file not found: ${sourcePath}`, artifact, options);
    return result;
  }
  if (!validateHash(sourcePath, artifact.sha256, result, `source ${sourcePath}`, options)) {
    return result;
  }

  if (options.dryRun || options.checkOnly) {
    result.status = options.checkOnly ? "missing" : "planned";
    result.actions.push(`Would copy ${sourcePath} -> ${toDisplayPath(targetPath)}`);
    return result;
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  if (isFile(targetPath) && !options.force) {
    result.status = "error";
    result.errors.push(`Target already exists; use --force to overwrite: ${toDisplayPath(targetPath)}`);
    return result;
  }
  fs.copyFileSync(sourcePath, targetPath);
  result.copied = true;
  validateHash(targetPath, artifact.sha256, result, toDisplayPath(targetPath), options);
  if (result.errors.length === 0) result.status = "provisioned";
  return result;
}

function provisionDirectoryArtifact(artifact, result, options) {
  const targetPath = resolvePath(desktopRoot, artifact.targetPath);
  result.path = targetPath;
  const targetExists = isDirectory(targetPath);
  const hasExpectedEntries = targetExists && validateExpectedEntries(targetPath, artifact, result, options);
  if (targetExists && hasExpectedEntries && result.errors.length === 0) {
    result.status = "ok";
    return result;
  }

  const sourcePath = getLocalSourcePath(artifact, options);
  if (!sourcePath) {
    addMissing(result, `Provide --artifact-root containing ${artifact.source?.path || artifact.id}`, artifact, options);
    return result;
  }
  if (!isDirectory(sourcePath)) {
    addMissing(result, `Source directory not found: ${sourcePath}`, artifact, options);
    return result;
  }

  if (options.dryRun || options.checkOnly) {
    result.status = options.checkOnly ? "missing" : "planned";
    result.actions.push(`Would copy ${sourcePath} -> ${toDisplayPath(targetPath)}`);
    return result;
  }

  fs.mkdirSync(targetPath, { recursive: true });
  fs.cpSync(sourcePath, targetPath, {
    recursive: true,
    force: options.force,
    errorOnExist: false
  });
  result.copied = true;
  validateExpectedEntries(targetPath, artifact, result, options);
  if (result.errors.length === 0) result.status = "provisioned";
  return result;
}

function provisionSystemBinary(artifact, result, options) {
  const source = artifact.source || {};
  const candidates = [];
  if (source.envVar && process.env[source.envVar]) {
    candidates.push(process.env[source.envVar]);
  }
  if (Array.isArray(source.candidates)) {
    candidates.push(...source.candidates);
  }

  const foundPath = candidates.map((item) => String(item || "").trim()).filter(Boolean)
    .find((candidate) => isFile(candidate));

  if (foundPath) {
    result.status = "ok";
    result.path = foundPath;
    return result;
  }

  const hints = Array.isArray(source.installHints) ? source.installHints : [];
  const message = `System binary not found for ${artifact.id}. Checked ${candidates.length} candidate(s).`;
  addMissing(result, message, artifact, options);
  hints.forEach((hint) => result.actions.push(hint));
  return result;
}

function provisionArtifact(artifact, options) {
  const result = createResult(artifact);
  if (!artifact.id || !artifact.kind) {
    result.status = "error";
    result.errors.push("Artifact must include id and kind.");
    return result;
  }

  if (artifact.kind === "file") {
    return provisionFileArtifact(artifact, result, options);
  }
  if (artifact.kind === "directory") {
    return provisionDirectoryArtifact(artifact, result, options);
  }
  if (artifact.kind === "system-binary") {
    return provisionSystemBinary(artifact, result, options);
  }

  result.status = "error";
  result.errors.push(`Unsupported artifact kind: ${artifact.kind}`);
  return result;
}

function printHumanReport(results, options) {
  console.log(`[resources] manifest=${options.manifestPath}`);
  console.log(`[resources] platform=${options.platform} desktopRoot=${desktopRoot}`);
  if (options.artifactRoot) {
    console.log(`[resources] artifactRoot=${options.artifactRoot}`);
  }

  results.forEach((result) => {
    const location = result.path ? ` ${toDisplayPath(result.path)}` : "";
    console.log(`[${result.status}] ${result.id}${location}`);
    result.warnings.forEach((warning) => console.log(`  warning: ${warning}`));
    result.errors.forEach((error) => console.log(`  error: ${error}`));
    result.actions.forEach((action) => console.log(`  action: ${action}`));
  });

  const counts = results.reduce((next, result) => {
    next[result.status] = (next[result.status] || 0) + 1;
    return next;
  }, {});
  console.log(`[resources] summary ${Object.entries(counts).map(([key, value]) => `${key}=${value}`).join(" ")}`);
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`[resources] ${error.message}`);
    printHelp();
    process.exit(2);
  }

  if (options.help) {
    printHelp();
    return;
  }

  const manifest = readJson(options.manifestPath);
  const artifacts = Array.isArray(manifest.artifacts) ? manifest.artifacts : [];
  const selected = artifacts.filter((artifact) => {
    if (!platformMatches(artifact, options.platform)) return false;
    if (options.artifacts.size === 0) return true;
    return options.artifacts.has(artifact.id);
  });

  const requestedMissing = Array.from(options.artifacts).filter((id) => !artifacts.some((artifact) => artifact.id === id));
  const results = selected.map((artifact) => provisionArtifact(artifact, options));
  requestedMissing.forEach((id) => {
    results.push({
      id,
      name: id,
      kind: "unknown",
      targetPath: null,
      status: "error",
      path: null,
      copied: false,
      warnings: [],
      errors: [`Unknown artifact id: ${id}`],
      actions: []
    });
  });

  if (options.json) {
    console.log(JSON.stringify({
      ok: results.every((result) => result.errors.length === 0),
      platform: options.platform,
      manifest: options.manifestPath,
      artifactRoot: options.artifactRoot || null,
      results
    }, null, 2));
  } else {
    printHumanReport(results, options);
  }

  if (results.some((result) => result.errors.length > 0)) {
    process.exit(1);
  }
}

main();
