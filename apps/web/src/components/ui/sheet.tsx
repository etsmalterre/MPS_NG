import * as React from 'react'
import { cn } from '@/lib/utils'
import { X } from 'lucide-react'

interface SheetContextValue {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const SheetContext = React.createContext<SheetContextValue | undefined>(undefined)

function useSheetContext() {
  const context = React.useContext(SheetContext)
  if (!context) {
    throw new Error('Sheet components must be used within a Sheet')
  }
  return context
}

interface SheetProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: React.ReactNode
}

function Sheet({ open = false, onOpenChange, children }: SheetProps) {
  const [internalOpen, setInternalOpen] = React.useState(open)

  const isControlled = onOpenChange !== undefined
  const isOpen = isControlled ? open : internalOpen
  const setIsOpen = isControlled ? onOpenChange : setInternalOpen

  return (
    <SheetContext.Provider value={{ open: isOpen, onOpenChange: setIsOpen }}>
      {children}
    </SheetContext.Provider>
  )
}

interface SheetTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean
}

const SheetTrigger = React.forwardRef<HTMLButtonElement, SheetTriggerProps>(
  ({ onClick, children, ...props }, ref) => {
    const { onOpenChange } = useSheetContext()

    return (
      <button
        ref={ref}
        onClick={(e) => {
          onClick?.(e)
          onOpenChange(true)
        }}
        {...props}
      >
        {children}
      </button>
    )
  }
)
SheetTrigger.displayName = 'SheetTrigger'

interface SheetContentProps extends React.HTMLAttributes<HTMLDivElement> {
  side?: 'left' | 'right' | 'top' | 'bottom'
}

const SheetContent = React.forwardRef<HTMLDivElement, SheetContentProps>(
  ({ className, children, side = 'left', ...props }, ref) => {
    const { open, onOpenChange } = useSheetContext()

    React.useEffect(() => {
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && open) {
          onOpenChange(false)
        }
      }
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }, [open, onOpenChange])

    if (!open) return null

    const sideClasses = {
      left: 'left-0 h-full w-3/4 max-w-sm border-r data-[state=open]:animate-in data-[state=open]:slide-in-from-left',
      right: 'right-0 h-full w-3/4 max-w-sm border-l data-[state=open]:animate-in data-[state=open]:slide-in-from-right',
      top: 'top-0 w-full border-b data-[state=open]:animate-in data-[state=open]:slide-in-from-top',
      bottom: 'bottom-0 w-full border-t data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom',
    }

    return (
      <>
        {/* Overlay */}
        <div
          className="fixed inset-0 z-50 bg-black/80 animate-in fade-in-0"
          onClick={() => onOpenChange(false)}
        />
        {/* Content */}
        <div
          ref={ref}
          className={cn(
            'fixed z-50 bg-background p-6 shadow-lg transition ease-in-out',
            sideClasses[side],
            className
          )}
          data-state="open"
          {...props}
        >
          {children}
          <button
            className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Fermer</span>
          </button>
        </div>
      </>
    )
  }
)
SheetContent.displayName = 'SheetContent'

const SheetHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('flex flex-col space-y-2 text-center sm:text-left', className)}
    {...props}
  />
)
SheetHeader.displayName = 'SheetHeader'

const SheetTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h2
    ref={ref}
    className={cn('text-lg font-semibold text-foreground', className)}
    {...props}
  />
))
SheetTitle.displayName = 'SheetTitle'

export { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle }
