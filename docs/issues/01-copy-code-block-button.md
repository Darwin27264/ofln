# Add one-tap "Copy Code" button to markdown code blocks in chat messages

**Labels:** `good first issue`, `enhancement`, `ui`  
**Difficulty:** Beginner  

---

### Description

Currently, when assistant responses contain code blocks (e.g. TypeScript, Python, or Shell snippets), users must long-press the entire message to copy all text, or manually highlight the block.

We would like to add a dedicated, subtle "Copy Code" button in the upper-right corner of fenced code blocks rendered in chat responses. When tapped, it should copy the code block contents to the system clipboard using `@react-native-clipboard/clipboard` and briefly show a checkmark or "Copied!" feedback state.

### Motivation & UX

- Much faster copying for developers without copying conversational intro/outro text.
- Follows the calm, monochrome design language from [`DESIGN.md`](../../DESIGN.md).

### Code Pointers

- Code rendering component: [`src/components/StreamingMessageText.tsx`](../../src/components/StreamingMessageText.tsx)
- Markdown display library configuration: Uses `react-native-markdown-display`. Look at how custom render rules are defined for `fence` or `code_block`.
- Clipboard helper: `@react-native-clipboard/clipboard` is already installed and imported in other components.
- Theme tokens: Import `useTheme` from [`src/context/ThemeContext.tsx`](../../src/context/ThemeContext.tsx) to ensure the copy button respects Dark and Light modes.

### Definition of Done

1. A copy icon/button appears on fenced code blocks in both streaming and finalized assistant messages.
2. Tapping the button copies only the text inside that code block to the system clipboard.
3. Visual feedback (e.g., icon changes to a checkmark for 1.5 seconds) is displayed.
4. Button styling respects light/dark themes and does not cause layout shifts during streaming.
5. All automated checks (`npm run typecheck`, `npm run lint:ci`, `npm test`) pass.
