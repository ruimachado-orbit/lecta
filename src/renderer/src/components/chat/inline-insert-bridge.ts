/**
 * `/inline` used to be a prompt bar floating over the WYSIWYG editor, so it could
 * insert at the caret. The chat has no editor handle, so the editor publishes an
 * insert function here while it is mounted and the slash command uses it. With no
 * editor mounted the caller falls back to appending to the slide markdown.
 */

export type InlineInserter = (text: string) => void

let inserter: InlineInserter | null = null

/** Publish the mounted editor's insert-at-caret. Call the result on unmount. */
export function registerInlineInserter(fn: InlineInserter): () => void {
  inserter = fn
  return () => {
    if (inserter === fn) inserter = null
  }
}

/** Insert at the caret. Returns false when no editor is mounted to insert into. */
export function insertAtCursor(text: string): boolean {
  if (!inserter) return false
  inserter(text)
  return true
}
