import type { NextConfig } from 'next'
import path from 'path'

const config: NextConfig = {
  output: 'export', // static export — works on Vercel and any static host
  trailingSlash: true,
  outputFileTracingRoot: path.join(__dirname, '..'),
}

export default config
