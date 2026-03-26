import { ReactNode } from 'react'
import { ArrowLeft, PanelRightOpen, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout'

interface MasterDetailLayoutProps {
  list: ReactNode
  detailHeader: ReactNode
  detail: ReactNode
  sidebar: ReactNode | null
  sidebarTitle?: string
  hasSelection: boolean
  onBack: () => void
}

export function MasterDetailLayout({
  list,
  detailHeader,
  detail,
  sidebar,
  sidebarTitle = 'Informations',
  hasSelection,
  onBack,
}: MasterDetailLayoutProps) {
  const { mode, sidebarOpen, setSidebarOpen } = useResponsiveLayout()

  const sidebarToggle = sidebar && mode !== 'full' && (
    <Button
      variant="outline"
      size="icon"
      onClick={() => setSidebarOpen(true)}
      title={sidebarTitle}
    >
      <PanelRightOpen className="h-4 w-4" />
    </Button>
  )

  const sidebarDrawer = sidebar && (
    <>
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setSidebarOpen(false)} />
      )}
      <div className={cn(
        'fixed top-0 right-0 z-50 h-full w-full max-w-md bg-background shadow-lg transition-transform duration-300 ease-in-out flex flex-col',
        sidebarOpen ? 'translate-x-0' : 'translate-x-full'
      )}>
        <div className="flex items-center justify-end p-2">
          <button className="rounded-sm opacity-70 hover:opacity-100" onClick={() => setSidebarOpen(false)}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 min-h-0 flex flex-col overflow-y-auto px-3 pb-3 [&>*]:!w-full [&>*]:!flex-1 [&>*]:!bg-transparent [&>*]:!border-0 [&>*]:!rounded-none [&>*]:!p-0">
          {sidebar}
        </div>
      </div>
    </>
  )

  // Stacked mode: show either list or detail
  if (mode === 'stacked') {
    if (!hasSelection) {
      return (
        <>
          <div className="flex-1 min-h-0">{list}</div>
          {sidebarDrawer}
        </>
      )
    }

    return (
      <>
        <div className="flex-1 min-h-0 flex flex-col gap-4">
          <div className="flex-shrink-0 flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Retour
            </Button>
            <div className="flex-1" />
            {sidebarToggle}
          </div>
          {detailHeader}
          <div className="flex-1 min-h-0 flex flex-col">{detail}</div>
        </div>
        {sidebarDrawer}
      </>
    )
  }

  // Compact mode: list + detail, sidebar in drawer
  if (mode === 'compact') {
    return (
      <>
        <div className="flex-1 min-h-0 flex gap-4">
          <div className="w-72 flex-shrink-0">{list}</div>
          <div className="flex-1 flex flex-col min-h-0 gap-4">
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0">{detailHeader}</div>
              {sidebarToggle}
            </div>
            <div className="flex-1 min-h-0 flex flex-col">{detail}</div>
          </div>
        </div>
        {sidebarDrawer}
      </>
    )
  }

  // Full mode: list + detail + inline sidebar
  return (
    <div className="flex-1 min-h-0 flex gap-4 overflow-hidden">
      <div className="w-72 flex-shrink-0">{list}</div>
      <div className="flex-1 min-w-0 flex flex-col min-h-0 gap-4">
        {detailHeader}
        <div className="flex-1 min-h-0 flex gap-4 overflow-hidden">
          <div className="flex-1 min-w-0 flex flex-col">{detail}</div>
          {sidebar}
        </div>
      </div>
    </div>
  )
}
