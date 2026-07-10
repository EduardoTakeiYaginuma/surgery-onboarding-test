import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

import { BrandedDialog } from "@/components/branded-dialog";

type ConfirmOptions = {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
};

type NoticeOptions = {
  title: string;
  message?: string;
  buttonText?: string;
};

type ActiveDialog =
  | ({ kind: "confirm" } & Required<Pick<ConfirmOptions, "title" | "confirmText" | "cancelText" | "destructive">> & {
      message?: string;
    })
  | ({ kind: "notice" } & Required<Pick<NoticeOptions, "title" | "buttonText">> & {
      message?: string;
    });

type DialogsApi = {
  /** Branded replacement for a two-button Alert.alert confirmation. Resolves
   * `true` when the user confirms, `false` when they cancel/dismiss. */
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  /** Branded replacement for a single-button Alert.alert notice. Resolves once
   * the user dismisses it. */
  notify: (options: NoticeOptions) => Promise<void>;
};

const DialogsContext = createContext<DialogsApi | null>(null);

/**
 * Imperative, promise-based access to the Camada-styled <BrandedDialog>, mounted
 * once at the app root. Lets any screen replace an off-brand `Alert.alert`
 * confirmation or notice with the branded modal via `await confirm(...)` /
 * `await notify(...)`, on both native and web. Only one dialog is shown at a
 * time; the resolver is held in a ref and fired on the user's choice.
 */
export function DialogsProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState<ActiveDialog | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const settle = useCallback((value: boolean) => {
    const resolve = resolveRef.current;
    resolveRef.current = null;
    setActive(null);
    resolve?.(value);
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setActive({
        kind: "confirm",
        title: options.title,
        message: options.message,
        confirmText: options.confirmText ?? "Confirmar",
        cancelText: options.cancelText ?? "Cancelar",
        destructive: options.destructive ?? false,
      });
    });
  }, []);

  const notify = useCallback((options: NoticeOptions) => {
    return new Promise<void>((resolve) => {
      resolveRef.current = () => resolve();
      setActive({
        kind: "notice",
        title: options.title,
        message: options.message,
        buttonText: options.buttonText ?? "Entendi",
      });
    });
  }, []);

  const api = useMemo<DialogsApi>(() => ({ confirm, notify }), [confirm, notify]);

  return (
    <DialogsContext.Provider value={api}>
      {children}
      {active ? (
        active.kind === "confirm" ? (
          <BrandedDialog
            open
            title={active.title}
            message={active.message}
            confirmText={active.confirmText}
            cancelText={active.cancelText}
            destructive={active.destructive}
            confirmTestID="dialog-confirm"
            cancelTestID="dialog-cancel"
            onConfirm={() => settle(true)}
            onOpenChange={(open) => {
              if (!open) settle(false);
            }}
          />
        ) : (
          <BrandedDialog
            open
            title={active.title}
            message={active.message}
            confirmText={active.buttonText}
            confirmTestID="dialog-confirm"
            onConfirm={() => settle(false)}
            onOpenChange={(open) => {
              if (!open) settle(false);
            }}
          />
        )
      ) : null}
    </DialogsContext.Provider>
  );
}

export function useDialogs(): DialogsApi {
  const ctx = useContext(DialogsContext);
  if (!ctx) {
    throw new Error("useDialogs must be used within a <DialogsProvider>");
  }
  return ctx;
}
