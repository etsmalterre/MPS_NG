import { useState, useEffect, useCallback } from 'react'
import { useLocation, NavLink } from 'react-router-dom'
import { Menu, Maximize2, Minimize2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar } from '@/components/ui/avatar'
import { getActiveMenu } from '@/config/navigation'
import { cn } from '@/lib/utils'

interface HeaderProps {
  onMenuClick: () => void
  sidebarCollapsed: boolean
}

export function Header({ onMenuClick }: HeaderProps) {
  const location = useLocation()
  const activeMenu = getActiveMenu(location.pathname)
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Track fullscreen state changes (e.g., when user presses Escape)
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen()
      } else {
        await document.exitFullscreen()
      }
    } catch (err) {
      console.error('Fullscreen error:', err)
    }
  }, [])

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-gold/30 bg-gradient-to-r from-gold/40 via-gold/15 to-transparent px-4 lg:px-6 shadow-sm">
      {/* Mobile menu button */}
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onMenuClick}
      >
        <Menu className="h-5 w-5" />
        <span className="sr-only">Menu</span>
      </Button>

      {/* Submenu tabs */}
      {activeMenu && activeMenu.submenus.length > 0 && (
        <nav className="flex gap-1 overflow-x-auto">
          {activeMenu.submenus.map((submenu) => (
            <NavLink
              key={submenu.href}
              to={submenu.href}
              className={({ isActive }) =>
                cn(
                  'px-4 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap',
                  isActive
                    ? 'bg-accent text-accent-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-accent/10 hover:text-accent'
                )
              }
            >
              {submenu.title}
            </NavLink>
          ))}
        </nav>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Actions */}
      <div className="flex items-center gap-2">
        {/* Fullscreen toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleFullscreen}
          title={isFullscreen ? 'Quitter plein écran' : 'Plein écran'}
        >
          {isFullscreen ? (
            <Minimize2 className="h-5 w-5" />
          ) : (
            <Maximize2 className="h-5 w-5" />
          )}
          <span className="sr-only">
            {isFullscreen ? 'Quitter plein écran' : 'Plein écran'}
          </span>
        </Button>

        {/* User menu */}
        <Button variant="ghost" size="icon" className="rounded-full">
          <Avatar
            fallback="U"
            alt="Utilisateur"
            className="h-8 w-8"
          />
        </Button>
      </div>
    </header>
  )
}
