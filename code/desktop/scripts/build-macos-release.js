const path = require("path");
const { build, Platform } = require("electron-builder");
const packageJson = require("../package.json");
const { checkMacSigningEnvironment } = require("./check-macos-signing-env");

const desktopRoot = path.resolve(__dirname, "..");

async function main() {
  const signingReport = checkMacSigningEnvironment({ platform: process.platform });
  if (!signingReport.ok) {
    console.error("[mac-release] Signing environment is not ready. Run npm run signing:mac:check for details.");
    signingReport.issues.forEach((issue) => console.error(`[mac-release] ${issue}`));
    process.exit(1);
  }

  const config = {
    ...packageJson.build,
    mac: {
      ...packageJson.build.mac,
      target: ["dmg", "zip"],
      notarize: true,
      sign: {
        hardenedRuntime: true,
        entitlements: "build/entitlements.mac.plist",
        entitlementsInherit: "build/entitlements.mac.inherit.plist"
      }
    }
  };

  const artifacts = await build({
    projectDir: desktopRoot,
    targets: Platform.MAC.createTarget(["dmg", "zip"]),
    config
  });

  console.log(JSON.stringify({
    ok: true,
    artifacts
  }, null, 2));
}

main().catch((error) => {
  console.error(`[mac-release] ${error.stack || error.message}`);
  process.exit(1);
});
