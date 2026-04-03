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
3. Paste this URL: `https://github.com/LukaTheHero/SillyTavern-PersonaTools`
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

<img width="200" height="200" alt="image" src="https://github.com/user-attachments/assets/4eeb9b57-8f9f-4c0a-898a-58ea9d6446a4" />
<img width="200" height="200" alt="image" src="https://github.com/user-attachments/assets/34a54b44-c054-4fe2-98da-be10779ed7f9" />
<img width="200" height="200" alt="image" src="https://github.com/user-attachments/assets/1025c3ea-873a-486e-b039-397d1965af49" />
<img width="200" height="200" alt="image" src="https://github.com/user-attachments/assets/584a7efb-01cb-4173-9775-05569a9554de" />
<img width="200" height="200" alt="image" src="https://github.com/user-attachments/assets/1dc89de2-f29f-4a8e-aed4-3d1c4c39c0ed" />
<img width="200" height="200" alt="image" src="https://github.com/user-attachments/assets/981d7b62-3897-44ae-b3b3-e3684ecbeaf6" />
<img width="200" height="200" alt="image" src="https://github.com/user-attachments/assets/84ae24dd-34ef-4210-940e-a3acb8c6d715" />
<img width="200" height="200" alt="image" src="https://github.com/user-attachments/assets/9c524790-19a9-4fcb-a7a9-6762cace47b2" />
