#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createLectaServer } from './server.js'

const server = createLectaServer()
const transport = new StdioServerTransport()
await server.connect(transport)
