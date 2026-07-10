import { Loader2Icon } from "lucide-react"

import { cn } from "@/lib/utils"

// Type the wrapper with the lucide icon's own props instead of raw `<svg>` props.
// In console-kcl @radix-ui augments React.CSSProperties with a global
// `--radix-${string}` index signature, but lucide's icon types resolve a separate
// (unaugmented) @types/react module record, so spreading React.ComponentProps<"svg">
// (augmented style) onto the icon fails typecheck. Using the icon's own prop type
// keeps both sides on the same CSSProperties.
function Spinner({ className, ...props }: React.ComponentProps<typeof Loader2Icon>) {
  return (
    <Loader2Icon
      role="status"
      aria-label="Loading"
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  )
}

export { Spinner }
