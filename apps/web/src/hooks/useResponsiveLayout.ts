import { useState, useEffect, useCallback } from 'react'

type LayoutMode = 'full' | 'compact' | 'stacked'

interface ResponsiveLayout {
  mode: LayoutMode
  showSidebar: boolean
  isStacked: boolean
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
}

export function useResponsiveLayout(): ResponsiveLayout {
  const [mode, setMode] = useState<LayoutMode>(() => {
    if (typeof window === 'undefined') return 'full'
    if (window.innerWidth < 1240) return 'stacked'
    if (window.innerWidth < 1400) return 'compact'
    return 'full'
  })
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    const xlQuery = window.matchMedia('(min-width: 1400px)')
    const mdQuery = window.matchMedia('(min-width: 1240px)')

    const update = () => {
      if (xlQuery.matches) {
        setMode('full')
      } else if (mdQuery.matches) {
        setMode('compact')
      } else {
        setMode('stacked')
      }
    }

    xlQuery.addEventListener('change', update)
    mdQuery.addEventListener('change', update)
    return () => {
      xlQuery.removeEventListener('change', update)
      mdQuery.removeEventListener('change', update)
    }
  }, [])

  useEffect(() => {
    if (mode === 'full') {
      setSidebarOpen(false)
    }
  }, [mode])

  return {
    mode,
    showSidebar: mode === 'full',
    isStacked: mode === 'stacked',
    sidebarOpen,
    setSidebarOpen: useCallback((open: boolean) => setSidebarOpen(open), []),
  }
}
