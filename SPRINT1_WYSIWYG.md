# LECTA WYSIWYG EDITOR - SPRINT 1 IMPLEMENTATION

## Overview

Sprint 1 implements a unified WYSIWYG editor for Lecta slides. The main goal is to eliminate the separate "Visual | Editor | Draw" toggle modes and provide a single, always-editable slide canvas with inline element editing.

## What's New

### New Components

#### 1. **EditableSlideCanvas.tsx** ✅
- **Purpose**: Main WYSIWYG editing canvas
- **Location**: `src/renderer/src/components/slides/EditableSlideCanvas.tsx`
- **Features**:
  - Always visible, always editable
  - Renders markdown content via ContentRenderer
  - Overlays positioned elements (textbox, shapes, images)
  - Element selection with visual feedback (blue border + handles)
  - Keyboard shortcuts (Escape to deselect, Ctrl+S to save)
  - No mode toggle needed
- **Props**:
  ```typescript
  interface EditableSlideCanvasProps {
    slideIndex: number
    canvasWidth?: number          // Default: 1024
    canvasHeight?: number         // Default: 576
    scale?: number                // Default: 1
    isDarkTheme?: boolean         // Default: true
    editingMode?: boolean         // Default: true
    onUpdateMarkdown?: (content: string) => void
    onUpdateNotes?: (notes: string) => void
  }
  ```

#### 2. **SelectableSlideElements.tsx** ✅
- **Purpose**: Element selection and interaction layer
- **Location**: `src/renderer/src/components/slides/SelectableSlideElements.tsx`
- **Features**:
  - Parses positioned elements from markdown (textbox, shape, image)
  - Creates clickable overlays for each element
  - Handles element selection state
  - Visual feedback on hover (semi-transparent background)
  - Blue highlight when selected
  - Does NOT render elements themselves (ContentRenderer does)
- **Parsers**:
  - `parseTextBoxes()`: Extracts `<!-- textbox ... -->...<!-- /textbox -->`
  - `parseShapes()`: Extracts `<!-- shape ... -->`
  - `parseImages()`: Extracts `<!-- image ... -->`

#### 3. **InlineElementEditor.tsx** ✅
- **Purpose**: Context-aware inline editing for selected elements
- **Location**: `src/renderer/src/components/slides/InlineElementEditor.tsx`
- **Features**:
  - Floats above selected element as a modal panel
  - Different UI for each element type:
    - **Textbox**: Text input, font size slider, color picker, quick colors
    - **Shape**: Fill color, stroke color, stroke width slider
    - **Image**: Source path, border style, border radius
  - Auto-closes on Escape or click-outside
  - Updates markdown with changes in real-time
- **Element Types**:
  - Textbox editing: content, font size (fs), font color (fc)
  - Shape editing: fill, stroke, stroke width (sw)
  - Image editing: src, border, radius

#### 4. **SimplifiedSlideEditor.tsx** ✅
- **Purpose**: Replacement for SlidePanel with unified editing
- **Location**: `src/renderer/src/components/slides/SimplifiedSlideEditor.tsx`
- **Features**:
  - No more mode toggle (Visual | Editor | Draw)
  - Always shows EditableSlideCanvas
  - Optional collapsible markdown panel (right side)
  - Simplified toolbar with save and panel toggle
  - Optional slide navigator (top)
  - Keyboard shortcuts:
    - `Ctrl/Cmd + S`: Save
    - `Ctrl + Tab`: Toggle markdown panel
    - `Esc`: Deselect element
  - Resizable markdown panel (drag border)

#### 5. **useSlideElementSelection.ts** ✅
- **Purpose**: Custom hook for element selection state management
- **Location**: `src/renderer/src/hooks/useSlideElementSelection.ts`
- **Provides**:
  ```typescript
  {
    selectedElement: SelectedElement | null
    selectElement: (element: SelectedElement | null) => void
    clearSelection: () => void
    isEditing: boolean
    toggleEditMode: () => void
    startEditing: () => void
    stopEditing: () => void
    lastSelectedIndex: number | null
  }
  ```

## Integration Steps

### Step 1: Basic Integration (Testing)
To test the new components without breaking existing functionality:

```tsx
// In src/renderer/src/components/layout/AppShell.tsx
import { SimplifiedSlideEditor } from '../slides/SimplifiedSlideEditor'

// Replace SlidePanel with SimplifiedSlideEditor temporarily for testing
export function AppShell() {
  // ... existing code ...
  return (
    <>
      {/* ... other components ... */}
      <SimplifiedSlideEditor />  {/* Replace <SlidePanel /> */}
      {/* ... other components ... */}
    </>
  )
}
```

### Step 2: Full Integration (Production)
Once tested and validated, update the editor mode toggle in UI store:

```tsx
// In src/renderer/src/stores/ui-store.ts
// Remove editorMode toggle since we always show unified view
// Keep editorMode enum for backwards compatibility
```

### Step 3: Migration from SlidePanel
Eventually replace SlidePanel.tsx entirely:
1. Move any SlidePanel-specific logic to SimplifiedSlideEditor
2. Update AppShell.tsx imports
3. Remove SlidePanel.tsx

## Data Model

### Element Types

```typescript
interface SelectedElement {
  type: 'textbox' | 'shape' | 'image'
  index: number
  x: number
  y: number
  w?: number
  h?: number
  content?: string              // element content or properties
  matchStart: number            // position in markdown
  matchEnd: number              // position in markdown
}
```

### Markdown Format

Elements are stored as HTML comments in markdown:

