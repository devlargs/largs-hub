/** The bracket connector and the three feature highlights under the welcome screen's CTA. */
export default function WelcomeFeatures() {
  return (
    <div className="relative welcome-feature-section" style={{ width: "100%", maxWidth: 640 }}>
      {/* Vertical line from button */}
      <div
        className="welcome-connector-line max-sm:hidden"
        style={{
          width: 1,
          height: 40,
          background: "#585b70",
          margin: "0 auto",
        }}
      />

      {/* Bracket connector SVG */}
      <svg
        className="welcome-connector-svg max-sm:hidden"
        style={{ width: "100%", height: 40, display: "block" }}
        viewBox="0 0 640 40"
        fill="none"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Top horizontal line */}
        <line x1="107" y1="1" x2="533" y2="1" stroke="#585b70" strokeWidth="1.5" />
        {/* Left vertical drop */}
        <line x1="107" y1="1" x2="107" y2="40" stroke="#585b70" strokeWidth="1.5" />
        {/* Center vertical drop */}
        <line x1="320" y1="1" x2="320" y2="40" stroke="#585b70" strokeWidth="1.5" />
        {/* Right vertical drop */}
        <line x1="533" y1="1" x2="533" y2="40" stroke="#585b70" strokeWidth="1.5" />
      </svg>

      {/* Feature cards */}
      <div
        className="welcome-features max-sm:!grid-cols-1 max-sm:!gap-5 max-sm:!mt-0"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 48,
          marginTop: 8,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 16,
          }}
        >
          <svg
            className="welcome-feature-icon max-sm:!w-10 max-sm:!h-10"
            style={{ width: 56, height: 56 }}
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--text-primary)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0110 0v4" />
            <circle cx="12" cy="16" r="1" fill="var(--text-primary)" />
          </svg>
          <span style={{ color: "var(--text-primary)", fontSize: 18, fontWeight: 500 }}>
            Isolated sessions
          </span>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 16,
          }}
        >
          <svg
            className="welcome-feature-icon max-sm:!w-10 max-sm:!h-10"
            style={{ width: 56, height: 56 }}
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--text-primary)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 01-3.46 0" />
          </svg>
          <span style={{ color: "var(--text-primary)", fontSize: 18, fontWeight: 500 }}>
            Notification badges
          </span>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 16,
          }}
        >
          <svg
            className="welcome-feature-icon max-sm:!w-10 max-sm:!h-10"
            style={{ width: 56, height: 56 }}
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--text-primary)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polygon points="13,2 3,14 12,14 11,22 21,10 12,10" />
          </svg>
          <span style={{ color: "var(--text-primary)", fontSize: 18, fontWeight: 500 }}>
            Fast switching
          </span>
        </div>
      </div>
    </div>
  );
}
