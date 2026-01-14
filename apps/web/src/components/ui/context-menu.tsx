import * as React from 'react'
import { cn } from '@/lib/utils'

interface ContextMenuProps {
  children: React.ReactNode
  items: ContextMenuItem[]
  onSelect: (item: ContextMenuItem) => void
}

export interface ContextMenuItem {
  label: string
  href: string
}

interface Position {
  x: number
  y: number
}

export function ContextMenu({ children, items, onSelect }: ContextMenuProps) {
  const [isOpen, setIsOpen] = React.useState(false)
  const [position, setPosition] = React.useState<Position>({ x: 0, y: 0 })
  const menuRef = React.useRef<HTMLDivElement>(null)

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setPosition({ x: e.clientX, y: e.clientY })
    setIsOpen(true)
  }

  const handleSelect = (item: ContextMenuItem) => {
    onSelect(item)
    setIsOpen(false)
  }

  // Close on click outside
  React.useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen])

  // Adjust position if menu would go off screen
  React.useEffect(() => {
    if (!isOpen || !menuRef.current) return

    const menu = menuRef.current
    const rect = menu.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    let newX = position.x
    let newY = position.y

    if (position.x + rect.width > viewportWidth) {
      newX = viewportWidth - rect.width - 8
    }

    if (position.y + rect.height > viewportHeight) {
      newY = viewportHeight - rect.height - 8
    }

    if (newX !== position.x || newY !== position.y) {
      setPosition({ x: newX, y: newY })
    }
  }, [isOpen, position])

  return (
    <>
      <div onContextMenu={handleContextMenu}>
        {children}
      </div>

      {isOpen && items.length > 0 && (
        <div
          ref={menuRef}
          className={cn(
            'fixed z-50 min-w-[160px] rounded-md border bg-popover p-1 shadow-lg',
            'animate-in fade-in-0 zoom-in-95'
          )}
          style={{ left: position.x, top: position.y }}
        >
          {items.map((item) => (
            <button
              key={item.href}
              onClick={() => handleSelect(item)}
              className={cn(
                'flex w-full items-center rounded-sm px-3 py-2 text-sm',
                'text-popover-foreground hover:bg-accent hover:text-accent-foreground',
                'cursor-pointer outline-none transition-colors'
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </>
  )
}
