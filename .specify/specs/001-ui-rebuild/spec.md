# Feature Specification: UI rebuild — terminal, streaming, tool cards, input

**Feature Branch**: `001-ui-rebuild`
**Created**: 2026-05-09
**Status**: Draft
**Input**: User description: "Fork obsidian-agent-client; the existing UI is poor; rebuild the terminal block (no xterm), the streaming markdown path (full DOM rebuild per token), the tool-call cards (debug-looking grey boxes), the permission UI (bare button row), and the input (plain textarea, no inline mention pills). Use vetted libraries where they earn their bundle weight; otherwise roll our own copying patterns from Continue.dev / Cline / Roo-Code / Zed. No Tailwind. Theme via Obsidian CSS vars."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Real terminal output for execute tools (Priority: P1)

When the agent runs a shell command, the operator sees authentic terminal output: ANSI colours, cursor handling, line wrapping, copyable text, scrollback. Live updates arrive event-driven, not via 100 ms polling.

**Why this priority**: Execute tools are the most information-dense part of an agent session. Today's `<div>{output}</div>` flattens colours, mangles progress bars (e.g. `npm install`, test runners), and burns CPU polling. This is the single biggest gap vs Zed/Cursor.

**Independent Test**: Run `ls --color=always`, `npm test`, and `vitest --reporter=verbose` from a chat session. Verify ANSI colours render, progress bars don't smear, exit code badge respects theme tokens, and the polling interval (visible in DevTools Network/Performance) drops to zero.

**Acceptance Scenarios**:

1. **Given** an active session, **When** the agent issues an `execute` tool with a command that emits ANSI colour codes, **Then** the terminal block renders coloured output matching the user's Obsidian theme.
2. **Given** a long-running command, **When** new output arrives via ACP, **Then** the terminal block updates within one animation frame, without a polling timer.
3. **Given** a command that emits a progress bar (`\r`-rewriting line), **When** the bar updates, **Then** it overwrites in place rather than appending lines.
4. **Given** terminal output, **When** the operator selects text, **Then** they can copy it verbatim including escape-aware whitespace.

---

### User Story 2 — Streaming responses without DOM thrash (Priority: P1)

Assistant messages render token-by-token without re-parsing the full markdown body on each delta. Long replies (>2000 tokens) remain interactive. Once a message finishes streaming, it swaps to Obsidian's native renderer so callouts, wikilinks, mermaid, dataview, and code highlighting come through.

**Why this priority**: The current `MarkdownRenderer` calls `el.empty()` and re-renders the entire DOM on every text update (`useEffect([text])` + `MarkdownRenderer.render`). On a 5000-token stream that's thousands of full re-parses; the chat becomes laggy and battery-hungry.

**Independent Test**: Stream a 5000-token reply containing nested code blocks, lists, and tables. Verify no main-thread frames longer than 50 ms during streaming (Performance recording). After completion, verify the message displays mermaid/wikilinks/callouts identical to a finalized note.

**Acceptance Scenarios**:

1. **Given** a streaming assistant reply, **When** new tokens arrive at 30+ tokens/sec, **Then** the chat remains scrollable without jank.
2. **Given** a streaming reply containing an unclosed code fence, **When** the next chunk closes it, **Then** the renderer transitions cleanly without a flash of unstyled content.
3. **Given** a finalized assistant message, **When** it contains `[[wikilinks]]`, callouts, or mermaid blocks, **Then** they render the same as in any Obsidian note.
4. **Given** a finalized assistant message, **When** the operator clicks a wikilink, **Then** the linked note opens (existing behaviour preserved).

---

### User Story 3 — Tool-call cards that read like Zed/Cursor (Priority: P2)

Each tool call renders as a structured card: kind icon, bold verb, monospace target, status pill, expandable raw-input body, and (when applicable) a content body (diff / terminal / image). Per-tool renderers handle the common kinds (`edit`, `read`, `execute`, `search`, `delete`, `move`, `fetch`, `think`). Visuals respect Obsidian theme tokens — no hardcoded RGB.

**Why this priority**: Tool calls are dense and frequent. The current 8 px grey-bordered box with 0.85 em text reads as a debug log. Continue.dev's component split is <300 LOC and a known good shape; lifting it eliminates the per-tool conditionals currently smeared across `ToolCallBlock.tsx`.

**Independent Test**: Trigger one of each tool kind in a session. Verify each renders with the correct icon, action verb, target path, and a status pill that uses semantic theme tokens (`--color-yellow` pending, `--color-green` success, `--text-error` error, `--text-muted` read-only). Open the raw-args body via keyboard (`Enter`/`Space` on the chevron).

**Acceptance Scenarios**:

