'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  FolderOpen,
  Share2,
  FolderTree,
  Tag,
  Clock,
  Star,
  Trash2,
  Bot,
  FileSearch,
  FileBarChart,
  LineChart,
  Target,
  Building2,
  User,
  Handshake,
  ClipboardList,
  MapPin,
  BarChart3,
  Video,
  FileText,
  CalendarPlus,
  Calendar,
  Navigation,
  UserCheck,
  ShieldCheck,
  ClipboardCheck,
  Users,
  Briefcase,
  Building,
  Plug,
  HardDrive,
  History,
  ScrollText,
  Settings,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useUIStore } from '@/stores/ui'
import { usePermissions } from '@/lib/permissions'

interface NavLeaf {
  name: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  badge?: 'New'
  permission?: string
}

interface NavGroup {
  label?: string
  badge?: 'New'
  items: NavLeaf[]
  /** Only rendered when the current user has one of these permissions */
  requiresAnyPermission?: string[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    items: [{ name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard }],
  },
  {
    label: 'Document Management',
    items: [
      { name: 'My Files', href: '/files/my-files', icon: FolderOpen },
      { name: 'Shared with Me', href: '/files/shared', icon: Share2 },
      { name: 'Folders & Access', href: '/files/folders', icon: FolderTree },
      { name: 'Categories', href: '/files/categories', icon: Tag },
      { name: 'Recent', href: '/files/recent', icon: Clock },
      { name: 'Starred', href: '/files/starred', icon: Star },
      { name: 'Recycle Bin', href: '/files/trash', icon: Trash2 },
    ],
  },
  {
    label: 'AI Intelligence',
    items: [
      { name: 'AI Chat', href: '/ai/chat', icon: Bot },
      { name: 'AI Summary', href: '/ai/summary', icon: FileSearch },
      { name: 'AI Reports', href: '/ai/reports', icon: FileBarChart, badge: 'New' },
      { name: 'Data Analysis', href: '/ai/data-analysis', icon: LineChart },
    ],
  },
  {
    label: 'CRM & Sales',
    badge: 'New',
    items: [
      { name: 'CRM Dashboard', href: '/crm', icon: LayoutDashboard },
      { name: 'Leads', href: '/leads', icon: Target },
      { name: 'Companies', href: '/companies', icon: Building2 },
      { name: 'Contacts', href: '/contacts', icon: User },
      { name: 'Deals & Pipeline', href: '/deals', icon: Handshake },
      { name: 'Follow-ups', href: '/follow-ups', icon: ClipboardList },
      { name: 'Calendar', href: '/calendar', icon: Calendar },
      { name: 'Field Visits', href: '/field-sales', icon: MapPin },
      { name: 'Sales Reports', href: '/reports/sales', icon: BarChart3 },
    ],
  },
  {
    label: 'Meetings',
    items: [
      { name: 'Meeting Videos', href: '/meetings/videos', icon: Video },
      { name: 'MOM & Insights', href: '/meetings/mom', icon: FileText },
      { name: 'Schedule Meeting', href: '/meetings/new', icon: CalendarPlus },
    ],
  },
  {
    label: 'Field Sales',
    badge: 'New',
    items: [
      { name: 'Live Map', href: '/field-sales/live-map', icon: Navigation },
      { name: "Today's Visits", href: '/field-sales/visits', icon: MapPin },
      { name: 'Geo-Fencing', href: '/field-sales/geofencing', icon: ShieldCheck },
      { name: 'Check-ins', href: '/field-sales/checkins', icon: UserCheck },
      { name: 'Visit Reports', href: '/field-sales/reports', icon: ClipboardCheck },
    ],
  },
  {
    label: 'Administration',
    requiresAnyPermission: ['users.view', 'roles.view', 'organizations.view', 'settings.manage'],
    items: [
      { name: 'Admin Dashboard', href: '/admin/dashboard', icon: LayoutDashboard, permission: 'dashboard.view' },
      { name: 'Users', href: '/admin/users', icon: Users, permission: 'users.view' },
      { name: 'Roles & Permissions', href: '/admin/roles', icon: Briefcase, permission: 'roles.view' },
      { name: 'Organizations', href: '/admin/organizations', icon: Building, permission: 'organizations.view' },
      { name: 'Integrations', href: '/admin/integrations', icon: Plug, permission: 'organizations.view' },
      { name: 'Departments', href: '/admin/departments', icon: Building2, permission: 'organizations.view' },
      { name: 'Teams', href: '/admin/teams', icon: Users, permission: 'organizations.view' },
      { name: 'Storage', href: '/admin/storage', icon: HardDrive, permission: 'files.manage' },
      { name: 'Activity Logs', href: '/admin/activity', icon: History, permission: 'audit_logs.view' },
      { name: 'Audit Logs', href: '/admin/audit-logs', icon: ScrollText, permission: 'audit_logs.view' },
      { name: 'System Settings', href: '/admin/settings', icon: Settings, permission: 'settings.manage' },
    ],
  },
]

