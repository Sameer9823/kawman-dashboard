'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { Sidebar } from './sidebar'
import { Header } from './header'
import { Footer } from './footer'
import { CommandPalette } from './command-palette'
import { useUIStore } from '@/stores/ui'
import { useHeartbeat } from '@/hooks/use-heartbeat'

interface MainLayoutProps {
  children: React.ReactNode
}

export function MainLayout({ children }: MainLayoutProps) {
  useHeartbeat(true)
  const { sidebarCollapsed, mobileDrawerOpen, setMobileDrawerOpen } = useUIStore()

  return (
    <div className="min-h-screen bg-[#050A12] text-white">
      {/* Mobile drawer backdrop */}
      {mobileDrawerOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          onClick={() => setMobileDrawerOpen(false)}
          aria-hidden="true"
        />
      )}
      <div className={cn('fixed inset-y-0 left-0 z-40 lg:z-40 transition-transform lg:translate-x-0', mobileDrawerOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0')}>
        <Sidebar />
      </div>
      <Header />
      <main
        className={cn(
          'pt-16 min-h-screen flex flex-col transition-all duration-300',
          sidebarCollapsed ? 'lg:ml-16' : 'lg:ml-[220px]'
        )}
      >
        <div className="flex-1 p-4 sm:p-6">{children}</div>
        <Footer />
      </main>
      <CommandPalette />
    </div>
  )
}
