// Fails when the Electron in package-lock.json is out of Electron's support
// window, and warns when it's the oldest major still in it.
//
//   node scripts/check-electron-support.cjs
//
// Electron supports the latest three stable majors. An unsupported major stops
// getting Chromium and V8 security fixes, and every service view runs
// logged-in third-party pages on it, so the scheduled electron-support workflow
// runs this weekly: a failed run is the reminder to upgrade.
const fs = require("fs");
const path = require("path");

const SUPPORTED_MAJORS = 3;

function major(version) {
  const match = /^(\d+)\./.exec(version ?? "");
  if (!match) throw new Error(`not a version: ${version}`);
  return Number(match[1]);
}

// Pure so it can be tested. "ok" while newer majors are still supported,
// "last" on the oldest supported major (the next Electron release ends it),
// "unsupported" once it's out of the window.
function electronSupport(installed, latest) {
  const installedMajor = major(installed);
  const oldestSupported = major(latest) - SUPPORTED_MAJORS + 1;
  const status =
    installedMajor < oldestSupported
      ? "unsupported"
      : installedMajor === oldestSupported
        ? "last"
        : "ok";
  return { status, installedMajor, oldestSupported };
}

exports.electronSupport = electronSupport;

async function main() {
  const lock = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package-lock.json"), "utf8"));
  const installed = lock.packages?.["node_modules/electron"]?.version;
  const res = await fetch("https://registry.npmjs.org/electron/latest");
  if (!res.ok) throw new Error(`npm registry answered ${res.status}`);
  const { version: latest } = await res.json();
  const { status, oldestSupported } = electronSupport(installed, latest);
  const summary = `Electron ${installed} is installed; the latest is ${latest}, and ${oldestSupported} is the oldest supported major.`;
  if (status === "unsupported") {
    console.error(`::error::${summary} Upgrade Electron: this one no longer gets security fixes.`);
    process.exit(1);
  }
  if (status === "last") {
    console.log(`::warning::${summary} The next Electron major ends support for this one.`);
  } else {
    console.log(summary);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
