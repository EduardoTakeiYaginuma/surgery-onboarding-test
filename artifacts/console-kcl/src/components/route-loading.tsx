import { useEffect, useState } from "react";

/**
 * Suspense fallback for code-split Console routes. Renders a thin champagne
 * progress bar pinned to the top of the viewport — the brand's "champanhe só
 * em fio" line — so a slow chunk load reads as intentional rather than a blank
 * flash.
 *
 * The bar is held back by a short delay so genuinely fast navigations (chunk
 * already cached) never flicker it on screen. It only mounts the visible bar
 * once the route has been pending past the threshold.
 */
export function RouteLoading({ delayMs = 150 }: { delayMs?: number }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs]);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Carregando página"
      className="fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden bg-accent/15"
    >
      <div className="route-loading-bar h-full w-2/5 bg-accent" />
    </div>
  );
}
