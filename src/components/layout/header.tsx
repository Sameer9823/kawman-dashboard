'use client'

import * as React from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import {
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Bell,
  HelpCircle,
  Settings,
  User,
  LogOut,
  ChevronDown,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { useShallow } from 'zustand/react/shallow'
import { useUIStore } from '@/stores/ui'
import { useSession, signOut } from '@/lib/auth-client'
import { getInitials, formatRelativeTime } from '@/lib/utils'
import { ThemeToggle } from './theme-toggle'

const NOTIF_COLOR: Record<string, string> = {
  NEW_LEAD: 'bg-purple-500/15 text-purple-400',
  DEAL_UPDATED: 'bg-blue-500/15 text-blue-400',
  MEETING_REMINDER: 'bg-emerald-500/15 text-emerald-400',
  FOLLOW_UP_DUE: 'bg-orange-500/15 text-orange-400',
  FILE_SHARED: 'bg-cyan-500/15 text-cyan-400',
  FILE_UPLOADED: 'bg-cyan-500/15 text-cyan-400',
  AI_REPORT_READY: 'bg-fuchsia-500/15 text-fuchsia-400',
  CHECK_IN_COMPLETED: 'bg-emerald-500/15 text-emerald-400',
  SECURITY_EVENT: 'bg-red-500/15 text-red-400',
  DAILY_REPORT_SUBMITTED: 'bg-indigo-500/15 text-indigo-400',
}

interface NotificationDTO {
  id: string
  type: string
  title: string
  message: string
  data?: { dailyReportId?: string; userId?: string } | null
  createdAt: string
  read: boolean
}

function notifHref(n: NotificationDTO): string {
  if (n.type === 'DAILY_REPORT_SUBMITTED' && n.data?.userId) return `/admin/my-team/${n.data.userId}`
  return '/notifications'
}

export function Header() {
  const router = useRouter()
  // Selector (via useShallow) instead of a bare useUIStore() call — this
  // component now only re-renders when one of these three fields changes,
  // not on every unrelated UI-store update (theme, notifications, etc).
  const { sidebarCollapsed, toggleSidebar, toggleMobileDrawer, toggleCommandPalette } = useUIStore(
    useShallow((s) => ({
      sidebarCollapsed: s.sidebarCollapsed,
      toggleSidebar: s.toggleSidebar,
      toggleMobileDrawer: s.toggleMobileDrawer,
      toggleCommandPalette: s.toggleCommandPalette,
    }))
  )
  const { data: session } = useSession()
  const user = session?.user

  const { data: notifications = [] } = useQuery<NotificationDTO[]>({
    queryKey: ['notifications'],
    queryFn: async () => {
      const res = await fetch('/api/notifications')
      if (!res.ok) return []
      const data = await res.json()
      // Ensure we always return an array
      return Array.isArray(data) ? data : []
    },
    enabled: !!user,
    refetchInterval: 60_000,
  })

  function markRead(id: string) {
    fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }).catch(() => {})
  }

  async function handleLogout() {
    await signOut()
    router.push('/login')
    router.refresh()
  }

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        toggleCommandPalette()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toggleCommandPalette])

  return (
    <header
      className={cn(
        'fixed top-0 right-0 z-30 h-16 bg-[#07101B]/95 backdrop-blur-xl border-b border-white/[0.08] transition-all duration-300 flex items-center',
        sidebarCollapsed ? 'lg:left-16' : 'lg:left-[220px]',
        'left-0'
      )}
    >
      <div className="flex w-full items-center gap-4 px-4 h-full">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleMobileDrawer}
          className="lg:hidden text-white/60 hover:text-white shrink-0"
          aria-label="Toggle menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          className="hidden lg:inline-flex text-white/50 hover:text-white shrink-0"
          aria-label={sidebarCollapsed ? 'Open sidebar' : 'Close sidebar'}
          title={sidebarCollapsed ? 'Open sidebar' : 'Close sidebar'}
        >
          {sidebarCollapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
        </Button>

        <button
          onClick={toggleCommandPalette}
          className="hidden sm:flex flex-1 max-w-xl items-center gap-2.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3.5 py-2 text-left transition-colors hover:border-white/[0.14]"
          aria-label="Open global search"
        >
          <Search className="h-4 w-4 text-white/40 shrink-0" />
          <span className="text-sm text-white/40 flex-1 truncate">
            Search documents, meetings, leads, companies...
          </span>
          <kbd className="hidden md:inline-flex items-center gap-0.5 rounded border border-white/10 bg-white/[0.06] px-1.5 py-0.5 text-[11px] text-white/40 font-medium">
            ⌘K
          </kbd>
        </button>

        <div className="flex items-center gap-1.5 ml-auto shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="relative text-white/60 hover:text-white">
                <Bell className="h-5 w-5" />
                {notifications.some((n) => !n.read) && (
                  <span className="absolute top-1.5 right-1.5 h-4 w-4 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center">
                    {notifications.filter((n) => !n.read).length}
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80 bg-[#0d1622] border-white/10">
              <DropdownMenuLabel className="text-white">Notifications</DropdownMenuLabel>
              <DropdownMenuSeparator className="border-white/10" />
              {notifications.length === 0 && (
                <div className="px-2 py-6 text-center text-sm text-white/40">You&apos;re all caught up.</div>
              )}
              {notifications.slice(0, 6).map((notification) => (
                <DropdownMenuItem key={notification.id} asChild className="p-0 focus:bg-white/5 data-[highlighted]:bg-white/5">
                  <Link href={notifHref(notification)} onClick={() => markRead(notification.id)} className="flex items-start gap-3 px-2 py-2.5 w-full text-left hover:bg-white/5 rounded-sm">
                    <div className={cn('h-8 w-8 shrink-0 rounded-full flex items-center justify-center', NOTIF_COLOR[notification.type] ?? 'bg-white/10 text-white/60')}>
                      <Bell className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white">{notification.title}</p>
                      <p className="text-xs text-white/50">{notification.message}</p>
                      <p className="text-xs text-white/35 mt-0.5">{formatRelativeTime(notification.createdAt)}</p>
                    </div>
                  </Link>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator className="border-white/10" />
              <DropdownMenuItem asChild className="justify-center text-purple-400 hover:bg-white/5 focus:bg-white/5">
                <Link href="/notifications">View all notifications</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button variant="ghost" size="icon" className="text-white/60 hover:text-white hidden sm:inline-flex" aria-label="Help">
            <HelpCircle className="h-5 w-5" />
          </Button>

          <Link href="/settings">
            <Button variant="ghost" size="icon" className="text-white/60 hover:text-white hidden sm:inline-flex" aria-label="Settings">
              <Settings className="h-5 w-5" />
            </Button>
          </Link>

          <ThemeToggle />

          <div className="w-px h-6 bg-white/10 mx-1 hidden sm:block" />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2.5 rounded-lg pl-1 pr-2 py-1 hover:bg-white/5 transition-colors">
                <div className="h-8 w-8 rounded-full bg-purple-600 flex items-center justify-center shrink-0">
                  <span className="text-white font-medium text-xs">
                    {user?.name ? getInitials(user.name) : 'U'}
                  </span>
                </div>
                <div className="hidden md:block text-left leading-tight">
                  <p className="text-sm font-medium text-white">{user?.name ?? 'Account'}</p>
                  <p className="text-xs text-white/40">{user?.email ?? ''}</p>
                </div>
                <ChevronDown className="h-4 w-4 text-white/40 hidden md:block" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-[#0d1622] border-white/10">
              <DropdownMenuLabel className="text-white">Account</DropdownMenuLabel>
              <DropdownMenuSeparator className="border-white/10" />
              <DropdownMenuItem asChild className="text-white/70 hover:bg-white/5 focus:bg-white/5">
                <Link href="/settings/profile" className="flex items-center gap-2 w-full">
                  <User className="h-4 w-4" />
                  Profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="text-white/70 hover:bg-white/5 focus:bg-white/5">
                <Link href="/settings" className="flex items-center gap-2 w-full">
                  <Settings className="h-4 w-4" />
                  Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator className="border-white/10" />
              <DropdownMenuItem
                onClick={handleLogout}
                className="text-red-400 hover:bg-white/5 focus:bg-white/5 flex items-center gap-2 w-full"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}