interface WelcomeScreenProps {
  onAddService: () => void;
}

export default function WelcomeScreen({ onAddService }: WelcomeScreenProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8">
      <div className="text-6xl mb-6">🌐</div>
      <h1 className="text-2xl font-bold text-white mb-2">Welcome to Largs Hub</h1>
      <p className="text-gray-400 mb-8 max-w-md">
        Your open-source workspace browser. Add your favorite web apps and
        manage them all in one place with isolated sessions.
      </p>
      <button
        onClick={onAddService}
        className="px-6 py-3 bg-accent text-[#1e1e2e] font-medium rounded-xl hover:brightness-110 transition-all text-sm"
      >
        Add your first service
      </button>
      <div className="mt-12 grid grid-cols-3 gap-6 text-gray-500 text-xs">
        <div className="flex flex-col items-center gap-2">
          <span className="text-2xl">🔒</span>
          <span>Isolated sessions</span>
        </div>
        <div className="flex flex-col items-center gap-2">
          <span className="text-2xl">🔔</span>
          <span>Notification badges</span>
        </div>
        <div className="flex flex-col items-center gap-2">
          <span className="text-2xl">⚡</span>
          <span>Fast switching</span>
        </div>
      </div>
    </div>
  );
}
