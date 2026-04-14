import { useState, useEffect, useCallback, useRef } from 'react'
import { useLocation, NavLink } from 'react-router-dom'
import { Menu, Maximize2, Minimize2, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getActiveMenu } from '@/config/navigation'
import { cn } from '@/lib/utils'
import { useUser, canSwitchUser } from '@/contexts/UserContext'

interface HeaderProps {
  onMenuClick: () => void
  sidebarCollapsed: boolean
}

export function Header({ onMenuClick }: HeaderProps) {
  const location = useLocation()
  const activeMenu = getActiveMenu(location.pathname)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const { user, logout } = useUser()
  const allowSwitch = canSwitchUser(user)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement | null>(null)

  // Close the user menu when clicking outside
  useEffect(() => {
    if (!userMenuOpen) return
    const onClick = (e: MouseEvent) => {
      if (!userMenuRef.current) return
      if (!userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [userMenuOpen])

  const userInitials = (() => {
    if (!user) return '?'
    const p = (user.prenom?.trim() ?? '')[0] ?? ''
    const n = (user.nom?.trim() ?? '')[0] ?? ''
    return (`${p}${n}`.toUpperCase()) || '?'
  })()
  const userDisplay = (() => {
    if (!user) return ''
    const p = user.prenom?.trim() ?? ''
    const n = user.nom?.trim() ?? ''
    return [p, n].filter(Boolean).join(' ') || '—'
  })()

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

        {/* User menu — avatar with initials, click to reveal name + logout */}
        <div className="relative" ref={userMenuRef}>
          <button
            onClick={() => setUserMenuOpen((o) => !o)}
            title={userDisplay || 'Utilisateur'}
            className={cn(
              'h-9 w-9 rounded-full flex items-center justify-center font-heading font-bold text-sm shadow-sm transition-all',
              'bg-gold text-gold-foreground',
              'hover:ring-2 hover:ring-gold/40 hover:shadow-md'
            )}
          >
            {userInitials}
          </button>
          {userMenuOpen && user && (
            <div className="absolute right-0 top-full mt-2 w-56 rounded-lg border border-border bg-white shadow-lg p-3 z-50">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-gold flex items-center justify-center text-gold-foreground font-heading font-bold shadow-sm flex-shrink-0">
                  {userInitials}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-primary truncate">{userDisplay}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Utilisateur actif</p>
                </div>
              </div>
              {allowSwitch && (
                <button
                  onClick={() => { setUserMenuOpen(false); void logout() }}
                  className="mt-3 w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-muted-foreground hover:bg-accent/10 hover:text-accent transition-colors border-t border-border/60 pt-3"
                >
                  <LogOut className="h-3 w-3" />
                  Changer d'utilisateur
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
