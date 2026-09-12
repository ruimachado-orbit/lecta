/** Tiny classname join — avoids a clsx dependency in the design system. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}
