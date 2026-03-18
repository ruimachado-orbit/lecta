import { create } from 'zustand'
import type { ExecutionResult } from '../../../../packages/shared/src/types/execution'

interface ExecutionState {
  output: string
  isExecuting: boolean
  lastResult: ExecutionResult | null
  error: string | null

  // Actions
  appendOutput: (text: string, stream: 'stdout' | 'stderr') => void
  setExecuting: (executing: boolean) => void
  setResult: (result: ExecutionResult) => void
  setError: (error: string) => void
  clearOutput: () => void
}

export const useExecutionStore = create<ExecutionState>((set) => ({
  output: '',
  isExecuting: false,
  lastResult: null,
  error: null,

  appendOutput: (text: string, stream: 'stdout' | 'stderr') => {
    set((state) => ({
      output: state.output + text
    }))
  },

  setExecuting: (executing: boolean) => {
    set({ isExecuting: executing })
  },

  setResult: (result: ExecutionResult) => {
    set({ lastResult: result, isExecuting: false })
  },

  setError: (error: string) => {
    set({ error, isExecuting: false })
  },

  clearOutput: () => {
    set({ output: '', lastResult: null, error: null })
  }
}))
