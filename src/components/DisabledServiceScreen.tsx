interface DisabledServiceScreenProps {
  serviceName: string;
  onEnable: () => void;
}

export default function DisabledServiceScreen({ serviceName, onEnable }: DisabledServiceScreenProps) {
  return (
    <div
      className="flex flex-col items-center justify-center"
      style={{ backgroundColor: "var(--surface)", width: "100%", height: "100%" }}
    >
      {/* Decorative background dots */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              width: `${2 + Math.random() * 3}px`,
              height: `${2 + Math.random() * 3}px`,
              top: `${Math.random() * 100}%`,
              left: `${Math.random() * 100}%`,
              opacity: 0.06 + Math.random() * 0.1,
              backgroundColor: "var(--text-muted)",
              animation: `twinkle ${4 + Math.random() * 4}s ease-in-out infinite`,
              animationDelay: `${Math.random() * 5}s`,
            }}
          />
        ))}
      </div>

      <div className="relative flex flex-col items-center text-center" style={{ maxWidth: 400, padding: 40 }}>
        {/* Sleeping/paused icon */}
        <div
          className="flex items-center justify-center rounded-full"
          style={{
            width: 80,
            height: 80,
            backgroundColor: "color-mix(in srgb, var(--text-muted) 10%, transparent)",
            marginBottom: 32,
          }}
        >
          <svg
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--text-muted)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {/* Moon / sleep icon */}
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        </div>

        {/* Zzz animation */}
        <div className="absolute" style={{ top: 12, right: 120 }}>
          <span
            className="text-lg font-bold"
            style={{
              color: "var(--text-muted)",
              opacity: 0.4,
              animation: "float-z 3s ease-in-out infinite",
            }}
          >
            z
          </span>
          <span
            className="text-sm font-bold absolute"
            style={{
              color: "var(--text-muted)",
              opacity: 0.25,
              top: -12,
              left: 10,
              animation: "float-z 3s ease-in-out infinite 0.5s",
            }}
          >
            z
          </span>
          <span
            className="text-xs font-bold absolute"
            style={{
              color: "var(--text-muted)",
              opacity: 0.15,
              top: -20,
              left: 18,
              animation: "float-z 3s ease-in-out infinite 1s",
            }}
          >
            z
          </span>
        </div>

        <h2
          className="text-xl font-semibold"
          style={{ color: "var(--text-primary)", marginBottom: 12 }}
        >
          Nothing to do here
        </h2>
        <p
          className="text-sm"
          style={{ color: "var(--text-muted)", marginBottom: 32, lineHeight: 1.6 }}
        >
          This service is currently disabled. Enable it to start using {serviceName} again.
        </p>

        <button
          onClick={onEnable}
          className="cursor-pointer transition-all hover:opacity-90"
          style={{
            padding: "12px 32px",
            fontSize: 14,
            fontWeight: 600,
            color: "var(--text-primary)",
            borderRadius: 9999,
            border: "2px solid var(--accent)",
            background: "color-mix(in srgb, var(--accent) 15%, transparent)",
            boxShadow: "0 0 20px color-mix(in srgb, var(--accent) 30%, transparent)",
          }}
        >
          Enable {serviceName}
        </button>
      </div>

      <style>{`
        @keyframes float-z {
          0%, 100% { transform: translateY(0); opacity: 0.4; }
          50% { transform: translateY(-8px); opacity: 0.15; }
        }
      `}</style>
    </div>
  );
}
