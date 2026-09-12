import { useUIStore } from '../../stores/ui-store'
import { SHORTCUTS, formatKeys, type Shortcut } from '../../hooks/useKeyboardShortcuts'
import { Dialog } from './Dialog'

const GROUP_ORDER: Shortcut['group'][] = ['Navigate', 'Present', 'Edit', 'App']

/** One row of the shortcut table. Shared with the Help page so the two cannot drift. */
export function ShortcutRow({ shortcut }: { shortcut: Shortcut }): JSX.Element {
  return (
    <div className="flex items-center gap-3 px-3 py-1.5 rounded-lg hover:bg-gray-800/60 transition-colors">
      <kbd className="text-xs font-mono text-gray-200 bg-gray-800 px-2 py-0.5 rounded border border-gray-700 min-w-[84px] text-center">
        {formatKeys(shortcut.keys)}
      </kbd>
      <span className="text-sm text-gray-300 flex-1">{shortcut.label}</span>
    </div>
  )
}

/**
 * The full binding table, grouped. Rendered both by the `?` overlay and by the
 * Help page in HomeScreen — both read `SHORTCUTS`, the single source of truth.
 */
export function ShortcutTable(): JSX.Element {
  return (
    <div className="space-y-5">
      {GROUP_ORDER.map((group) => {
        const rows = SHORTCUTS.filter((s) => s.group === group)
        if (rows.length === 0) return null
        return (
          <section key={group}>
            <h3 className="text-xs font-medium uppercase tracking-wider text-gray-400 mb-2 px-3">{group}</h3>
            <div className="space-y-0.5">
              {rows.map((shortcut) => (
                <ShortcutRow key={shortcut.keys} shortcut={shortcut} />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

/** `?` overlay. Same table as the Help page. */
export function ShortcutsOverlay(): JSX.Element | null {
  const open = useUIStore((s) => s.showShortcuts)
  const setShortcuts = useUIStore((s) => s.setShortcuts)

  return (
    <Dialog
      open={open}
      onClose={() => setShortcuts(false)}
      title="Keyboard shortcuts"
      description="Press ? any time to bring this back."
      widthClass="max-w-lg"
    >
      <div className="px-3 py-4">
        <ShortcutTable />
      </div>
    </Dialog>
  )
}
