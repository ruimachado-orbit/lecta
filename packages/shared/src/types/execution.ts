export interface ExecutionResult {
  stdout: string
  stderr: string
  exitCode: number | null
  duration: number
  htmlOutput?: string
  tableOutput?: TableOutput
  status: 'success' | 'error' | 'timeout' | 'cancelled'
}

export interface TableOutput {
  columns: string[]
  rows: (string | number | null)[][]
}

export interface ExecutionRequest {
  code: string
  language: string
  engine: string
  cwd?: string
  command?: string
  args?: string[]
  timeout?: number
}

export interface StreamChunk {
  type: 'stdout' | 'stderr'
  data: string
}
