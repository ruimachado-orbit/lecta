/**
 * Canonical UI primitives for Lecta.
 *
 * This barrel is the single entry point: import `Button`, `Badge`, `Card`,
 * `Input`, `Toggle`, `SegmentedControl`, `Kbd` and `EditorShell` from here,
 * not from deep paths. Ad-hoc Tailwind buttons in feature code should migrate
 * here over time; new UI must start here.
 */
export { Button, Spinner } from './components/Button'
export type { ButtonProps, ButtonVariant, ButtonSize } from './components/Button'
export { Badge } from './components/Badge'
export { Card } from './components/Card'
export { Input } from './components/Input'
export { Toggle } from './components/Toggle'
export { SegmentedControl } from './components/SegmentedControl'
export { Kbd } from './components/Kbd'
export { EditorShell } from './components/EditorShell'
export { cx } from './lib/cx'
