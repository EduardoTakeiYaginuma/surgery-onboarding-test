import { useNavigation } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";

// NOTE: this app builds with the React Compiler enabled
// (`transform.reactCompiler=true`). Routing `dirty` through a render-phase ref
// and reading it from a memoized callback is unsafe there — the compiler can
// cache the callback (and the inline `onPress`/`onClick` that wraps it) with a
// stale view of the ref, so the guard would see `dirty === false` even after the
// user edited the form. To stay correct under the compiler, the guard takes
// `dirty` as a direct dependency of its callbacks instead of reading it from a
// ref.

const DEFAULT_TITLE = "Descartar alterações?";
const DEFAULT_MESSAGE =
  "Você tem edições que ainda não foram salvas. Se sair agora, elas serão perdidas.";
const DEFAULT_CANCEL = "Continuar editando";
const DEFAULT_CONFIRM = "Descartar e sair";

type GuardOptions = {
  title?: string;
  message?: string;
  cancelText?: string;
  confirmText?: string;
};

/**
 * Warns before leaving a screen that has unsaved edits.
 *
 * Mirrors the web Console's unsaved-changes guard. On native, React
 * Navigation's `beforeRemove` event covers the hardware back button and the
 * swipe-back gesture. Explicit in-app navigation (header "X"/back buttons)
 * should be wrapped with the returned `guardNavigation`, which also makes the
 * guard fire on web — where `router.back()` flows through browser history and
 * never reaches `beforeRemove`.
 *
 * `allowLeave` lets a screen bypass the guard for an intentional navigation
 * that follows a successful save (the fields are still "dirty" at that moment,
 * but the data is persisted, so we must not prompt).
 *
 * The confirmation is rendered by the consuming screen through the returned
 * `dialogProps` (a styled <DiscardChangesDialog>), not the OS-default Alert /
 * browser window.confirm.
 */
export function useUnsavedChanges(dirty: boolean, options?: GuardOptions) {
  const navigation = useNavigation();
  const bypassRef = useRef(false);

  // Branded confirmation state. Instead of the OS-default Alert / browser
  // window.confirm, the guard drives a styled <DiscardChangesDialog> rendered
  // by the consuming screen via the returned `dialogProps`. The pending
  // navigation is held in a ref and fired only when the user confirms.
  const [dialogOpen, setDialogOpen] = useState(false);
  const pendingRef = useRef<(() => void) | null>(null);

  const allowLeave = useCallback(() => {
    bypassRef.current = true;
  }, []);

  const prompt = useCallback((onConfirm: () => void) => {
    pendingRef.current = onConfirm;
    setDialogOpen(true);
  }, []);

  const handleConfirm = useCallback(() => {
    setDialogOpen(false);
    const run = pendingRef.current;
    pendingRef.current = null;
    run?.();
  }, []);

  const handleCancel = useCallback(() => {
    setDialogOpen(false);
    pendingRef.current = null;
  }, []);

  // Wrap explicit in-app navigation (header X / back buttons). Works on every
  // platform; when clean it navigates immediately, when dirty it confirms first.
  const guardNavigation = useCallback(
    (navigate: () => void) => {
      if (!dirty) {
        navigate();
        return;
      }
      prompt(() => {
        bypassRef.current = true;
        navigate();
      });
    },
    [dirty, prompt]
  );

  // Native hardware back / swipe-back gesture flow through `beforeRemove`.
  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", (event) => {
      const e = event as unknown as {
        preventDefault: () => void;
        data: { action: Parameters<typeof navigation.dispatch>[0] };
      };
      if (!dirty || bypassRef.current) return;
      e.preventDefault();
      prompt(() => {
        bypassRef.current = true;
        navigation.dispatch(e.data.action);
      });
    });

    return unsubscribe;
  }, [navigation, prompt, dirty]);

  const dialogProps = {
    open: dialogOpen,
    onOpenChange: (open: boolean) => {
      if (!open) handleCancel();
    },
    onConfirm: handleConfirm,
    title: options?.title ?? DEFAULT_TITLE,
    message: options?.message ?? DEFAULT_MESSAGE,
    cancelText: options?.cancelText ?? DEFAULT_CANCEL,
    confirmText: options?.confirmText ?? DEFAULT_CONFIRM,
  };

  return { allowLeave, guardNavigation, dialogProps };
}
