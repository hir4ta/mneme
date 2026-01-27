import { useState } from "react";
import { Link } from "react-router";

function SecurityBanner() {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div className="bg-amber-500/10 border-b border-amber-500/30 px-4 py-1.5">
      <div className="flex items-center justify-center gap-2 text-xs text-amber-700 dark:text-amber-400">
        <span className="font-medium">
          ⚠️ No authentication - Local development only
        </span>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="ml-2 text-amber-600 hover:text-amber-800 dark:hover:text-amber-300"
          aria-label="Dismiss warning"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

export function Header() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50">
      <SecurityBanner />
      <div className="mx-4 mt-2">
        <div className="flex h-12 items-center justify-between rounded-xl border border-border/70 bg-white/70 px-4 backdrop-blur-md dark:bg-gray-900/70">
          <Link to="/" className="flex items-center font-semibold">
            <span className="text-2xl tracking-tight">memoria dashboard</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
