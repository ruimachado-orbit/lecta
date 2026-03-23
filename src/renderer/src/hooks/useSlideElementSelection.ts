import { useState, useCallback } from 'react'
import type { SelectedElement } from '../components/slides/EditableSlideCanvas'

/**
 * useSlideElementSelection
 * 
 * Hook for managing slide element selection state.
 * Tracks:
 * - Selected element (textbox, shape, or image)
 * - Element editing mode
 * - Multi-select (future)
 */
export function useSlideElementSelection() {
  const [selectedElement, setSelectedElement] = useState<SelectedElement | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null)
  
  const selectElement = useCallback((element: SelectedElement | null) => {
    setSelectedElement(element)
    if (element) {
      setLastSelectedIndex(element.index)
    }
  }, [])
  
  const clearSelection = useCallback(() => {
    setSelectedElement(null)
    setIsEditing(false)
  }, [])
  
  const toggleEditMode = useCallback(() => {
    setIsEditing((prev) => !prev)
  }, [])
  
  const startEditing = useCallback(() => {
    setIsEditing(true)
  }, [])
  
  const stopEditing = useCallback(() => {
    setIsEditing(false)
  }, [])
  
  return {
    selectedElement,
    selectElement,
    clearSelection,
    isEditing,
    toggleEditMode,
    startEditing,
    stopEditing,
    lastSelectedIndex,
  }
}

export default useSlideElementSelection
