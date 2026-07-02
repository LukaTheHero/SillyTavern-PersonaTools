# PersonaTools

A SillyTavern extension for enhanced persona management: folders, tags and a quick persona switcher — in one extension that plays nicely with SillyTavern's own pagination, search and sorting.

## Features

### 🎭 Quick Persona Switcher
- Circular avatar button next to the chat input for fast persona switching
- Instant search box (appears when you have more than a handful of personas)
- Folders shown as expandable groups; the folder holding your current persona auto-expands
- Full keyboard support: type to search, ↑/↓ to move, Enter to select, Esc to close
- Current persona highlighted with a checkmark
- Styled hover tooltips with persona name and title

### 📁 Persona Folders
- Organize personas into folders with names and descriptions
- Folder cards at the top of the Persona Management panel, with stacked avatar previews and member counts
- Works *with* SillyTavern's pagination, search box, sorting and grid view — folder contents paginate natively, and searching always searches all personas
- Breadcrumb header inside a folder with back button and quick edit
- Rename folders (renaming onto an existing folder merges them), edit descriptions, add/remove personas
- Deleting is a two-click inline confirmation — no browser popups

### 🏷️ Persona Tags
- Create colored tags and assign them to personas
- Tag text automatically switches between dark and light for readability on any color
- Collapsible tag filter bar with usage counts and AND-filtering (shows personas matching *all* selected tags)
- Click a tag chip on any persona card to toggle that filter
- Explicit tag deletion (two-click confirm) — tags are never auto-deleted behind your back
- Random color generator with light/dark palette toggle

### ⚡ Fast
v2.0.0 is a ground-up rewrite. Instead of cloning and hiding SillyTavern's persona cards, PersonaTools now hooks into SillyTavern's own persona filter, so the native list stays native. No polling timers, no cache-busted avatar re-downloads, no retry ladders — everything reacts to SillyTavern's events and renders once.

## Installation

### Method 1: SillyTavern Extension Installer
1. Open SillyTavern
2. Go to Extensions > Install Extension
3. Paste this URL: `https://github.com/LukaTheHero/SillyTavern-PersonaTools`
4. Click Install

### Method 2: Manual Installation
1. Navigate to your SillyTavern extensions folder:
   - Third-party: `SillyTavern/public/scripts/extensions/third-party/`
   - Or user data: `SillyTavern/data/default-user/extensions/`
2. Clone or download this repository into that folder
3. Restart SillyTavern

Requires SillyTavern 1.18 or newer.

## Important: Disable Conflicting Extensions

If you have any of these extensions installed, **disable them** before using PersonaTools to avoid conflicts:

- **Quick Persona** (Extension-QuickPersona)
- **Personas** (SillyTavern-Personas)
- **Persona Tags** (PersonaTags)

PersonaTools replaces all three and will automatically migrate your existing folder groups and tags on first load.

## Data Migration

On first launch, PersonaTools automatically imports:
- **Folder groups** from the Personas (SillyTavern-Personas) extension
- **Tags and tag assignments** from the Persona Tags extension

Upgrading from PersonaTools 1.x keeps all your folders, tags and descriptions — the settings format is unchanged.

## Credits

PersonaTools is built upon the work of:
- [Extension-QuickPersona](https://github.com/SillyTavern/Extension-QuickPersona) by Cohee1207
- [SillyTavern-Personas](https://github.com/Furitaocanon/SillyTavern-Personas) by Desespoir
- [Persona Tags](https://github.com/Samueras/PersonaTags) by Samueras

## License

This project is licensed under the GNU General Public License v3.0 — see the [LICENSE](LICENSE) file for details.

## Author

**LukaTheHero** — [GitHub](https://github.com/LukaTheHero)

## Screenshots

Screenshots below are from v1.x — v2.0.0 keeps the same features with a refreshed look.

<img width="200" height="200" alt="image" src="https://github.com/user-attachments/assets/4eeb9b57-8f9f-4c0a-898a-58ea9d6446a4" />
<img width="200" height="200" alt="image" src="https://github.com/user-attachments/assets/34a54b44-c054-4fe2-98da-be10779ed7f9" />
<img width="200" height="200" alt="image" src="https://github.com/user-attachments/assets/b65150db-a7e2-4428-aace-2e6e8a2d3696" />
<img width="200" height="200" alt="image" src="https://github.com/user-attachments/assets/584a7efb-01cb-4173-9775-05569a9554de" />
<img width="200" height="200" alt="image" src="https://github.com/user-attachments/assets/1dc89de2-f29f-4a8e-aed4-3d1c4c39c0ed" />
<img width="200" height="200" alt="image" src="https://github.com/user-attachments/assets/981d7b62-3897-44ae-b3b3-e3684ecbeaf6" />
<img width="200" height="200" alt="image" src="https://github.com/user-attachments/assets/84ae24dd-34ef-4210-940e-a3acb8c6d715" />
<img width="200" height="200" alt="image" src="https://github.com/user-attachments/assets/9c524790-19a9-4fcb-a7a9-6762cace47b2" />
