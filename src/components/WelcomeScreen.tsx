interface WelcomeScreenProps {
  onAddService: () => void;
}

export default function WelcomeScreen({ onAddService }: WelcomeScreenProps) {
  return (
    <div
      className="relative flex flex-col items-center justify-center min-h-full text-center overflow-y-auto max-sm:px-4 max-sm:py-6"
      style={{ padding: "48px 64px" }}
    >
      {/* Starfield background */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at 50% 25%, rgba(137,180,250,0.07) 0%, transparent 60%)",
          }}
        />
        {[...Array(30)].map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-white"
            style={{
              width: `${1 + Math.random() * 1.5}px`,
              height: `${1 + Math.random() * 1.5}px`,
              top: `${Math.random() * 100}%`,
              left: `${Math.random() * 100}%`,
              opacity: 0.08 + Math.random() * 0.25,
              animation: `twinkle ${3 + Math.random() * 4}s ease-in-out infinite`,
              animationDelay: `${Math.random() * 5}s`,
            }}
          />
        ))}
      </div>

      {/* Globe with glow */}
      <div className="relative welcome-globe max-sm:mb-6" style={{ marginBottom: 40 }}>
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(137,180,250,0.45) 0%, transparent 70%)",
            transform: "scale(2.2)",
            filter: "blur(24px)",
          }}
        />
        <svg
          className="relative max-sm:!w-24 max-sm:!h-24"
          style={{ width: 144, height: 144 }}
          viewBox="0 0 120 120"
          fill="none"
        >
          <circle cx="60" cy="60" r="50" stroke="url(#g)" strokeWidth="3.5" />
          <ellipse cx="60" cy="60" rx="20" ry="50" stroke="url(#g)" strokeWidth="3" />
          <ellipse cx="60" cy="60" rx="38" ry="50" stroke="url(#g)" strokeWidth="2.5" />
          <line x1="10" y1="42" x2="110" y2="42" stroke="url(#g)" strokeWidth="2.5" />
          <line x1="10" y1="60" x2="110" y2="60" stroke="url(#g)" strokeWidth="2.5" />
          <line x1="10" y1="78" x2="110" y2="78" stroke="url(#g)" strokeWidth="2.5" />
          <defs>
            <linearGradient id="g" x1="20" y1="15" x2="100" y2="105">
              <stop stopColor="#89b4fa" />
              <stop offset="1" stopColor="#74c7ec" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {/* Title */}
      <h1
        className="relative tracking-tight welcome-title max-sm:!text-3xl max-sm:!mb-3"
        style={{ fontSize: 48, fontWeight: 800, marginBottom: 20, color: "var(--text-primary)" }}
      >
        Welcome to Largs Hub
      </h1>

      {/* Subtitle */}
      <p
        className="relative welcome-subtitle max-sm:!text-sm max-sm:!mb-6 max-sm:!max-w-xs"
        style={{
          color: "var(--text-secondary)",
          fontSize: 18,
          lineHeight: 1.7,
          maxWidth: 520,
          marginBottom: 40,
        }}
      >
        Your open-source workspace browser. Add your favorite web
        apps and manage them all one place with isolated sessions.
      </p>

      {/* CTA Button */}
      <button
        onClick={onAddService}
        className="relative z-10 cursor-pointer transition-all welcome-cta max-sm:!text-sm max-sm:!px-6 max-sm:!py-3"
        style={{
          padding: "16px 40px",
          fontSize: 16,
          fontWeight: 600,
          color: "var(--text-primary)",
          borderRadius: 9999,
          border: "2px solid var(--accent)",
          background: "color-mix(in srgb, var(--accent) 15%, transparent)",
          boxShadow: "0 0 24px color-mix(in srgb, var(--accent) 45%, transparent)",
          marginBottom: 24,
        }}
      >
        Add Your First Service
      </button>

      {/* Feature section with bracket connector */}
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
              className="max-sm:!w-10 max-sm:!h-10"
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
              className="max-sm:!w-10 max-sm:!h-10"
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
              className="max-sm:!w-10 max-sm:!h-10"
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
    </div>
  );
}
