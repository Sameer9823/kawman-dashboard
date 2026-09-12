'use client'

import * as React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { Toaster } from 'sonner'
import { useUIStore } from '@/stores/ui'
import dynamic from 'next/dynamic'

// Devtools touches localStorage on mount and throws SecurityError when
// storage is blocked (sandboxed iframe, CSP sandbox, strict browser
// settings). Load it client-only and gate behind a safe check.
const ReactQueryDevtools = dynamic(
  () => import('@tanstack/react-query-devtools').then((m) => m.ReactQueryDevtools),
  { ssr: false }
)

function canUseLocalStorage(): boolean {
  try {
    if (typeof window === 'undefined') return false
    const k = '__storage_test__'
    window.localStorage.setItem(k, '1')
    window.localStorage.removeItem(k)
    return true
  } catch {
    return false
  }
}

function getQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  })
}

interface ProvidersProps {
  children: React.ReactNode
}

export function Providers({ children }: ProvidersProps) {
  const [queryClient] = React.useState(getQueryClient)
  const theme = useUIStore((state) => state.theme)
  const [devtoolsEnabled, setDevtoolsEnabled] = React.useState(false)

  React.useEffect(() => {
    if (process.env.NODE_ENV === 'development' && canUseLocalStorage()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time devtools gate, not a render loop
      setDevtoolsEnabled(true)
    }
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme={theme}
        enableSystem
        disableTransitionOnChange
      >
        {children}
        <Toaster
          position="top-right"
          theme="dark"
          className="bg-[#07101B] border border-white/10"
          toastOptions={{
            className: 'bg-white/5 border border-white/10',
            style: { background: '#0a1623' },
          }}
        />
        {devtoolsEnabled && <ReactQueryDevtools initialIsOpen={false} />}
      </ThemeProvider>
    </QueryClientProvider>
  )
}
