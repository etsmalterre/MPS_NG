// Top-level gate that sits above the router. While the user context is
// loading, shows a fullscreen spinner. If no user is identified, shows the
// fullscreen picker. Otherwise renders the app.

import { Loader2 } from 'lucide-react'
import { useUser } from '@/contexts/UserContext'
import { UserPicker } from './UserPicker'

export function UserPickerGate({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useUser()

  if (isLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    )
  }

  if (!user) return <UserPicker />

  return <>{children}</>
}
