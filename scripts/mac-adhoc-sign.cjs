// electron-builder afterPack hook: ad-hoc signs the macOS app bundle.
//
// The app ships without an Apple Developer ID, so electron-builder skips code
// signing. Packing app.asar into Electron.app breaks the signature Electron
// ships with, and Apple Silicon refuses to launch a bundle whose signature is
// broken ("Largs Hub is damaged and can't be opened"). An ad-hoc signature
// (`--sign -`) is enough to make it launch; Gatekeeper still asks the user to
// approve it once, since it isn't notarized.
const { execFileSync } = require("child_process");
const path = require("path");

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;
  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", appPath], {
    stdio: "inherit",
  });
};
