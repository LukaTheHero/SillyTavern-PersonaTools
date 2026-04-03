# PersonaTools

A combined SillyTavern extension for enhanced persona management. Merges the functionality of QuickPersona, Persona Group Manager, and Persona Tags into one unified extension with additional features.

## Features

### 🎭 Quick Persona Switcher
- Circular avatar button near the chat input for fast persona switching
- Clean vertical list popup showing all personas with names and titles
- Folder groups displayed first with folder icons, ungrouped personas below
- Currently selected persona highlighted with a checkmark
- Click a folder to expand and see personas inside

### 📁 Persona Folders
- Organize personas into folders/groups
- Folder view in the Persona Management panel with compact folder cards
- Custom folder names and descriptions
- Manage folders from each persona card (folder button) or from the folder card itself
- Rename folders, edit descriptions, add/remove personas
- Fancy folder names with glow effect

### 🏷️ Persona Tags
- Create colored tags and assign them to personas
- Tag filter bar in the Persona Management panel
- Filter by multiple tags simultaneously (AND logic — shows personas matching ALL selected tags)
- Tag filtering bypasses folders — shows all matching personas directly
- Clear Filters button to reset all tag filters
- Manage tags per persona via a popover (tag button on each persona card)
- Custom tag colors with light/dark color mode toggle

### 💬 Styled Tooltips
- Hover over persona avatars in the quick switcher to see a styled tooltip
- Shows persona name (bold) and persona title (subtitle) — no more raw filenames

## Installation

### Method 1: SillyTavern Extension Installer
1. Open SillyTavern
2. Go to Extensions > Install Extension
3. Paste this URL: `https://github.com/LukaTheHero/PersonaTools`
4. Click Install

### Method 2: Manual Installation
1. Navigate to your SillyTavern extensions folder:
   - Third-party: `SillyTavern/public/scripts/extensions/third-party/`
   - Or user data: `SillyTavern/data/default-user/extensions/`
2. Clone or download this repository into that folder
3. Restart SillyTavern

## Important: Disable Conflicting Extensions

If you have any of these extensions installed, **disable them** before using PersonaTools to avoid conflicts:

- **Quick Persona** (Extension-QuickPersona)
- **Personas** (SillyTavern-Personas)
- **Persona Tags** (PersonaTags)

PersonaTools replaces all three and will automatically migrate your existing folder groups and tags on first load.

## Data Migration

On first launch, PersonaTools will automatically import:
- **Folder groups** from the Personas (SillyTavern-Personas) extension
- **Tags and tag assignments** from the Persona Tags extension

No manual migration needed!

## License

This project is licensed under the GNU General Public License v3.0 — see the [LICENSE] file for details.

## Author

**LukaTheHero** — [GitHub](https://github.com/LukaTheHero)
