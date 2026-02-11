import { useEffect, useState } from "react";
import { Link } from "react-router";
import { LanguageSwitcher } from "@/components/language-switcher";
import { getProject } from "@/lib/api";

export function Header() {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    getProject().then((p) => setVersion(p.version));
  }, []);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 mt-1">
      <div className="mx-4 mt-2">
        <div className="flex h-12 items-center justify-between rounded-lg border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-900 px-4">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <img src="/favicon-64-max.png" alt="mneme" className="h-7 w-7" />
            <span className="text-2xl tracking-tight text-stone-800 dark:text-stone-100">
              mneme
            </span>
            {version && (
              <span className="text-xs text-stone-400 dark:text-stone-500 font-normal self-end mb-0.5">
                v{version}
              </span>
            )}
          </Link>
          <LanguageSwitcher />
        </div>
      </div>
    </header>
  );
}
