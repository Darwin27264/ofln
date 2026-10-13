# Add search and filter bar to Personas Library screen

**Labels:** `good first issue`, `enhancement`, `ui`, `personas`  
**Difficulty:** Beginner  

---

### Description

In `src/screens/PersonasScreen.tsx`, users can browse starter personas and create their own custom AI personas. As a user creates or imports more personas, scrolling through a long list becomes cumbersome.

We want to add a clean, calm search bar at the top of the Personas Library screen that filters personas by title, tag, or keywords in their system prompt.

### Expected Behavior

- A search `TextInput` is positioned at the top of the list with placeholder `"Search personas..."` and a clear (`✕`) button when text is entered.
- Typing in the input immediately filters the displayed persona cards in real-time (case-insensitive match against `name`, `systemPrompt`, and `description` / `category`).
- If no results match, display a helpful empty state: `"No personas matching '{query}'"`.
- Keyboard should dismiss cleanly on drag.

### Design Guidelines

- Follow [`DESIGN.md`](../../DESIGN.md):
  - Monochrome-first styling: use `theme.surface` for search input background, `theme.text` for text, `theme.textTertiary` for placeholder.
  - No flashy colors; warm lava gold accent only if an active indicator is needed.
  - Respect both Dark and Light themes.

### Code Pointers

- Screen file: [`src/screens/PersonasScreen.tsx`](../../src/screens/PersonasScreen.tsx)
- Persona types: [`src/types/persona.ts`](../../src/types/persona.ts)
- Theme context: [`src/context/ThemeContext.tsx`](../../src/context/ThemeContext.tsx)

### Definition of Done

1. Search input renders at the top of PersonasScreen.
2. Filtering works instantly without UI lag.
3. Empty state is shown when query yields 0 results.
4. Light and Dark themes both look clean and legible.
5. Automated tests pass (`npm run typecheck`, `npm run lint:ci`, `npm test`).