**Textbox:**
```markdown
<!-- textbox x=100 y=200 w=300 fs=18 fc=#ffffff fb=0 fi=0 -->
Your text content here
<!-- /textbox -->
```

**Shape:**
```markdown
<!-- shape type=rect x=50 y=100 w=200 h=150 fill=#3b82f6 stroke=#ffffff sw=2 -->
```

**Image:**
```markdown
<!-- image x=200 y=300 w=400 src=/path/to/image.png border=2px solid white radius=8 -->
```

## How It Works

### 1. Element Selection Flow
```
User clicks on canvas
  ↓
SelectableSlideElements detects click on element
  ↓
onSelectElement callback fired
  ↓
EditableSlideCanvas updates selectedElement state
  ↓
SelectionHandles displayed around element (blue border + handles)
```

### 2. Element Editing Flow
```
Element selected
  ↓
InlineElementEditor automatically opens (modal panel)
  ↓
User edits properties (text, color, size, etc.)
  ↓
InlineElementEditor updates markdown
  ↓
onUpdate callback triggers markdown update in store
  ↓
Slide re-renders with updated element
```

### 3. Content Update Flow
```
onUpdateMarkdown(newContent)
  ↓
updateMarkdownContent(slideIndex, newContent)
  ↓
PresentationStore updates slide.markdownContent
  ↓
Components re-render with new content
  ↓
Slide is marked as "unsaved"
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Escape` | Deselect current element / Close inline editor |
| `Ctrl/Cmd + S` | Save slide content |
| `Ctrl + Tab` | Toggle markdown panel visibility |
| Click outside element | Deselect element |
| Double-click element | Open inline editor (future) |

## Testing Checklist

- [ ] EditableSlideCanvas renders slide content
- [ ] Elements are clickable and selectable
- [ ] Selection shows blue border + resize handles
- [ ] InlineElementEditor opens when element selected
- [ ] Textbox editing works (text, color, size)
- [ ] Shape editing works (fill, stroke)
- [ ] Image editing works (src, border, radius)
- [ ] Markdown panel can toggle on/off
- [ ] Markdown panel can resize
- [ ] Keyboard shortcuts work
- [ ] Save functionality works
- [ ] Element deselect works
- [ ] Markdown changes sync to canvas
- [ ] Canvas changes sync to markdown panel

## Future Enhancements (Sprint 2+)

1. **Multi-element selection** - Select multiple elements with Shift+Click
2. **Drag to move elements** - Click and drag to reposition
3. **Resize elements** - Drag handles to resize
4. **Undo/Redo** - Full undo/redo support for element edits
5. **Element groups** - Group elements together
6. **Alignment tools** - Align, distribute, snap to grid
7. **Element duplicates** - Copy/paste elements
8. **Drawing mode integration** - Bring back drawing overlay as optional
9. **Advanced text editing** - Rich text formatting toolbar
10. **Asset library** - Browse and insert assets directly

## Files Created/Modified

### Created
- `src/renderer/src/components/slides/EditableSlideCanvas.tsx` (NEW)
- `src/renderer/src/components/slides/SelectableSlideElements.tsx` (NEW)
- `src/renderer/src/components/slides/InlineElementEditor.tsx` (NEW)
- `src/renderer/src/components/slides/SimplifiedSlideEditor.tsx` (NEW)
- `src/renderer/src/hooks/useSlideElementSelection.ts` (NEW)
- `SPRINT1_WYSIWYG.md` (THIS FILE)

### To Be Modified (Integration)
- `src/renderer/src/components/layout/AppShell.tsx` - Change SlidePanel to SimplifiedSlideEditor
- `src/renderer/src/stores/ui-store.ts` - Optional: deprecate editorMode
- `src/renderer/src/components/slides/SlidePanel.tsx` - Optional: deprecate

## Architecture Notes

### Why These Components?

1. **EditableSlideCanvas**: Single responsibility - manage the main editing surface and element selection
2. **SelectableSlideElements**: Separation of concerns - just handle click detection, not rendering
3. **InlineElementEditor**: Self-contained editor UI - can be used in other contexts
4. **SimplifiedSlideEditor**: Layout/coordination - brings everything together
5. **useSlideElementSelection**: Reusable state management - can be used in multiple editors

### Design Decisions

- **Positioned Elements as Comments**: Leverages existing DraggableElements parser, maintains markdown compatibility
- **Portal-based Inline Editor**: Floating panel doesn't constrain to canvas bounds, better UX
- **Selection State in Component**: Per-canvas selection, doesn't need global store (yet)
- **Markdown as Source of Truth**: All changes go through markdown, ensures consistency

## Troubleshooting

### Elements not appearing
- Check markdown format matches `<!-- textbox ... -->...<!-- /textbox -->`
- Verify DraggableElements component is still rendering elements
- Check console for parser errors

### Inline editor not opening
- Ensure EditableSlideCanvas is passing selectedElement to InlineElementEditor
- Check element.type is valid ('textbox' | 'shape' | 'image')

### Markdown not syncing
- Verify onUpdateMarkdown is wired to PresentationStore
- Check updateMarkdownContent is being called
- Look for errors in browser console

### Selection handles not visible
- Ensure SelectionHandles component is rendering in EditableSlideCanvas
- Check z-index values (handles should be z-50)
- Verify selected element has valid x, y, w values

## Contact

For questions or issues with Sprint 1 implementation, refer to:
- Code comments in each component
- Test files (to be added in Sprint 1)
- Git history for implementation details
