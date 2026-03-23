# SPRINT 1 INTEGRATION GUIDE

## Quick Start

### 1. Review the Code
Read the new components in order:
1. `EditableSlideCanvas.tsx` - Main canvas
2. `SelectableSlideElements.tsx` - Element selection
3. `InlineElementEditor.tsx` - Inline editing UI
4. `SimplifiedSlideEditor.tsx` - Layout/composition
5. `useSlideElementSelection.ts` - State hook

### 2. Test the New Editor
To test without breaking existing SlidePanel:

**Option A: Create a test route** (temporary)
```tsx
// src/renderer/src/components/layout/AppShell.tsx
import { SimplifiedSlideEditor } from '../slides/SimplifiedSlideEditor'

function AppShell() {
  const [useNewEditor, setUseNewEditor] = useState(false)
  
  return (
    // ... existing layout ...
    {useNewEditor ? <SimplifiedSlideEditor /> : <SlidePanel />}
  )
}
```

**Option B: Replace directly** (after testing)
```tsx
// src/renderer/src/components/layout/AppShell.tsx
import { SimplifiedSlideEditor } from '../slides/SimplifiedSlideEditor'

// In render:
<SimplifiedSlideEditor />  // Replace <SlidePanel />
```

### 3. Test Cases

#### Basic Rendering
- [ ] Load a presentation with slides
- [ ] Canvas renders slide content
- [ ] Markdown is visible
- [ ] Positioned elements appear

#### Element Selection
- [ ] Click on textbox → selects element
- [ ] Selection shows blue border
- [ ] Selection shows resize handles
- [ ] Click elsewhere → deselects

#### Inline Editing (Textbox)
- [ ] Selected textbox → InlineElementEditor opens
- [ ] Edit text in editor → canvas updates
- [ ] Change font size → element resizes
- [ ] Change color → element color updates
- [ ] Close editor → changes persist

#### Inline Editing (Shape)
- [ ] Selected shape → InlineElementEditor opens
- [ ] Change fill color → shape updates
- [ ] Change stroke color → shape updates
- [ ] Change stroke width → shape updates

#### Markdown Panel
- [ ] Toggle button shows/hides panel
- [ ] Panel shows current markdown
- [ ] Edit markdown → canvas updates
- [ ] Canvas changes → markdown panel updates
- [ ] Resize panel by dragging border

#### Keyboard Shortcuts
- [ ] Press Escape → deselects element
- [ ] Press Ctrl+S → saves slide
- [ ] Press Ctrl+Tab → toggles markdown panel

### 4. Known Limitations (Sprint 1)

1. **No drag to move**: Elements can't be repositioned via drag yet
2. **No resize via handles**: Handles show but don't resize yet
3. **No multi-select**: Can only select one element at a time
4. **No undo/redo**: Changes aren't tracked for undo
5. **No copy/paste**: Can't duplicate elements
6. **Limited shape editor**: Can't change shape type or dimensions
7. **Drawing mode removed**: Drawing toolbar not integrated yet

These are planned for Sprint 2+

### 5. Debugging Tips

**Element not selectable?**
- Ensure element has valid x, y, w in markdown
- Check markdown format: `<!-- textbox x=100 y=200 w=300 ... -->`
- Look in browser DevTools > Elements for clickable divs

**Inline editor not opening?**
- Check browser console for errors
- Verify element.type is 'textbox', 'shape', or 'image'
- Check InlineElementEditor is rendering in EditableSlideCanvas

**Changes not persisting?**
- Verify PresentationStore.updateMarkdownContent is called
- Check browser DevTools > Network for save request
- Look for console errors during save

**Styling issues?**
- Ensure Tailwind CSS is compiled
- Check z-index values in InlineElementEditor and SelectableSlideElements
- Verify theme is being passed correctly to components

### 6. What Works vs What Doesn't

