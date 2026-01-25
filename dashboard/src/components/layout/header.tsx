import { Link } from "react-router";

export function Header() {
  return (
    <header className="fixed top-4 left-4 right-4 z-50">
      <div className="flex h-12 items-center justify-between rounded-xl border border-border/70 bg-white/70 px-4 backdrop-blur-md">
        <Link to="/" className="flex items-center font-semibold">
          <span className="text-2xl tracking-tight">memoria dashboard</span>
        </Link>
      </div>
    </header>
  );
}
