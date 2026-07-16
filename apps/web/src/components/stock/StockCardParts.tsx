import { ArrowDown, ArrowUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PopoverSelect } from '@/components/ui/popover-select'
import { cn } from '@/lib/utils'

// Shared building blocks for the mobile (< md) card layout of table-centric
// stock screens (FilsStock, FinisStock, …). See mps_designer §40.3.

export function CardKV({
  label,
  value,
  mono,
  strong,
}: {
  label: string
  value: React.ReactNode
  mono?: boolean
  strong?: boolean
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn('text-xs truncate', mono && 'tabular-nums', strong && 'font-semibold')}>{value}</p>
    </div>
  )
}

// Compact sort control shown above the card list — replaces the table's
// clickable column headers, reusing the same COLUMNS labels and sort state.
export function MobileSortRow<K extends string>({
  columns,
  sort,
  onSortChange,
}: {
  columns: readonly { key: K; label: string }[]
  sort: { key: K; dir: 'asc' | 'desc' }
  onSortChange: (next: { key: K; dir: 'asc' | 'desc' }) => void
}) {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 bg-zinc-200/60 border-b border-border/60">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold flex-shrink-0">Tri</span>
      <div className="flex-1 min-w-0">
        <PopoverSelect
          hideEmpty
          options={columns.map((c, i) => ({ id: i + 1, primary: c.label }))}
          value={columns.findIndex((c) => c.key === sort.key) + 1}
          onChange={(id) => {
            const col = columns[id - 1]
            if (col) onSortChange({ key: col.key, dir: sort.dir })
          }}
        />
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9 flex-shrink-0"
        onClick={() => onSortChange({ key: sort.key, dir: sort.dir === 'asc' ? 'desc' : 'asc' })}
        title={sort.dir === 'asc' ? 'Tri croissant' : 'Tri décroissant'}
      >
        {sort.dir === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
      </Button>
    </div>
  )
}
