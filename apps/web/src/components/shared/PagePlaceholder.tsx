import { type LucideIcon } from 'lucide-react'

interface PagePlaceholderProps {
  title: string
  description: string
  icon: LucideIcon
}

export function PagePlaceholder({ title, description, icon: Icon }: PagePlaceholderProps) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="icon-box-gold h-16 w-16 mx-auto">
          <Icon className="h-8 w-8" />
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-heading font-bold tracking-tight">{title}</h1>
          <p className="text-muted-foreground max-w-md">{description}</p>
        </div>
        <div className="pt-4">
          <span className="inline-flex items-center rounded-full bg-gold/10 px-4 py-1.5 text-sm font-medium text-gold">
            Phase 1 - Interface en cours de développement
          </span>
        </div>
      </div>
    </div>
  )
}
