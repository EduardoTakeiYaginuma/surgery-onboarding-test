import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

const EstratosLogo = ({ className }: { className?: string }) => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <rect x="0" y="4" width="8" height="2" fill="currentColor" />
    <rect x="0" y="11" width="16" height="2" fill="currentColor" />
    <rect x="0" y="18" width="24" height="2" fill="currentColor" />
  </svg>
);

type ConnectionErrorProps = {
  onRetry: () => void;
  isRetrying?: boolean;
};

/**
 * Camada-dark connection-error view for the Console (home, patient detail).
 * Mirrors the styling of `not-found.tsx` and the existing console error blocks.
 */
export function ConnectionErrorConsole({ onRetry, isRetrying = false }: ConnectionErrorProps) {
  return (
    <div className="min-h-[100dvh] w-full flex flex-col items-center justify-center bg-background text-foreground font-sans selection:bg-accent/30 p-4">
      <EstratosLogo className="text-accent mb-12 opacity-50" />

      <div className="text-center space-y-6 max-w-md w-full">
        <h1 className="text-4xl font-serif font-light text-foreground">
          Sem conexão com o servidor
        </h1>
        <p className="text-muted-foreground font-light leading-relaxed text-lg">
          Não foi possível carregar os dados agora. Isso costuma ser
          temporário — seus dados estão seguros. Tente novamente em instantes.
        </p>

        <div className="pt-8">
          <Button
            onClick={onRetry}
            disabled={isRetrying}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium rounded-none px-8 h-12 w-full transition-all disabled:opacity-60"
          >
            <RefreshCw className={"w-4 h-4 mr-2" + (isRetrying ? " animate-spin" : "")} />
            {isRetrying ? "Tentando..." : "Tentar novamente"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Dra. Karla light connection-error view for the public patient page.
 * Zero Camada branding — matches the light public-patient styling.
 */
export function ConnectionErrorPublic({ onRetry, isRetrying = false }: ConnectionErrorProps) {
  return (
    <div className="min-h-[100dvh] bg-[var(--pp-bg)] text-[var(--pp-text)] flex flex-col items-center justify-center p-6 font-sans selection:bg-[var(--pp-accent)]/20">
      <div className="text-center space-y-6 max-w-md w-full">
        <h1 className="font-serif text-3xl text-[var(--pp-accent)] italic">
          Estamos com instabilidade
        </h1>
        <p className="opacity-70 font-light leading-relaxed">
          Não foi possível carregar sua página agora. Pode ser uma instabilidade
          momentânea de conexão — seu link continua válido. Tente novamente em
          instantes.
        </p>

        <div className="pt-4">
          <button
            type="button"
            onClick={onRetry}
            disabled={isRetrying}
            className="group inline-flex items-center justify-center gap-3 bg-[var(--pp-surface)] border border-[var(--pp-accent)]/25 hover:border-[var(--pp-accent)]/70 transition-colors px-8 py-4 disabled:opacity-60"
          >
            <RefreshCw
              className={"w-4 h-4 text-[var(--pp-accent)] stroke-[1.5] shrink-0" + (isRetrying ? " animate-spin" : "")}
            />
            <span className="font-expanded text-[10px] tracking-widest uppercase text-[var(--pp-text)]">
              {isRetrying ? "Tentando..." : "Tentar novamente"}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
