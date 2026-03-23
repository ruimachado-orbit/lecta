# LECTA Editor: User Guide & Tutorial

Welcome to LECTA, a modern, feature-rich text editor designed for productivity and extensibility.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Basic Operations](#basic-operations)
3. [Advanced Features](#advanced-features)
4. [Plugins & Extensions](#plugins--extensions)
5. [Customization](#customization)
6. [Tips & Tricks](#tips--tricks)
7. [Troubleshooting](#troubleshooting)

---

## Getting Started

### Launch LECTA

Open LECTA by running:
```bash
npm run dev
```

The editor will open in your default browser at `http://localhost:5173`.

### First Look

When you open LECTA, you'll see:

1. **Toolbar** (top) - Quick access to common operations
2. **Editor Panel** (center) - Where you write your content
3. **Preview Panel** (right) - Live preview of formatted content
4. **Status Bar** (bottom) - Current state and statistics

### Create Your First Document

1. Click **File** → **New Document** (or press **Ctrl+N**)
2. Start typing in the editor
3. Your work auto-saves to browser storage
4. See your formatted output in the preview pane

---

## Basic Operations

### Creating Documents

**New Document**
- Menu: File → New Document
- Shortcut: `Ctrl+N` (Windows/Linux) or `Cmd+N` (Mac)

**Open Document**
- Menu: File → Open
- Shortcut: `Ctrl+O` or `Cmd+O`
- Supported formats: `.md`, `.txt`, `.json`

**Save Document**
- Menu: File → Save
- Shortcut: `Ctrl+S` or `Cmd+S`
- Auto-saves every 30 seconds

**Export Document**
- Menu: File → Export
- Formats: HTML, PDF, Markdown, Plain Text

### Editing Text

**Select All Text**
- Shortcut: `Ctrl+A` or `Cmd+A`

**Cut, Copy, Paste**
- Cut: `Ctrl+X` or `Cmd+X`
- Copy: `Ctrl+C` or `Cmd+C`
- Paste: `Ctrl+V` or `Cmd+V`

**Undo/Redo**
- Undo: `Ctrl+Z` or `Cmd+Z`
- Redo: `Ctrl+Shift+Z` or `Cmd+Shift+Z`
- Redo (alternative): `Ctrl+Y` or `Cmd+Y`

**Find & Replace**
- Find: `Ctrl+F` or `Cmd+F`
- Replace: `Ctrl+H` or `Cmd+H`
- Find Next: `F3` or `Cmd+G`
- Find Previous: `Shift+F3` or `Cmd+Shift+G`

### Text Formatting

**Basic Markdown Formatting**

Type directly in the editor. LECTA supports:

```markdown
# Heading 1
## Heading 2
### Heading 3

**Bold text** or __bold__
*Italic text* or _italic_
***Bold and italic***

~~Strikethrough~~

[Link text](https://example.com)

![Alt text](image.jpg)

- Bullet list
- Item 2
  - Nested item

1. Numbered list
2. Item 2

> Blockquote
> Multiple lines

`inline code`

\`\`\`javascript
code block
with syntax highlighting
\`\`\`
```

All formatting appears in real-time in the preview panel.

---

## Advanced Features

### Syntax Highlighting

LECTA supports syntax highlighting for:
- JavaScript / TypeScript
- Python
- Java
- C++
- HTML
- CSS
- SQL
- JSON
- YAML
- And 50+ more languages

**To enable:**
1. Click the **Language** dropdown in the toolbar
2. Select your language
3. Highlighting applies instantly

### Search & Replace

**Find Text**
1. Press `Ctrl+F` (or `Cmd+F`)
2. Type search term
3. Results highlight in yellow
4. Navigate with arrow buttons or `Enter`

**Replace Text**
1. Press `Ctrl+H` (or `Cmd+H`)
2. Enter search term and replacement
3. Click **Replace** or **Replace All**
4. Undo with `Ctrl+Z` if needed

**Search Options**
- **Match Case**: Only match exact case
- **Whole Words**: Match complete words only
- **Regex**: Use regular expressions

### Collaborative Editing Indicators

When multiple users are editing:
- **Presence dots** show active editors in margin
- **Colored selections** indicate other users' selections
- **Status bar** shows connected collaborators
- Real-time sync of changes (when enabled)

### Code Block Features

Code blocks support:
- **Line numbers** - Click to copy line reference
- **Syntax highlighting** - 50+ languages
- **Copy button** - Copy entire block
- **Language indicator** - Displays current language

```python
# Example Python code
def hello(name):
    return f"Hello, {name}!"

print(hello("LECTA"))
```

### Tables

Create markdown tables:

```markdown
| Header 1 | Header 2 | Header 3 |
|----------|----------|----------|
| Cell 1   | Cell 2   | Cell 3   |
| Cell 4   | Cell 5   | Cell 6   |
```

---

## Plugins & Extensions

### Installing Plugins

**From Plugin Marketplace**
1. Click **Extensions** → **Plugin Marketplace**
2. Search or browse available plugins
3. Click **Install** on your desired plugin
4. Authorize permissions
5. Plugin activates automatically

**Manual Installation**
1. Download plugin file (.lectaplugin)
2. Drag into editor or File → Install Plugin
3. Grant necessary permissions
4. Enable in Extensions → Installed Plugins

### Popular Plugins

**Spellchecker**
- Real-time spell checking
- Multiple language support
- Custom dictionary

**Grammar Assistant**
- Grammar and style suggestions
- Tone adjustment recommendations
- Writing statistics

**AI Assistant**
- Generate content
- Summarize text
- Improve writing

**Version Control**
- Track document changes
- Compare versions
- Restore previous versions

**Export Pro**
- Advanced export options
- Custom formatting
- Batch operations

### Enabling/Disabling Plugins

1. Click **Extensions** → **Installed Plugins**
2. Toggle plugin switch to enable/disable
3. Configure plugin settings
4. Changes apply instantly

### Plugin Settings

Access plugin configuration:
1. Extensions → Installed Plugins
2. Click ⚙️ icon next to plugin name
3. Adjust settings
4. Click **Save**

---

## Customization

### Theme Selection

**Light Theme**
- Clean, bright interface
- Best for natural lighting
- Easy on eyes during day

**Dark Theme**
- Reduced eye strain
- Best for low-light environments
- Modern appearance

**Switch Theme**
- Click theme icon (☀️/🌙) in toolbar
- Or: Settings → Appearance → Theme
- Preference auto-saves

### Font Settings

1. Settings → Appearance → Font
2. Choose font family, size, line height
3. Preview updates in real-time
4. Changes apply to entire editor

Available fonts:
- System Mono
- Fira Code
- JetBrains Mono
- Courier New
- Plus 20+ others

**Recommended settings:**
- Font size: 13-16px
- Line height: 1.5-1.8
- Font: Monospace (for code), Sans-serif (for prose)

### Color Customization

**Custom Color Scheme**
1. Settings → Appearance → Colors
2. Click color swatches to customize
3. Import/Export custom schemes
4. Share with team

**Available Options**
- Editor background
- Text color
- Selection highlight
- Syntax highlighting colors
- UI element colors

### Keyboard Shortcuts

**View All Shortcuts**
- Help → Keyboard Shortcuts
- Or: `Ctrl+?` (Windows/Linux) / `Cmd+?` (Mac)

**Customize Shortcuts**
1. Settings → Keyboard Shortcuts
2. Click shortcut to modify
3. Press new key combination
4. Click **Save**
5. Restart editor to apply

**Common Customizations**
```
Ctrl+Shift+F        Format Document
Ctrl+Shift+P        Command Palette
Ctrl+Shift+X        Execute Code
Alt+Up/Down         Move Line Up/Down
```

---

## Tips & Tricks

### Productivity Hacks

**Command Palette**
- Press `Ctrl+Shift+P` (or `Cmd+Shift+P`)
- Start typing command name
- Executes instantly
- Faster than menu navigation

**Multi-Select (Sublime-style)**
- `Ctrl+D` - Select next occurrence
- `Ctrl+Shift+L` - Select all occurrences
- Click + `Ctrl` - Add selection
- `Esc` - Clear selections

**Line Operations**
- `Ctrl+Shift+K` - Delete line
- `Alt+Up` - Move line up
- `Alt+Down` - Move line down
- `Ctrl+Shift+D` - Duplicate line

**Indentation**
- `Tab` - Indent selection
- `Shift+Tab` - Outdent selection
- Auto-indent on new lines

### Performance Tips

**For Large Documents (10,000+ lines)**
1. Disable preview pane (View → Hide Preview)
2. Reduce syntax highlighting scope
3. Close unnecessary plugins
4. Use code folding for long sections

**Code Folding**
- Click fold markers (arrows) in line numbers
- Or: Ctrl+K Ctrl+0 to fold all
- Ctrl+K Ctrl+J to unfold all

### Writing Tips

**Focus Mode**
1. View → Focus Mode
2. Hides UI, shows only editor
3. Press `Esc` to exit
4. Perfect for distraction-free writing

**Zen Mode**
1. View → Zen Mode
2. Full-screen immersive editing
3. All UI hidden
4. Press `Esc` to exit

**Statistics**
- View → Word Count (or `Ctrl+Shift+C`)
- Shows: characters, words, lines
- Updates in real-time

---

## Troubleshooting

### Common Issues

#### "My changes aren't saving"
**Solution:**
- Check browser's local storage is enabled
- Ensure at least 5MB storage available
- Try exporting manually: File → Export
- Clear browser cache and reload

#### "Editor feels slow with large files"
**Solution:**
- Hide preview pane (View → Hide Preview)
- Disable plugins temporarily
- Reduce syntax highlighting: Settings → Performance
- Close other browser tabs
- Use Code Folding to reduce visible content

#### "Shortcuts not working"
**Solution:**
- Verify keyboard layout (esp. non-US keyboards)
- Check plugin interference (disable and test)
- Reset shortcuts: Settings → Keyboard Shortcuts → Reset Defaults
- Check browser key binding conflicts

#### "Plugin won't install"
**Solution:**
- Ensure compatible plugin version
- Clear browser cache
- Check browser console for errors (F12)
- Try manual installation
- Report issue in Plugin Marketplace

#### "Theme not persisting"
**Solution:**
- Enable local storage
- Clear browser cache
- Check system dark mode preference
- Try exporting and reimporting settings

#### "Preview not updating"
**Solution:**
- Refresh browser (Ctrl+R or Cmd+R)
- Close and reopen document
- Check for invalid markdown syntax
- Try different markdown: `**bold**` vs `__bold__`

### Advanced Troubleshooting

**Access Browser Console**
- Windows/Linux: `F12` → Console tab
- Mac: `Cmd+Option+I` → Console tab

**Check for Errors**
1. Open browser console
2. Look for red error messages
3. Note the error and error code
4. Report in GitHub Issues

**Reset Editor**
1. Settings → Advanced
2. Click **Reset to Defaults**
3. Confirm warning
4. Editor restarts with defaults

**Export Diagnostics**
1. Settings → Advanced → Diagnostics
2. Click **Export Report**
3. Includes browser info, plugins, settings
4. Share when reporting issues

---

## Getting Help

### Resources

- **Documentation**: https://lecta.orbitplatform.ai/docs
- **GitHub Issues**: https://github.com/ruimachado-orbit/lecta/issues
- **Community Discord**: Join our Discord for questions
- **Email Support**: support@orbitplatform.ai

### Reporting Bugs

When reporting issues, include:
1. **Browser & OS**: Chrome 120 on Windows 11
2. **Steps to reproduce**: Clear, numbered steps
3. **Expected vs actual**: What should happen vs what happens
4. **Screenshots/video**: Visual demonstration
5. **Browser console errors**: Any error messages

### Feature Requests

Have an idea? Share it!
1. GitHub: https://github.com/ruimachado-orbit/lecta/discussions
2. Email: features@orbitplatform.ai
3. Discord: #feature-requests channel

---

## Advanced Configuration

### Custom .lectarc Configuration

Create `.lectarc.json` in your home directory:

```json
{
  "theme": "dark",
  "font": "JetBrains Mono",
  "fontSize": 14,
  "lineHeight": 1.6,
  "autoSave": true,
  "autoSaveInterval": 30000,
  "plugins": {
    "spellchecker": { "enabled": true, "language": "en-US" },
    "grammar": { "enabled": true, "strictMode": false }
  },
  "keybindings": {
    "format": "Ctrl+Shift+F",
    "openCommand": "Ctrl+Shift+P"
  }
}
```

### Environment Variables

For developers:
```bash
DEBUG=lecta:*              # Enable debug logging
LECTA_DEV_MODE=true       # Enable dev features
LECTA_PLUGIN_PATH=/path   # Custom plugin directory
LECTA_CONFIG_PATH=/path   # Custom config location
```

---

## Version Information

**LECTA v2.0.0** - Sprint 5 Release

**Included Features:**
- Core editor (Sprint 1)
- Advanced features (Sprint 2)
- Plugin system (Sprint 3)
- Performance optimization (Sprint 4)
- Polish & theme support (Sprint 5)

**Next Release:** Q2 2026

---

## Keyboard Shortcuts Reference

See [KEYBOARD_SHORTCUTS.md](./KEYBOARD_SHORTCUTS.md) for the complete reference.

---

**Last Updated:** 2026-03-23  
**For Latest Updates:** https://lecta.orbitplatform.ai
