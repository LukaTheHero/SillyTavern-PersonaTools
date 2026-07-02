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

<img width="1914" height="1155" alt="image" src="https://github.com/user-attachments/assets/f810154b-80c9-45a3-b8c5-dc660e607183" />
<img width="880" height="872" alt="image" src="https://github.com/user-attachments/assets/e955e42d-dfe4-4a17-b21c-7416cb1c03fe" />
<img width="600" height="548" alt="image" src="https://github.com/user-attachments/assets/bc6b7d93-d3bf-4aee-9002-3fe7059e907b" />
<img width="535" height="715" alt="image" src="https://github.com/user-attachments/assets/f73aa3de-0b92-4d1e-8836-611201ec7131" />
<img width="587" height="413" alt="image" src="https://github.com/user-attachments/assets/1a9bc051-70c8-4b8e-be09-e5667a4073fa" />

