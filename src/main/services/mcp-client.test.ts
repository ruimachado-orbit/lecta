import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtemp, writeFile, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { McpClient, extractToolResultText } from './mcp-client'

let tempDir: string
let serverPath: string

// A minimal stdio MCP server: reads JSON-RPC lines, answers initialize,
// tools/list and tools/call. Written as CJS so both Node and Bun run it.
const FAKE_SERVER = `
const readline = require('readline')
const rl = readline.createInterface({ input: process.stdin })
function respond(obj) { process.stdout.write(JSON.stringify(obj) + '\\n') }
rl.on('line', (line) => {
  let msg
  try { msg = JSON.parse(line) } catch { return }
  if (msg.method === 'initialize') {
    respond({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: '2024-11-05', serverInfo: { name: 'fake', version: '1.0' }, capabilities: { tools: {} } } })
  } else if (msg.method === 'tools/list') {
    respond({ jsonrpc: '2.0', id: msg.id, result: { tools: [
      { name: 'get_sales', description: 'Get sales figures', inputSchema: { type: 'object', properties: {} } },
      { name: 'get_users', description: 'Get users' }
    ] } })
  } else if (msg.method === 'tools/call') {
    const name = msg.params && msg.params.name
    if (name === 'get_sales') respond({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: 'Q3 revenue: $4.2M' }] } })
    else respond({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: '42 users' }] } })
  } else {
    respond({ jsonrpc: '2.0', id: msg.id, result: {} })
  }
})
`

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'lecta-mcp-client-'))
  serverPath = join(tempDir, 'fake-server.cjs')
  await writeFile(serverPath, FAKE_SERVER)
})

afterAll(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

describe('McpClient', () => {
  it('lists tools from a stdio MCP server', async () => {
    const client = new McpClient({ name: 'fake', command: process.execPath, args: [serverPath] })
    try {
      const tools = await client.listTools()
      expect(tools.map((t) => t.name).sort()).toEqual(['get_sales', 'get_users'])
    } finally {
      client.dispose()
    }
  })

  it('calls a tool and extracts its text result', async () => {
    const client = new McpClient({ name: 'fake', command: process.execPath, args: [serverPath] })
    try {
      const result = await client.callTool('get_sales', {})
      expect(result.isError).toBe(false)
      expect(result.text).toContain('$4.2M')
    } finally {
      client.dispose()
    }
  })
})

describe('extractToolResultText', () => {
  it('joins text content parts', () => {
    expect(
      extractToolResultText({ content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] }).text
    ).toBe('a\nb')
  })

  it('surfaces structuredContent as JSON', () => {
    expect(extractToolResultText({ structuredContent: { n: 1 } }).text).toBe('{"n":1}')
  })

  it('marks isError', () => {
    expect(extractToolResultText({ content: [{ type: 'text', text: 'x' }], isError: true }).isError).toBe(true)
  })
})