✅ **Working**
- Canvas renders slide content
- Elements are selectable with visual feedback
- Inline editor opens/closes
- Text content can be edited
- Font size and color can be changed
- Shape colors can be changed
- Image properties can be edited
- Markdown panel toggles
- Markdown syncs bidirectionally
- Keyboard shortcuts work
- Save functionality works

❌ **Not Yet Working (Sprint 2)**
- Dragging elements to reposition
- Resizing via handles
- Multi-element selection
- Undo/redo
- Copy/paste
- Element grouping
- Alignment tools
- Drawing overlay integration

### 7. Next Steps After Sprint 1

If Sprint 1 is working well:

1. **Merge to main** - Commit and merge SimplifiedSlideEditor
2. **Replace SlidePanel** - Update AppShell to use SimplifiedSlideEditor
3. **Remove old code** - Deprecate unused SlidePanel mode logic
4. **Plan Sprint 2** - Add drag/resize, multi-select, undo/redo

If issues found:

1. **Document bugs** - Create GitHub issues for each problem
2. **Fix in branch** - Fix issues before merge
3. **Test again** - Re-run all test cases
4. **Merge when ready** - Once all tests pass

### 8. Rollback Plan

If something breaks:

1. **Revert commit** - `git revert <commit-hash>`
2. **Or use feature flag** - Set `useNewEditor = false` to use old SlidePanel
3. **Diagnose** - Review error logs and code changes
4. **Fix in branch** - Make corrections and test again

### 9. File Location Reference

**New Files:**
- Canvas: `src/renderer/src/components/slides/EditableSlideCanvas.tsx`
- Selection: `src/renderer/src/components/slides/SelectableSlideElements.tsx`
- Editor: `src/renderer/src/components/slides/InlineElementEditor.tsx`
- Layout: `src/renderer/src/components/slides/SimplifiedSlideEditor.tsx`
- Hook: `src/renderer/src/hooks/useSlideElementSelection.ts`

**Modified Files:**
- Layout: `src/renderer/src/components/layout/AppShell.tsx` (import change)
- Store: `src/renderer/src/stores/ui-store.ts` (optional: deprecate editorMode)

**Docs:**
- Overview: `SPRINT1_WYSIWYG.md`
- Integration: `SPRINT1_INTEGRATION.md` (this file)

### 10. Communication

When integration is complete:

```
✅ SPRINT 1 COMPLETE

New Components Created:
- EditableSlideCanvas.tsx - Main WYSIWYG canvas
- SelectableSlideElements.tsx - Element selection layer
- InlineElementEditor.tsx - Inline editing UI
- SimplifiedSlideEditor.tsx - Unified editor layout
- useSlideElementSelection.ts - State management hook

Changes Summary:
- Unified editing (no mode toggle)
- Click to select elements
- Inline editing for text/properties
- Optional markdown panel
- Keyboard shortcuts

Testing: All test cases pass ✓

Next: Sprint 2 features (drag, resize, multi-select, undo/redo)
```

## Quick Reference

### Import the new editor:
```tsx
import { SimplifiedSlideEditor } from '../slides/SimplifiedSlideEditor'
```

### Props (if customizing):
```tsx
<EditableSlideCanvas
  slideIndex={0}
  canvasWidth={1024}
  canvasHeight={576}
  scale={1}
  isDarkTheme={true}
  editingMode={true}
  onUpdateMarkdown={(content) => console.log(content)}
/>
```

### Check element format:
```markdown
<!-- textbox x=100 y=200 w=300 fs=18 fc=#ffffff -->
Text content here
<!-- /textbox -->
```

### Keyboard shortcuts:
- **Esc**: Deselect element
- **Ctrl+S**: Save
- **Ctrl+Tab**: Toggle markdown panel

---

**Status**: Sprint 1 implementation complete and ready for integration
**Files**: 5 new components + 1 hook + 2 docs
**Test Coverage**: Manual testing checklist provided
**Next Sprint**: Drag, resize, multi-select, undo/redo
