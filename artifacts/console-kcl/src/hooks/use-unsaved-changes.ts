import { useEffect, useRef } from "react";

const SENTINEL_STATE = { __unsavedGuard: true };

export function useUnsavedChanges(dirty: boolean, onBlockNavigation?: () => void) {
  const callbackRef = useRef(onBlockNavigation);
  callbackRef.current = onBlockNavigation;

  useEffect(() => {
    if (!dirty) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    // Trap in-app browser Back/Forward: push a sentinel entry (same URL) so the
    // first history navigation pops it — keeping us on the page — and lets us
    // ask for confirmation instead of silently losing the edits.
    window.history.pushState(SENTINEL_STATE, "", window.location.href);

    const handlePopState = () => {
      // Re-arm the trap so the user stays put, then prompt.
      window.history.pushState(SENTINEL_STATE, "", window.location.href);
      callbackRef.current?.();
    };
    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("popstate", handlePopState);
    };
  }, [dirty]);
}
