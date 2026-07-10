import { Card, CardContent } from "@/components/ui/card";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-[100dvh] w-full flex flex-col items-center justify-center bg-background text-foreground font-sans selection:bg-accent/30 p-4">
      <div className="mb-12">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-accent">
          <rect x="0" y="4" width="8" height="2" fill="currentColor" />
          <rect x="0" y="11" width="16" height="2" fill="currentColor" />
          <rect x="0" y="18" width="24" height="2" fill="currentColor" />
        </svg>
      </div>

      <div className="text-center space-y-6 max-w-md w-full">
        <h1 className="text-6xl font-serif font-light text-foreground">404</h1>
        <p className="text-muted-foreground font-light leading-relaxed text-lg">
          A página que você está procurando não existe ou foi movida.
        </p>
        
        <div className="pt-8">
          <Button asChild className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium rounded-none px-8 h-12 w-full transition-all">
            <Link href="/">Voltar ao Console</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}