import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFile } from 'fs/promises'
import { fileURLToPath } from 'url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { CODE_LANGUAGES, SLIDE_LAYOUTS, SLIDE_THEMES, SLIDE_TRANSITIONS } from '#shared/slide-options.js'
import { createLectaServer } from './server.js'

/**
 * Drives the real server over an in-memory transport, so what these tests read is exactly
 * what an MCP client sees — the advertised version and the tool JSON schemas.
 */
let client: Client
let tools: Awaited<ReturnType<Client['listTools']>>['tools']
let packageVersion: string

beforeAll(async () => {
  packageVersion = JSON.parse(
    await readFile(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf-8')
  ).version

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  client = new Client({ name: 'test', version: '0' })
  await Promise.all([
    createLectaServer().connect(serverTransport),
    client.connect(clientTransport),
  ])
  tools = (await client.listTools()).tools
})

afterAll(async () => {
  await client?.close()
})

type SchemaNode = { properties?: Record<string, SchemaNode>; enum?: readonly string[] }

/** The `enum` a tool's JSON schema advertises for a (possibly nested) parameter. */
function enumOf(tool: string, ...path: string[]): readonly string[] | undefined {
  const found = tools.find((t) => t.name === tool)
  expect(found, `tool ${tool}`).toBeDefined()
  let node = found!.inputSchema as SchemaNode
  for (const key of path) {
    const next = node.properties?.[key]
    expect(next, `${tool}.${path.join('.')}`).toBeDefined()
    node = next!
  }
  return node.enum
}

describe('createLectaServer', () => {
  it('advertises the version from package.json, not a hardcoded copy', async () => {
    const info = client.getServerVersion()
    expect(info?.name).toBe('lecta')
    expect(info?.version).toBe(packageVersion)
  })

  // Tool schemas are built from the shared `as const` lists, so a layout or theme added
  // in packages/shared reaches Claude without anyone editing server.ts.
  it('offers every shared layout, theme, transition and language', () => {
    expect(enumOf('create_presentation', 'theme')).toEqual([...SLIDE_THEMES])
    expect(enumOf('set_theme', 'theme')).toEqual([...SLIDE_THEMES])
    expect(enumOf('add_slide', 'layout')).toEqual([...SLIDE_LAYOUTS])
    expect(enumOf('edit_slide', 'layout')).toEqual([...SLIDE_LAYOUTS])
    expect(enumOf('edit_slide', 'transition')).toEqual([...SLIDE_TRANSITIONS])
    expect(enumOf('add_slide', 'code', 'language')).toEqual([...CODE_LANGUAGES])
  })
})