1. **Given** an `edit` tool call, **When** rendered, **Then** the card shows pencil icon, "Edit" verb, monospace path, and a diff body using theme-var-driven red/green.
2. **Given** an `execute` tool call, **When** rendered, **Then** the card shows terminal icon, "Run" verb, monospace command, and a terminal body (User Story 1).
3. **Given** any tool card, **When** the operator focuses the disclosure chevron and presses `Enter`, **Then** the raw-input body expands (Radix Collapsible semantics).
4. **Given** multiple consecutive tool calls of the same kind, **When** rendered, **Then** they may collapse into a grouped card with an expand-all action (Continue.dev's `GroupedToolCallHeader` pattern).

---

### User Story 4 — Permission requests with clear hierarchy (Priority: P2)

When an agent requests permission, the operator sees a card (not a row of bare buttons) with the tool's identity, an expandable raw-input preview, and semantically coloured option buttons (`allow-once`, `allow-always`, `reject-once`, `reject-always`). Keyboard navigable; default-focused option matches ACP `kind` semantics.

**Why this priority**: Permission decisions are consequential. The current bare `<button>` row reads as a debug UI and provides no inspection of what the agent is about to do. Cline/Roo-Code's `ToolUseBlock` primitive plus Zed's button colour grammar address this in ~150 LOC.

**Independent Test**: Trigger a permission-requiring tool. Verify the card shows the tool kind, an expand-able args preview, and two-to-four buttons with semantic colours. Tab through options; verify focus order. Press `Enter` on the default option; verify approval fires.

**Acceptance Scenarios**:

1. **Given** a permission request with allow/reject options, **When** rendered, **Then** allow buttons use `--color-green` / `--text-success`, reject uses `--text-error`, and "always" variants get a stronger tone than "once" variants.
2. **Given** a focused option, **When** the operator presses `Enter`, **Then** that option is selected and the card transitions to the chosen-option state.
3. **Given** a card in chosen-option state, **When** the agent has not yet responded, **Then** a subdued indicator shows the choice was sent.
4. **Given** an expandable raw-args body, **When** the operator opens it, **Then** the JSON preview scrolls within a max-height container without breaking the card layout.

---

### User Story 5 — Input with inline mention pills and slash highlighting (Priority: P2)

The composer is a CodeMirror 6 editor that renders `@[[note]]` mentions as styled pills, highlights `/slash-commands`, supports soft-wrap with hanging indent, and preserves the existing message-history navigation (`ArrowUp` / `ArrowDown` from blank input) and suggestion popup.

**Why this priority**: The current `<textarea>` provides no inline preview of what's being attached or invoked. Mentions are invisible until sent; long messages with multiple mentions become unreadable. CodeMirror 6 is already a transitive dep through Obsidian itself — zero net bundle cost.

**Independent Test**: Type `Look at @[[plan]] and run /export`. Verify the mention renders as a pill (with a click-to-open affordance) and the slash command renders in a distinct token style. `ArrowUp` from a blank input restores the previous message exactly as before.

**Acceptance Scenarios**:

1. **Given** an empty composer, **When** the operator types `@`, **Then** the suggestion popup appears at caret position (existing behaviour preserved).
2. **Given** a composer with `@[[Plan]]` text, **When** rendered, **Then** the mention is shown as a pill with the note basename and a vault-link affordance.
3. **Given** a composer with `/export` text, **When** rendered, **Then** the slash and command name are highlighted in a distinct token style.
4. **Given** a blank composer, **When** the operator presses `ArrowUp`, **Then** the most recent user message is restored at the caret.
5. **Given** a composer with text, **When** the operator presses `Enter` (without `Shift`), **Then** the message sends; with `Shift`, a newline is inserted.

---

### User Story 6 — Theme-aware visual polish (Priority: P3)

Diff colours, status pills, and badge backgrounds derive from Obsidian theme variables (`--color-green-rgb`, `--color-red-rgb`, `--text-error`, `--text-success`) so they stay legible under Catppuccin, Things, Minimal, and other community themes. The empty state surfaces useful affordances (slash-command hints, recent sessions). The streaming indicator is conventional (3 dots) rather than 9.

**Why this priority**: Cosmetic. Important for polish but doesn't affect functional capability.

**Independent Test**: Switch Obsidian theme to Catppuccin and to Minimal-Dark. Verify diff red/green legibility in both. Open an empty session; verify the empty state shows actionable content. Send a message; verify the loading indicator shows three pulsing dots.

**Acceptance Scenarios**:

1. **Given** a Catppuccin theme, **When** a diff renders, **Then** added/removed line backgrounds use the theme's red/green at appropriate opacity (no hardcoded `rgba(46, 160, 67, ...)`).
2. **Given** an empty session, **When** rendered, **Then** the empty state shows the agent name, `/help`, and the most recent session for resume.
3. **Given** a streaming reply, **When** displayed, **Then** the loading indicator is three dots, not nine.

---

### Edge Cases

- **Streaming in tight loop**: assistant emits 100+ tokens/sec for >30 s. Streaming renderer must keep up; tier swap must not introduce a visual flicker on completion.
- **Terminal with binary garbage**: a command emits non-UTF-8 bytes (`cat /bin/ls`). xterm must not crash; output should be visibly garbled but contained.
- **Terminal resize**: the chat pane width changes mid-command. xterm `FitAddon` must reflow without dropping output.
- **Tool call with no `rawInput`**: card must render header + body without an empty expand affordance.
- **Permission request cancelled by agent**: the card transitions to a cancelled state without the operator's input.
- **Mentioned note deleted**: pill renders as a "missing" variant; click does nothing or surfaces a toast.
- **Composer paste of multi-line markdown**: pasted content remains a single document (no line-by-line submission).
- **`@codemirror/state` or `@codemirror/view` major version mismatch with Obsidian's bundled CM6**: detected at build time; we vendor only the versions Obsidian ships.

## Requirements *(mandatory)*

### Functional Requirements

#### Terminal (US 1)

- **FR-001**: `TerminalBlock` MUST render output via `@xterm/xterm` v6 with `@xterm/addon-fit` and `@xterm/addon-web-links`.
- **FR-002**: `TerminalBlock` MUST receive new output via the existing ACP `onSessionUpdate` event channel; the 100 ms `setInterval` polling loop MUST be removed.
- **FR-003**: `TerminalBlock` MUST set xterm theme tokens from Obsidian CSS vars at mount and re-apply on `app.workspace.on('css-change')`.
- **FR-004**: `TerminalBlock` MUST disable xterm cursor blinking and dim the cursor when the block is not the active pane focus.
- **FR-005**: `TerminalBlock` MUST cap retained scrollback at 5000 lines.

#### Streaming markdown (US 2)

- **FR-010**: A new `StreamingMarkdown` component MUST render in-flight assistant text incrementally, without rebuilding the full DOM per delta.
- **FR-011**: Once `message.streaming === false` (or equivalent terminal state), the component MUST swap to Obsidian's `MarkdownRenderer.render` for parity with note rendering.
- **FR-012**: The streaming renderer MUST handle unterminated code fences and inline tokens without flashing unstyled content.
- **FR-013**: Wikilink, embed, callout, mermaid, dataview, and KaTeX rendering MUST be preserved on finalized messages (delegated to Obsidian's renderer).
- **FR-014**: The chosen streaming library is `streamdown`; if its bundle cost exceeds 30 KB gzip, fall back to `markdown-to-jsx` with the streaming-safe options enabled.

#### Tool cards (US 3)

- **FR-020**: `ToolCallBlock` MUST split into a dispatcher (`ToolCallDiv/index.tsx`), card chrome (`ToolCallDisplay.tsx`), simple/collapsed variant (`SimpleToolCallUI.tsx`), and per-kind renderers (`tools/Edit.tsx`, `tools/Execute.tsx`, `tools/Read.tsx`, …).
- **FR-021**: The card header MUST include: kind icon (Lucide), action verb, monospace target (path / command), status pill, and disclosure chevron.
- **FR-022**: Status pill colour MUST derive from theme vars: `--color-yellow` pending, `--color-green` success, `--text-error` error, `--text-muted` read-only.
- **FR-023**: Raw-input expand body MUST use `@radix-ui/react-collapsible` for keyboard accessibility and animation.
- **FR-024**: Tool kinds without a dedicated renderer MUST fall through to a generic renderer that displays raw input as a JSON code block.
- **FR-025**: Adjacent tool calls of the same kind MAY group into a single card with `GroupedToolCallHeader` (e.g. "Read 3 files"); ungrouped is the default.

#### Permission card (US 4)

- **FR-030**: `PermissionBanner` MUST be replaced by a `ConfirmRow` card that includes the tool kind, summary, expandable raw-args, and option buttons.
- **FR-031**: Option buttons MUST be coloured per ACP `option.kind`: `allow-once` / `allow-always` use success tokens; `reject-once` / `reject-always` use error tokens; `allow-always` and `reject-always` use a stronger tone than the once variants.
- **FR-032**: The default-focused button MUST be the option whose `kind` is least destructive (preferring `allow-once` over `allow-always`, `reject-once` over `reject-always`).
- **FR-033**: Selecting an option MUST call `onApprovePermission(requestId, optionId)` (existing contract preserved).
- **FR-034**: After selection, the card MUST display the chosen option until the agent's next message arrives.

#### Composer (US 5)

- **FR-040**: `InputArea` MUST be backed by a CodeMirror 6 `EditorView` instead of `<textarea>`.
- **FR-041**: The CM6 instance MUST use `EditorState` decorations to render `@[[note]]` as a pill widget linked to the note via `app.workspace.openLinkText`.
- **FR-042**: A second decoration MUST render `/slash-command` tokens with a distinct class.
- **FR-043**: The existing input-history navigation (`useInputHistory` hook) MUST be ported to CM6 keymap so `ArrowUp`/`ArrowDown` from a blank document restore previous user messages.
- **FR-044**: The existing suggestion popup (`SuggestionPopup`) MUST anchor to the caret position via CM6's `EditorView.coordsAtPos`.
- **FR-045**: `Enter` MUST submit (existing); `Shift+Enter` MUST insert a newline; `Cmd/Ctrl+Enter` SHOULD also submit (alias).
- **FR-046**: Composer MUST use the CodeMirror version Obsidian itself bundles (resolved via `peerDependencies` if possible); we MUST NOT bundle a duplicate CM6.

#### Polish (US 6)

- **FR-050**: All hardcoded `rgba(46, 160, 67, *)` / `rgba(248, 81, 73, *)` in `styles.css` MUST be replaced with `rgba(var(--color-green-rgb), *)` / `rgba(var(--color-red-rgb), *)`.
- **FR-051**: The streaming loading indicator MUST display three dots, not nine.
- **FR-052**: The empty-session state MUST surface: agent label, "/help" hint, and a "resume last session" button when one exists.
- **FR-053**: `MessageBubble` MUST gain three message actions on hover: copy (existing), regenerate (re-runs the prior user message), and edit-resubmit (loads the message back into the composer).

#### Non-functional

- **FR-060**: No new Tailwind dependency MAY be added.
- **FR-061**: All new colour, spacing, and font tokens MUST resolve from Obsidian CSS vars; no hardcoded hex/rgb values for theme-sensitive properties.
- **FR-062**: The plugin MUST continue to build with the existing `npm run build` (`tsc --noEmit -skipLibCheck && esbuild production`).
- **FR-063**: Bundle `main.js` size MUST not exceed 1.5× its current size after all changes ship.
- **FR-064**: No `eval` / `new Function` introduced (Obsidian community-plugin guideline).
- **FR-065**: No `dangerouslySetInnerHTML` introduced; all rendered HTML MUST come from React components or Obsidian's sanitised renderer.

### Key Entities

- **Message** — already typed in `src/types/chat.ts`. No schema change; we add a `streaming?: boolean` discriminator if not already present (to drive the renderer tier swap).
- **ToolCall** — already typed; per-kind renderer dispatch keys on `kind`.
- **PermissionOption** — already typed; option buttons consume `kind` for colour/strength.
- **TerminalSession** — handled by `terminal-handler.ts`; the new xterm-backed component subscribes through the same handler.
- **ComposerDocument** — new entity backing the CM6 state; mirrors today's `inputValue` string but with attached decorations.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A 5000-token assistant reply streams to completion with no main-thread frame longer than 50 ms (Chrome Performance recording on an M5 Max). Today's baseline regularly exceeds 200 ms.
- **SC-002**: A `npm install` run inside an `execute` tool renders progress bars in place; comparing to the same command in a real terminal, no visible smear or duplication of progress lines.
- **SC-003**: With Catppuccin Mocha active, every diff line, status pill, button, and badge passes WCAG AA contrast against its container background, verified with DevTools Accessibility checks.
- **SC-004**: `main.js` bundle is ≤ 1.5× its current size at end of work order.
- **SC-005**: All existing user-facing flows (send/restart/export/history/floating-window) continue to function without regression on a smoke checklist run from `docs/quickstart.md` or equivalent.
- **SC-006**: The composer renders mention pills inline within 100 ms of typing the closing `]]`, measured by a manual paste-and-watch test.
- **SC-007**: A permission card requires no more than 1 keypress (`Enter`) to approve the default option after focus arrives.

## Assumptions

- Hermes Agent (the user's primary backend) speaks ACP via its `acp_adapter/` server. If integration surfaces gaps, those are filed as a separate spec; this spec is upstream-of-Hermes and applies to any ACP-speaking agent.
- The user runs Obsidian on macOS (arm64) for all manual verification; Windows/WSL paths are untouched but not regression-tested in this spec.
- The fork remains downstream-compatible with `RAIT-09/obsidian-agent-client`'s ACP wire shape; if upstream changes the `SessionUpdate` discriminated-union, we rebase and adapt.
- The user does NOT want to upstream this rebuild as a single PR — it's a personal fork. Some changes (xterm, polish) might be PR-able in isolation; the input rewrite likely is not.
- Streamdown's bundle cost is acceptable; if it isn't, `markdown-to-jsx` is the fallback.
- `@radix-ui/react-collapsible` is the only Radix primitive we add. If more are needed (Popover, Dialog), they're added one at a time and recorded as a spec amendment.
- Obsidian's bundled CM6 version is exposed at runtime via `EditorView` from the Obsidian module; we use that surface and do not vendor a separate CM6 build.
