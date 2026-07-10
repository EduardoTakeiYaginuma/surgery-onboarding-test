import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function DiscardChangesDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="bg-background border border-border text-foreground rounded-none">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-serif text-2xl font-light text-foreground">
            Descartar alterações?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-muted-foreground font-light">
            Você tem alterações que ainda não foram salvas. Se sair agora, elas serão perdidas.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="rounded-none border-border bg-transparent hover:bg-card text-foreground">
            Continuar editando
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="rounded-none bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            Descartar e sair
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