function NavBadge() {
  return (
    <span className="ml-auto text-[10px] font-semibold tracking-wide text-purple-300 bg-purple-500/15 border border-purple-500/30 rounded px-1.5 py-0.5">
      New
    </span>
  )
}

function NavLink({ item, collapsed }: { item: NavLeaf; collapsed: boolean }) {
  const pathname = usePathname()
  const isActive = pathname === item.href || pathname.startsWith(item.href + '/')

  return (
    <Link
      href={item.href}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
        isActive
          ? 'bg-purple-600 text-white shadow-sm shadow-purple-600/30'
          : 'text-white/65 hover:bg-white/5 hover:text-white'
      )}
      aria-current={isActive ? 'page' : undefined}
    >
      <item.icon className="h-[18px] w-[18px] shrink-0" />
      {!collapsed && <span className="truncate">{item.name}</span>}
      {!collapsed && item.badge && <NavBadge />}
    </Link>
  )
}

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar } = useUIStore()
  const { hasAnyPermission } = usePermissions()

  const visibleGroups = NAV_GROUPS.filter(
    (group) => !group.requiresAnyPermission || hasAnyPermission(group.requiresAnyPermission)
  )

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-40 h-full bg-[#07101B] border-r border-white/[0.08] transition-all duration-300 flex flex-col',
        sidebarCollapsed ? 'w-16' : 'w-[220px]'
      )}
    >
      <div className="flex h-16 items-center justify-between px-4 border-b border-white/[0.08] shrink-0">
        {!sidebarCollapsed ? (
          <Link href="/dashboard" className="flex items-center gap-2.5 min-w-0">
            <div className="h-8 w-8 shrink-0 rounded-full bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center text-white font-bold text-sm shadow-[0_0_16px_rgba(147,51,234,0.5)]">
              K
            </div>
            <span className="font-bold text-[15px] text-white leading-tight truncate">
              KAWMAN
              <br />
              <span className="font-medium text-white/60 text-xs">ExAct</span>
            </span>
          </Link>
        ) : (
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center text-white font-bold text-sm mx-auto">
            K
          </div>
        )}
        {!sidebarCollapsed && (
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            className="text-white/50 hover:text-white h-7 w-7"
            aria-label="Collapse sidebar"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        )}
      </div>

      {sidebarCollapsed && (
        <div className="flex justify-center py-2 border-b border-white/[0.08]">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            className="text-white/50 hover:text-white h-7 w-7"
            aria-label="Expand sidebar"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      <nav
        className="flex-1 overflow-y-auto scrollbar-hide px-3 py-4 space-y-5"
        role="navigation"
        aria-label="Main navigation"
      >
        {visibleGroups.map((group, idx) => (
          <div key={group.label ?? `group-${idx}`}>
            {group.label && !sidebarCollapsed && (
              <div className="flex items-center px-3 mb-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-white/35">
                  {group.label}
                </span>
                {group.badge && <NavBadge />}
              </div>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLink key={item.href} item={item} collapsed={sidebarCollapsed} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-3 border-t border-white/[0.08] shrink-0">
        {!sidebarCollapsed ? (
          <div className="rounded-lg bg-white/[0.03] p-3">
            <p className="text-xs text-white/50">Storage Used</p>
            <p className="text-sm font-medium text-white mt-0.5">128.5 GB of 1 TB</p>
            <div className="mt-2 h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
              <div className="h-full rounded-full bg-purple-500" style={{ width: '12.5%' }} />
            </div>
            <Link
              href="/admin/storage"
              className="block mt-3 text-center text-xs font-medium text-white/70 hover:text-white bg-white/5 hover:bg-white/10 rounded-md py-1.5 transition-colors"
            >
              Manage Storage
            </Link>
          </div>
        ) : (
          <div className="flex justify-center">
            <HardDrive className="h-5 w-5 text-white/40" />
          </div>
        )}
      </div>
    </aside>
  )
}
