import { Info, X } from "lucide-react";
import { useCallback, useState } from "react";

const STORAGE_PREFIX = "mneme-page-desc-";

function getStoredState(pageKey: string): boolean {
  try {
    const value = localStorage.getItem(`${STORAGE_PREFIX}${pageKey}`);
    return value === null ? true : value === "open";
  } catch {
    return true;
  }
}

function setStoredState(pageKey: string, open: boolean): void {
  try {
    localStorage.setItem(
      `${STORAGE_PREFIX}${pageKey}`,
      open ? "open" : "closed",
    );
  } catch {
    // Ignore storage errors
  }
}

interface PageDescriptionTriggerProps {
  pageKey: string;
  open: boolean;
  onToggle: () => void;
}

/**
 * Inline trigger button — place next to subtitle text.
 */
function PageDescriptionTrigger({
  open,
  onToggle,
}: PageDescriptionTriggerProps) {
  if (open) return null;
  return (
    <button
      type="button"
      onClick={onToggle}
      className="inline-flex items-center justify-center self-end rounded-full p-1 text-muted-foreground/60 hover:text-foreground hover:bg-muted/60 transition-colors"
      aria-label="Show page description"
    >
      <Info className="h-4 w-4" />
    </button>
  );
}

interface PageDescriptionPanelProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

/**
 * Expandable description panel — place as a separate block below the header.
 */
function PageDescriptionPanel({
  open,
  onClose,
  children,
}: PageDescriptionPanelProps) {
  if (!open) return null;
  return (
    <div className="relative mt-3 text-sm text-muted-foreground leading-relaxed rounded-lg border border-border/40 bg-muted/20 px-4 py-3 pr-10">
      {children}
      <button
        type="button"
        onClick={onClose}
        className="absolute top-2.5 right-2.5 rounded-full p-1 text-[#E67E22] hover:text-[#d35400] hover:bg-muted/60 transition-colors"
        aria-label="Close description"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

interface PageDescriptionProps {
  pageKey: string;
  children: React.ReactNode;
}

/**
 * Page description with persistent open/close state.
 *
 * Usage:
 * ```tsx
 * const desc = usePageDescription("sessions");
 *
 * <div className="flex items-center gap-2">
 *   <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
 *   <desc.Trigger />
 * </div>
 * <desc.Panel>{t("pageDescription")}</desc.Panel>
 * ```
 */
export function usePageDescription(pageKey: string) {
  const [open, setOpen] = useState(() => getStoredState(pageKey));

  const toggle = useCallback(() => {
    const next = !open;
    setOpen(next);
    setStoredState(pageKey, next);
  }, [pageKey, open]);

  const close = useCallback(() => {
    setOpen(false);
    setStoredState(pageKey, false);
  }, [pageKey]);

  const Trigger = useCallback(
    () => (
      <PageDescriptionTrigger pageKey={pageKey} open={open} onToggle={toggle} />
    ),
    [pageKey, open, toggle],
  );

  const Panel = useCallback(
    ({ children }: { children: React.ReactNode }) => (
      <PageDescriptionPanel open={open} onClose={close}>
        {children}
      </PageDescriptionPanel>
    ),
    [open, close],
  );

  return { open, toggle, close, Trigger, Panel };
}

// Keep backward-compatible single-component export
export function PageDescription({ pageKey, children }: PageDescriptionProps) {
  const { Trigger, Panel } = usePageDescription(pageKey);
  return (
    <div className="space-y-2">
      <Trigger />
      <Panel>{children}</Panel>
    </div>
  );
}
