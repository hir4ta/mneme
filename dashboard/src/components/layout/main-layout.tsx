import { Header } from "./header";
import { Sidebar } from "./sidebar";

interface MainLayoutProps {
  children: React.ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <div className="flex h-screen pt-[100px] px-4 pb-4 gap-4 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-hidden">
          <div className="h-full overflow-y-auto rounded-xl border border-border/70 bg-white/60 backdrop-blur-md">
            <div className="min-h-full px-8 py-8">{children}</div>
          </div>
        </main>
      </div>
    </div>
  );
}
