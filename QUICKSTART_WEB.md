# Quick Start Guide - WYSIWYG Slide Editor

## 🚀 Get Started in 30 Seconds

### 1. Open the Editor
```bash
# Option A: Direct file open (easiest)
open index.html

# Option B: Local server (recommended for full functionality)
python3 -m http.server 8000
# Then visit: http://localhost:8000
```

### 2. Create Your First Slide
1. Click **📝 Text** to add a text box
2. Double-click the text to edit it
3. Click **📦 Box** or **⭕ Circle** to add shapes
4. Drag elements around the canvas
5. Grab the blue handles to resize

### 3. Save Your Work
- **Auto-saves** every change to your browser (via LocalStorage)
- Click **💾 Export** to download as JSON file
- Click **📂 Import** to load a previous slide

That's it! You're ready to create slides.

---

## 📋 Essential Operations

### Select Elements
- **Single select**: Click an element
- **Multi-select**: Ctrl+Click (or Cmd+Click on Mac) multiple elements
- **Select all**: Ctrl+A (or Cmd+A)
- **Box select**: Click and drag on empty canvas to draw selection

### Move & Resize
- **Drag**: Click element and drag to move
- **Resize**: Grab the 8 blue handles around selected element
- **Snap-to-grid**: Toggle "📏 Snap" button to enable/disable

### Edit Text
- **Edit**: Double-click text element
- **Done**: Press Escape or click away
- **Style**: Use properties panel to change color

### Align & Distribute
When you select 2+ elements:
- **◀ Left** / **❘ Center** / **▶ Right** - Align horizontally
- **▲ Top** / **— Mid** / **▼ Bot** - Align vertically
- **↔ Dist** - Distribute evenly (horizontal)
- **↕ Dist** - Distribute evenly (vertical)

### Undo/Redo
- **Undo**: Ctrl+Z (or Cmd+Z)
- **Redo**: Ctrl+Y or Ctrl+Shift+Z (or Cmd+Y)

### Copy & Paste
- **Copy**: Ctrl+C (or Cmd+C)
- **Paste**: Ctrl+V (or Cmd+V)
- **Duplicate**: Ctrl+D (or Cmd+D)

### Delete
- Press **Delete** or **Backspace** to remove selected elements

---

## 🎨 Styling Elements

1. **Select** an element
2. Look at **Properties** panel on the right
3. Click **Fill Color** to change background
4. Click **Stroke Color** to change border
5. Changes apply instantly

---

## 💾 Save & Share

### Local Save (Auto)
- Automatically saved to browser storage
- Data persists even if you close the browser
- No manual save needed

### Export (Download)
1. Click **💾 Export** button
2. File `slide.json` downloads
3. Share the file with others

### Import (Load)
1. Click **📂 Import** button
2. Select a previously exported `.json` file
3. Slide loads with all elements restored

---

## ⌨️ Keyboard Shortcuts Cheat Sheet

| Action | Windows/Linux | Mac |
|--------|--------------|-----|
| Undo | Ctrl+Z | Cmd+Z |
| Redo | Ctrl+Y | Cmd+Y |
| Copy | Ctrl+C | Cmd+C |
| Paste | Ctrl+V | Cmd+V |
| Duplicate | Ctrl+D | Cmd+D |
| Select All | Ctrl+A | Cmd+A |
| Delete | Delete | Delete |
| Deselect | Esc | Esc |
| Edit Text | Double-click | Double-click |

---

## 🎯 Common Tasks

### Create a Title Slide
1. Click **📝 Text** 
2. Double-click, type title
3. Select the text element
4. Click **❘ Center** to center it
5. Change fill color in Properties

### Add a Colored Box
1. Click **📦 Box**
2. Select it, resize as needed
3. In Properties, click fill color
4. Pick a color
5. (Optional) Drag handles to adjust

### Group Multiple Elements
1. Ctrl+Click to select 2+ elements
2. Click **🔗 Group**
3. Now they move/align together
4. To separate: Click **🔓 Ungroup**

### Make Elements Same Size
1. Select first element
2. Note its width/height
3. Select second element
4. Resize to match using handles
5. (Tip: Use alignment tools for positioning)

### Send to Back/Bring to Front
1. Select element
2. Click **⬆ Front** or **⬇ Back**
3. Element Z-order changes

---

## 🐛 Troubleshooting

### Elements not saving?
- Check that LocalStorage is enabled
- Try exporting JSON as backup
- Refresh page to verify persistence

### Paste not working?
- Make sure you copied first (Ctrl+C)
- Paste button should be enabled
- Click on canvas area first, then paste

### Text not showing?
- Make sure element is large enough
- Double-click to enter edit mode
- Check Properties panel for text color

### Drag not working smoothly?
- Disable "📏 Snap" if grid is too restrictive
- Click on center of element, not edges
- Ensure element is selected first

### Want to start fresh?
- Export current slide first (backup)
- Refresh page (F5)
- Confirm you want to clear storage
- Canvas will be blank

---

## 💡 Pro Tips

1. **Use snap-to-grid** for precise alignment
2. **Hold Ctrl** while dragging to add/remove from selection
3. **Undo frequently** - you have unlimited undos
4. **Export often** - save backups as JSON
5. **Group related items** - easier to move together
6. **Use alignment** - it's faster than manual positioning
7. **Copy-paste** to duplicate exact copies
8. **Keyboard shortcuts** - faster than toolbar buttons

---

## 🌐 Deployment

Ready to share your editor?

### GitHub Pages
```bash
git add index.html README.md
git commit -m "Add WYSIWYG editor"
git push origin main
# Available at: https://username.github.io/index.html
```

### Cloudflare Pages
```bash
# Push to repo connected to Cloudflare
# Auto-deploys on push
# Available at: https://your-site.pages.dev
```

### Any Web Server
```bash
# Copy index.html to your server
scp index.html user@server:/var/www/html/
# Available at: https://yoursite.com/index.html
```

---

## 📞 Need Help?

- Check **README.md** for detailed documentation
- Review **FEATURES_TEST.md** for feature list
- Try exporting/importing JSON to debug state
- Use browser console (F12) for error messages

---

**Version**: 1.0.0  
**Status**: Production Ready ✅  
**Updated**: March 23, 2026
