import { Toaster } from "sonner";
import { Header } from "./header";
import { Sidebar } from "./sidebar";

interface MainLayoutProps {
  children: React.ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="h-screen overflow-hidden bg-stone-100 dark:bg-stone-950 text-foreground">
      <Header />
      <div className="flex h-screen pt-[70px] px-4 pb-4 gap-4 overflow-hidden">
        <Sidebar />
        <main className="flex-1 h-full overflow-hidden">
          <div className="h-full rounded-lg border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-900 overflow-hidden">
            <div className="h-full overflow-y-auto px-6 py-4">{children}</div>
          </div>
        </main>
      </div>
      <Toaster richColors />
    </div>
  );
}
