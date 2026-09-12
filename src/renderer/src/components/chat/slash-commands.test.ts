import { describe, it, expect } from 'vitest'
import {
  SLASH_COMMANDS,
  completeSlashCommand,
  getSlashCommand,
  matchSlashCommands,
  parseSlashCommand,
  slashAutocompleteQuery
} from './slash-commands'

describe('SLASH_COMMANDS metadata', () => {
  it('covers every command the chat surface advertises', () => {
    expect(SLASH_COMMANDS.map((c) => c.name).sort()).toEqual(
      [
        'chart',
        'check',
        'code',
        'deck',
        'explain',
        'image',
        'improve',
        'inline',
        'notes',
        'prettify',
        'review',
        'run',
        'slide'
      ].sort()
    )
  })

  it('has a unique name and a description for each entry', () => {
    const names = new Set<string>()
    for (const command of SLASH_COMMANDS) {
      expect(names.has(command.name)).toBe(false)
      names.add(command.name)
      expect(command.description.length).toBeGreaterThan(0)
    }
  })

  it('only marks commands that actually take an argument as requiring one', () => {
    for (const command of SLASH_COMMANDS) {
      if (command.requiresArgs) expect(command.argsHint).toBeTruthy()
    }
  })

  it('looks a command up by name, case-insensitively', () => {
    expect(getSlashCommand('improve')?.name).toBe('improve')
    expect(getSlashCommand('IMPROVE')?.name).toBe('improve')
    expect(getSlashCommand('nope')).toBeUndefined()
  })
})

describe('parseSlashCommand', () => {
  it('parses a command with an argument', () => {
    expect(parseSlashCommand('/improve make it shorter')).toEqual({
      command: 'improve',
      args: 'make it shorter'
    })
  })

  it('parses a command with no argument', () => {
    expect(parseSlashCommand('/notes')).toEqual({ command: 'notes', args: '' })
    expect(parseSlashCommand('/run')).toEqual({ command: 'run', args: '' })
  })

  it('trims surrounding whitespace on the input and the argument', () => {
    expect(parseSlashCommand('   /chart   revenue by quarter   ')).toEqual({
      command: 'chart',
      args: 'revenue by quarter'
    })
  })

  it('keeps the argument verbatim apart from the outer trim', () => {
    expect(parseSlashCommand('/inline a "quoted" phrase — with punctuation!')).toEqual({
      command: 'inline',
      args: 'a "quoted" phrase — with punctuation!'
    })
  })

  it('accepts a multi-line argument', () => {
    expect(parseSlashCommand('/improve line one\nline two')).toEqual({
      command: 'improve',
      args: 'line one\nline two'
    })
  })

  it('is case-insensitive on the command word', () => {
    expect(parseSlashCommand('/Notes')).toEqual({ command: 'notes', args: '' })
    expect(parseSlashCommand('/DECK a talk on rust')).toEqual({
      command: 'deck',
      args: 'a talk on rust'
    })
  })

  it('returns null for text that is not a slash command', () => {
    expect(parseSlashCommand('improve this slide')).toBeNull()
    expect(parseSlashCommand('')).toBeNull()
    expect(parseSlashCommand('   ')).toBeNull()
    expect(parseSlashCommand('what about http://x/y')).toBeNull()
  })

  it('returns null for an unknown command so it is sent to the agent as prose', () => {
    expect(parseSlashCommand('/nope')).toBeNull()
    expect(parseSlashCommand('/improved something')).toBeNull()
    expect(parseSlashCommand('/')).toBeNull()
    expect(parseSlashCommand('//improve')).toBeNull()
  })

  it('does not treat a slash inside a sentence as a command', () => {
    expect(parseSlashCommand('use the /run command')).toBeNull()
  })
})

describe('slashAutocompleteQuery', () => {
  it('returns the partial command word while it is being typed', () => {
    expect(slashAutocompleteQuery('/')).toBe('')
    expect(slashAutocompleteQuery('/i')).toBe('i')
    expect(slashAutocompleteQuery('/impr')).toBe('impr')
  })

  it('closes once an argument is started or the text is not a command', () => {
    expect(slashAutocompleteQuery('/improve ')).toBeNull()
    expect(slashAutocompleteQuery('/improve make it shorter')).toBeNull()
    expect(slashAutocompleteQuery('hello')).toBeNull()
    expect(slashAutocompleteQuery(' /improve')).toBeNull()
    expect(slashAutocompleteQuery('')).toBeNull()
  })
})

describe('matchSlashCommands', () => {
  it('lists every command for an empty query', () => {
    expect(matchSlashCommands('')).toHaveLength(SLASH_COMMANDS.length)
  })

  it('filters by prefix, case-insensitively', () => {
    expect(matchSlashCommands('i').map((c) => c.name)).toEqual(['improve', 'image', 'inline'])
    expect(matchSlashCommands('IM').map((c) => c.name)).toEqual(['improve', 'image'])
    expect(matchSlashCommands('run').map((c) => c.name)).toEqual(['run'])
  })

  it('returns nothing when no command matches', () => {
    expect(matchSlashCommands('zzz')).toEqual([])
  })
})

describe('completeSlashCommand', () => {
  it('leaves a trailing space only when the command takes an argument', () => {
    expect(completeSlashCommand(getSlashCommand('improve')!)).toBe('/improve ')
    expect(completeSlashCommand(getSlashCommand('notes')!)).toBe('/notes')
  })
})
