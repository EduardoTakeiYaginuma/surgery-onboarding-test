import { BrandedDialog } from "@/components/branded-dialog";

const DEFAULT_TITLE = "Descartar alterações?";
const DEFAULT_MESSAGE =
  "Você tem edições que ainda não foram salvas. Se sair agora, elas serão perdidas.";
const DEFAULT_CANCEL = "Continuar editando";
const DEFAULT_CONFIRM = "Descartar e sair";

/**
 * Confirmation shown before leaving an edit screen with unsaved changes.
 *
 * Mirrors the web Console's DiscardChangesDialog (artifacts/console-kcl) in
 * copy, intent and Camada styling. A thin wrapper over the shared
 * <BrandedDialog>, so it stays visually identical to every other confirmation
 * on the mobile Console. Driven entirely by the useUnsavedChanges guard, which
 * supplies the copy and the open/confirm wiring.
 */
export function DiscardChangesDialog({
  open,
  onOpenChange,
  onConfirm,
  title = DEFAULT_TITLE,
  message = DEFAULT_MESSAGE,
  cancelText = DEFAULT_CANCEL,
  confirmText = DEFAULT_CONFIRM,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  title?: string;
  message?: string;
  cancelText?: string;
  confirmText?: string;
}) {
  return (
    <BrandedDialog
      open={open}
      onOpenChange={onOpenChange}
      onConfirm={onConfirm}
      title={title}
      message={message}
      cancelText={cancelText}
      confirmText={confirmText}
      cancelTestID="continuar-editando"
      confirmTestID="descartar-sair"
    />
  );
}
