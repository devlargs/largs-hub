import ParticleField from "./welcome/ParticleField";
import WelcomeFeatures from "./welcome/WelcomeFeatures";

interface WelcomeScreenProps {
  onAddService: () => void;
  hasServices: boolean;
}

export default function WelcomeScreen({ onAddService, hasServices }: WelcomeScreenProps) {
  // The root fills the content pane exactly and the inner layer scrolls, so on a
  // window too short for the content it scrolls instead of being clipped by the
  // pane's overflow-hidden. The particle field stays put behind it.
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ backgroundColor: "var(--surface)" }}>
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at 50% 25%, rgba(137,180,250,0.07) 0%, transparent 60%)",
          }}
        />
        <ParticleField />
      </div>

      <div className="relative h-full overflow-y-auto">
        <div
          className="welcome-content flex flex-col items-center justify-center min-h-full text-center max-sm:!px-4 max-sm:!py-6"
          style={{ padding: "48px 64px" }}
        >
          {/* Globe with glow */}
          <div className="relative welcome-globe max-sm:mb-6" style={{ marginBottom: 40 }}>
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: "radial-gradient(circle, rgba(137,180,250,0.45) 0%, transparent 70%)",
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
            style={{
              fontSize: 48,
              fontWeight: 800,
              marginBottom: 20,
              color: "var(--text-primary)",
            }}
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
            Your open-source workspace browser. Add your favorite web apps and manage them all one
            place with isolated sessions.
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
            {hasServices ? "Add Service" : "Add Your First Service"}
          </button>

          {/* Feature section with bracket connector */}
          <WelcomeFeatures />
        </div>
      </div>
    </div>
  );
}
