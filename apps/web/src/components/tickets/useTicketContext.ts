// Navigation context auto-captured with every ticket — "Menu › Sous-menu
// (path)" derived from the router + the sidebar navigation config. Richer
// context in the tracker = faster diagnosis.

import { useLocation } from 'react-router-dom'
import { getActiveMenu } from '@/config/navigation'

export function useTicketContext(): string {
  const location = useLocation()
  const menu = getActiveMenu(location.pathname)
  const parts: string[] = []
  if (menu) {
    parts.push(menu.title)
    const sub = menu.submenus.find(
      (s) => location.pathname === s.href || location.pathname.startsWith(s.href + '/'),
    )
    if (sub) parts.push(sub.title)
  }
  const path = location.pathname + location.search
  const crumb = parts.join(' › ')
  return crumb ? `${crumb} (${path})` : path
}
