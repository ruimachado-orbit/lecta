/**
 * Slash commands for the chat composer.
 *
 * Pure module: no React, no stores, no `window` — the parser and the metadata are
 * the single source of truth for both the autocomplete popover and the runner in
 * `slash-actions.ts`, and they are unit-tested in `slash-commands.test.ts`.
 */

export type SlashCommandName =
  | 'improve'
  | 'notes'
  | 'code'
  | 'image'
  | 'prettify'
  | 'chart'
  | 'inline'
  | 'run'
  | 'explain'
  | 'slide'
  | 'deck'
  | 'review'
  | 'check'

export interface SlashCommand {
  /** Command word, without the leading slash. */
  name: SlashCommandName
  /** One line shown in the autocomplete popover. */
  description: string
  /** Placeholder for the argument, shown after the name. Absent for commands that take none. */
  argsHint?: string
  /** The command does nothing useful without an argument. */
  requiresArgs?: boolean
}

/** Every command the composer offers, in the order the popover lists them. */
export const SLASH_COMMANDS: readonly SlashCommand[] = [
  {
    name: 'improve',
    description: 'Rewrite the current slide following an instruction',
    argsHint: '<instruction>',
    requiresArgs: true
  },
  {
    name: 'prettify',
    description: 'Beautify the current slide — tables, badges, structured bullets'
  },
  {
    name: 'notes',
    description: 'Generate speaker notes for the current slide'
  },
  {
    name: 'code',
    description: "Generate or modify the current slide's code",
    argsHint: '<instruction>',
    requiresArgs: true
  },
  {
    name: 'run',
    description: "Run the current slide's code and show the output"
  },
  {
    name: 'explain',
    description: 'Explain the current code and its last output'
  },
  {
    name: 'chart',
    description: 'Generate an SVG chart and insert it into the slide',
    argsHint: '<description>',
    requiresArgs: true
  },
  {
    name: 'image',
    description: 'Generate an image and insert it into the slide',
    argsHint: '<prompt>',
    requiresArgs: true
  },
  {
    name: 'inline',
    description: 'Write text and insert it at the cursor',
    argsHint: '<text to insert>',
    requiresArgs: true
  },
  {
    name: 'slide',
    description: 'Generate a new slide after the current one',
    argsHint: '<prompt>',
    requiresArgs: true
  },
  {
    name: 'deck',
    description: 'Open the deck generator with this prompt',
    argsHint: '<prompt>',
    requiresArgs: true
  },
  {
    name: 'review',
    description: 'Critique the whole deck — flow, density, consistency'
  },
  {
    name: 'check',
    description: 'Screenshot the slide and fix layout issues visually'
  }
] as const

export interface ParsedSlashCommand {
  command: SlashCommandName
  /** Everything after the command word, trimmed. Empty string when nothing followed. */
  args: string
}

const COMMANDS_BY_NAME = new Map<string, SlashCommand>(SLASH_COMMANDS.map((c) => [c.name, c]))

/** Metadata for one command name, or `undefined` if it is not a command. */
export function getSlashCommand(name: string): SlashCommand | undefined {
  return COMMANDS_BY_NAME.get(name.toLowerCase())
}

/**
 * Parse composer input into a command and its argument.
 *
 * Returns `null` for anything that is not a known slash command — plain prose,
 * a bare `/`, or `/nope` — so the caller can send it to the agent unchanged.
 */
export function parseSlashCommand(input: string): ParsedSlashCommand | null {
  const trimmed = input.trim()
  if (!trimmed.startsWith('/')) return null

  const match = /^\/([A-Za-z][A-Za-z0-9-]*)(?:\s+([\s\S]*))?$/.exec(trimmed)
  if (!match) return null

  const command = COMMANDS_BY_NAME.get(match[1].toLowerCase())
  if (!command) return null

  return { command: command.name, args: (match[2] ?? '').trim() }
}

/**
 * The command word being typed, for the autocomplete popover: `''` for a bare
 * `/`, `'imp'` for `/imp`, and `null` once a space (and therefore an argument)
 * has been typed or the text does not start with a slash.
 */
export function slashAutocompleteQuery(input: string): string | null {
  if (!input.startsWith('/')) return null
  const rest = input.slice(1)
  if (/\s/.test(rest)) return null
  return rest
}

/** Commands whose name starts with `query` (case-insensitive); all of them for `''`. */
export function matchSlashCommands(query: string): SlashCommand[] {
  const q = query.toLowerCase()
  return SLASH_COMMANDS.filter((c) => c.name.startsWith(q))
}

/** The text a composer should hold after the user picks `command` from the popover. */
export function completeSlashCommand(command: SlashCommand): string {
  return command.argsHint ? `/${command.name} ` : `/${command.name}`
}
