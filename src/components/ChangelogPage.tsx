import { useEffect, useMemo, useState } from "react";
// Bundled at build time, so an installed app shows the notes it shipped with
import changelogSource from "../../CHANGELOG.md?raw";
import { ChangelogInline, formatReleaseDate, parseChangelog } from "../lib/changelog";

function Inline({ nodes }: { nodes: ChangelogInline[] }) {
  return (
    <>
      {nodes.map((node, i) => {
        switch (node.type) {
          case "text":
            return <span key={i}>{node.value}</span>;
          case "strong":
            return (
              <strong key={i} style={{ color: "var(--text-primary)", fontWeight: 600 }}>
                <Inline nodes={node.children} />
              </strong>
            );
          case "code":
            return (
              <code
                key={i}
                className="rounded"
                style={{
                  padding: "1px 5px",
                  fontSize: "0.9em",
                  fontFamily: "var(--font-figure)",
                  color: "var(--text-primary)",
                  background: "color-mix(in srgb, var(--panel) 80%, var(--surface))",
                  border: "1px solid color-mix(in srgb, var(--border) 60%, transparent)",
                }}
              >
                {node.value}
              </code>
            );
          case "link":
            return (
              <a
                key={i}
                href={node.href}
                onClick={(e) => {
                  // Never navigate the app's own view
                  e.preventDefault();
                  window.electronAPI?.openLinkExternal(node.href);
                }}
                style={{
                  color: "var(--accent)",
                  textDecoration: "underline",
                  textUnderlineOffset: 2,
                }}
              >
                <Inline nodes={node.children} />
              </a>
            );
        }
      })}
    </>
  );
}

export default function ChangelogPage() {
  const releases = useMemo(() => parseChangelog(changelogSource), []);
  const [installedVersion, setInstalledVersion] = useState("");

  useEffect(() => {
    window.electronAPI
      ?.getAppVersion()
      .then(setInstalledVersion)
      .catch(() => undefined);
  }, []);

  return (
    // Same pane layout as SettingsPage, so the two read as one family
    <div
      className="@container overflow-auto"
      style={{ backgroundColor: "var(--surface)", width: "100%", height: "100%" }}
    >
      <div
        className="px-5 pt-6 pb-10 @lg:px-8 @lg:pt-8 @lg:pb-12"
        style={{ maxWidth: 720, margin: "0 auto" }}
      >
        <h1
          className="text-xl font-semibold"
          style={{ color: "var(--text-primary)", marginBottom: 6 }}
        >
          Changelog
        </h1>
        <p className="text-sm" style={{ color: "var(--text-muted)", marginBottom: 32 }}>
          What changed in each version of Largs Hub, newest first.
        </p>

        {releases.length === 0 && (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            No release notes found.
          </p>
        )}

        {releases.map((release) => (
          <section key={release.version} style={{ marginBottom: 32 }}>
            <h2
              className="flex items-baseline flex-wrap gap-x-3 gap-y-1"
              style={{
                paddingBottom: 8,
                marginBottom: 12,
                borderBottom: "1px solid var(--border)",
              }}
            >
              <span
                className="text-base font-semibold tabular-nums"
                style={{ color: "var(--text-primary)" }}
              >
                {release.unreleased ? "Unreleased" : `v${release.version}`}
              </span>
              {release.date && (
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {formatReleaseDate(release.date)}
                </span>
              )}
              {release.version === installedVersion && (
                <span
                  className="text-2xs rounded-full self-center"
                  style={{
                    padding: "1px 8px",
                    color: "var(--accent)",
                    border: "1px solid color-mix(in srgb, var(--accent) 45%, transparent)",
                  }}
                >
                  Installed
                </span>
              )}
            </h2>
            <ul className="flex flex-col gap-3" style={{ listStyle: "disc", paddingLeft: 18 }}>
              {release.entries.map((entry, i) => (
                <li
                  key={i}
                  className="text-sm"
                  style={{ color: "var(--text-secondary)", lineHeight: 1.6 }}
                >
                  <Inline nodes={entry} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
