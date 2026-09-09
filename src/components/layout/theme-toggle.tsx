'use client'

import { useSyncExternalStore } from 'react'
import { useTheme } from 'next-themes'
import { Sun, Moon, Monitor } from 'lucide-react'

const OPTIONS = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
] as const

/**
 * Theme toggle (audit: "Dark/Light Theme Toggle — theme stored in UI
 * store but no UI to change it"). next-themes was already installed and
 * wired into components/providers.tsx — it was just never exposed
 * anywhere for the user to actually click. This is that missing control.
 *
 * Honest caveat: most of this app's components use hardcoded dark-mode
 * Tailwind classes rather than theme-aware tokens, so selecting "Light"
 * here correctly persists the choice and flips the <html> class, but the
 * majority of surfaces won't visually change yet — that needs a separate
 * design-token migration across the component library.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  // next-themes reads localStorage on mount; rendering the real state
  // before the client has hydrated would cause a mismatch, so this
  // reports `false` during SSR/first paint and `true` after — the
  // React-recommended primitive for exactly this "has the client taken
  // over yet" check, without reaching for setState-in-an-effect.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )

  return (
    <div className="flex items-center rounded-lg border border-white/[0.08] bg-white/[0.03] p-0.5">
      {OPTIONS.map((opt) => {
        const isActive = mounted && theme === opt.value
        return (
          <button
            key={opt.value}
            onClick={() => setTheme(opt.value)}
            title={opt.label}
            aria-label={`${opt.label} theme`}
            className={`h-7 w-7 rounded-md flex items-center justify-center transition-colors ${
              isActive ? 'bg-purple-600 text-white' : 'text-white/40 hover:text-white hover:bg-white/[0.06]'
            }`}
          >
            <opt.icon className="h-3.5 w-3.5" />
          </button>
        )
      })}
    </div>
  )
}
