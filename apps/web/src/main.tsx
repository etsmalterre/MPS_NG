import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { router } from './router'
import { installAutofillBlocker } from './lib/disable-autofill'
import { UserProvider } from './contexts/UserContext'
import { PermissionsProvider } from './contexts/PermissionsContext'
import { UserPickerGate } from './components/auth/UserPickerGate'
import './index.css'

// Clean up design carousel artifacts from localStorage
document.documentElement.removeAttribute('data-theme')
localStorage.removeItem('mps-theme')
localStorage.removeItem('mps-panel-bg')
localStorage.removeItem('mps-panel-hf')

// Strip Dashlane/LastPass/1Password/Bitwarden autofill from every form control
installAutofillBlocker()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1
    }
  }
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <UserProvider>
        <PermissionsProvider>
          <UserPickerGate>
            <RouterProvider router={router} />
          </UserPickerGate>
        </PermissionsProvider>
      </UserProvider>
    </QueryClientProvider>
  </React.StrictMode>
)
