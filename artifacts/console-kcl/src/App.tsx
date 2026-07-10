import { lazy, Suspense } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { isConnectivityError } from "@workspace/api-client-react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RouteLoading } from "@/components/route-loading";

// Route components are code-split so the initial Console download stays small.
// Each page (and the heavy public-patient territory + its cover photo) loads on
// demand instead of shipping in the main bundle.
const NotFound = lazy(() => import("@/pages/not-found"));
const ConsoleHome = lazy(() => import("@/pages/console-home"));
const ConsolePatient = lazy(() => import("@/pages/console-patient"));
const ConsoleConteudo = lazy(() => import("@/pages/console-conteudo"));
const ConsoleNotificacoes = lazy(() => import("@/pages/console-notificacoes"));
const ConsoleContratoModelos = lazy(
  () => import("@/pages/console-contrato-modelos"),
);
const ConsoleDocumentos = lazy(() => import("@/pages/console-documentos"));
const ConsolePrompts = lazy(() => import("@/pages/console-prompts"));
const PublicPatient = lazy(() => import("@/pages/public-patient"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Auto-retry transient connectivity blips a couple of times before
      // surfacing the friendly error screen; never retry genuine logical
      // errors (404 / 400 / 422 etc.).
      retry: (failureCount, error) =>
        isConnectivityError(error) && failureCount < 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
    },
  },
});

// The Console wears the CAMADA masterbrand with a user-chosen dark/light theme
// (default dark = Meia-noite). next-themes owns the `class` attribute on <html>
// and persists the choice under `kcl-console-theme`. With enableSystem the user
// can also pick "Sistema", which follows the OS appearance and flips live.
function ConsoleRoutes() {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      storageKey="kcl-console-theme"
      disableTransitionOnChange
    >
      <Suspense fallback={<RouteLoading />}>
        <Switch>
          <Route path="/" component={ConsoleHome} />
          <Route path="/conteudo" component={ConsoleConteudo} />
          <Route path="/notificacoes" component={ConsoleNotificacoes} />
          <Route path="/contrato-modelos" component={ConsoleContratoModelos} />
          <Route path="/documentos" component={ConsoleDocumentos} />
          <Route path="/prompts" component={ConsolePrompts} />
          <Route path="/paciente/:id" component={ConsolePatient} />
          <Route component={NotFound} />
        </Switch>
      </Suspense>
      <Toaster />
    </NextThemesProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          {/* The public patient territory lives OUTSIDE the Console's
              next-themes provider: it owns its own editorial theme (light by
              default) and must never inherit the Console's Meia-noite class. */}
          <Suspense fallback={<RouteLoading />}>
            <Switch>
              <Route path="/p/:token" component={PublicPatient} />
              <Route component={ConsoleRoutes} />
            </Switch>
          </Suspense>
        </WouterRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
