const { spawnSync } = require("child_process");

function parseArgs(argv) {
  const options = {
    platform: process.platform,
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

    if (arg === "--platform") {
      options.platform = readValue();
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

function printHelp() {
  console.log(`Usage: node scripts/check-macos-signing-env.js [options]

Options:
  --platform <name>  Platform to check. Defaults to process.platform.
  --json             Print machine-readable JSON.
  --help             Show this help.
`);
}

function hasEnv(name, env = process.env) {
  return String(env[name] || "").trim().length > 0;
}

function findCodeSigningIdentities() {
  if (process.platform !== "darwin") {
    return {
      ok: false,
      count: 0,
      developerIdCount: 0,
      error: "security command is only available on macOS."
    };
  }

  const result = spawnSync("security", ["find-identity", "-v", "-p", "codesigning"], {
    encoding: "utf8",
    timeout: 10000
  });

  if (result.error) {
    return {
      ok: false,
      count: 0,
      developerIdCount: 0,
      error: result.error.message
    };
  }

  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  const countMatch = output.match(/^\s*(\d+)\s+valid identities found\s*$/im);
  const count = countMatch ? Number(countMatch[1]) : 0;
  const developerIdCount = output.split(/\r?\n/)
    .filter((line) => /Developer ID Application/i.test(line))
    .length;

  return {
    ok: Number(result.status) === 0,
    count,
    developerIdCount,
    error: Number(result.status) === 0 ? "" : output.trim()
  };
}

function checkMacSigningEnvironment({ env = process.env, platform = process.platform } = {}) {
  const issues = [];
  const warnings = [];
  const identity = platform === "darwin"
    ? findCodeSigningIdentities()
    : { ok: false, count: 0, developerIdCount: 0, error: "not_darwin" };

  if (platform !== "darwin") {
    issues.push("macOS release signing must run on a darwin host.");
  }

  const hasCertificateEnv = hasEnv("CSC_LINK", env) && hasEnv("CSC_KEY_PASSWORD", env);
  const hasLocalDeveloperId = identity.developerIdCount > 0;
  if (!hasCertificateEnv && !hasLocalDeveloperId) {
    issues.push("Missing signing identity. Set CSC_LINK and CSC_KEY_PASSWORD, or install a Developer ID Application certificate in the login keychain.");
  }
  if (hasEnv("CSC_LINK", env) && !hasEnv("CSC_KEY_PASSWORD", env)) {
    issues.push("CSC_LINK is set but CSC_KEY_PASSWORD is missing.");
  }

  const hasAppleIdAuth = hasEnv("APPLE_ID", env)
    && hasEnv("APPLE_APP_SPECIFIC_PASSWORD", env)
    && hasEnv("APPLE_TEAM_ID", env);
  const hasApiKeyAuth = hasEnv("APPLE_API_KEY", env)
    && hasEnv("APPLE_API_KEY_ID", env)
    && hasEnv("APPLE_API_ISSUER", env)
    && hasEnv("APPLE_TEAM_ID", env);
  if (!hasAppleIdAuth && !hasApiKeyAuth) {
    issues.push("Missing notarization credentials. Use APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID, or APPLE_API_KEY + APPLE_API_KEY_ID + APPLE_API_ISSUER + APPLE_TEAM_ID.");
  }

  if (hasEnv("GH_TOKEN", env) && hasEnv("GITHUB_TOKEN", env)) {
    warnings.push("Both GH_TOKEN and GITHUB_TOKEN are present; electron-builder will only need one publish token.");
  }

  return {
    ok: issues.length === 0,
    platform,
    checks: {
      certificate: {
        ok: hasCertificateEnv || hasLocalDeveloperId,
        source: hasCertificateEnv ? "env:CSC_LINK" : (hasLocalDeveloperId ? "keychain:Developer ID Application" : "missing"),
        keychainIdentityCount: identity.count,
        keychainDeveloperIdCount: identity.developerIdCount
      },
      notarization: {
        ok: hasAppleIdAuth || hasApiKeyAuth,
        source: hasApiKeyAuth ? "env:app-store-connect-api-key" : (hasAppleIdAuth ? "env:apple-id" : "missing")
      },
      publishToken: {
        ok: hasEnv("GH_TOKEN", env) || hasEnv("GITHUB_TOKEN", env),
        source: hasEnv("GH_TOKEN", env) ? "env:GH_TOKEN" : (hasEnv("GITHUB_TOKEN", env) ? "env:GITHUB_TOKEN" : "missing"),
        requiredFor: "GitHub release publishing only; artifact upload does not require this preflight locally."
      }
    },
    warnings,
    issues
  };
}

function printHumanReport(report) {
  console.log(`[mac-signing] platform=${report.platform}`);
  console.log(`[mac-signing] certificate=${report.checks.certificate.ok ? "ok" : "missing"} source=${report.checks.certificate.source}`);
  console.log(`[mac-signing] notarization=${report.checks.notarization.ok ? "ok" : "missing"} source=${report.checks.notarization.source}`);
  console.log(`[mac-signing] publishToken=${report.checks.publishToken.ok ? "ok" : "missing"} source=${report.checks.publishToken.source}`);
  report.warnings.forEach((warning) => console.log(`[mac-signing] warning: ${warning}`));
  report.issues.forEach((issue) => console.error(`[mac-signing] error: ${issue}`));
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`[mac-signing] ${error.message}`);
    printHelp();
    process.exit(2);
  }

  if (options.help) {
    printHelp();
    return;
  }

  const report = checkMacSigningEnvironment({ platform: options.platform });
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHumanReport(report);
  }

  if (!report.ok) {
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  checkMacSigningEnvironment,
  findCodeSigningIdentities
};
