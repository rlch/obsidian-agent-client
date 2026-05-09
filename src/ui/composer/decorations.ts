import {
	Decoration,
	type DecorationSet,
	EditorView,
	MatchDecorator,
	type PluginValue,
	ViewPlugin,
	type ViewUpdate,
	WidgetType,
} from "@codemirror/view";
import { setIcon } from "obsidian";
import type AgentClientPlugin from "../../plugin";

/**
 * Atomic widget that replaces `@[[name]]` with a styled pill chip.
 *
 * Click → opens the note via Obsidian's workspace.
 * The widget is contenteditable=false so backspace deletes the entire
 * range in one stroke (CM6 honours atomic ranges via the
 * EditorView.atomicRanges facet, which we register below).
 */
class MentionPillWidget extends WidgetType {
	constructor(
		private readonly noteName: string,
		private readonly plugin: AgentClientPlugin,
	) {
		super();
	}

	eq(other: MentionPillWidget): boolean {
		return other.noteName === this.noteName;
	}

	toDOM(): HTMLElement {
		const root = document.createElement("span");
		root.className = "cm-mention-pill";
		root.setAttribute("data-mention", this.noteName);
		root.setAttribute("contenteditable", "false");
		// Insert real (non-zero-width) inner content so the browser doesn't
		// collapse the widget on selection traversal.
		const icon = document.createElement("span");
		icon.className = "cm-mention-pill-icon";
		setIcon(icon, "file-text");
		const label = document.createElement("span");
		label.className = "cm-mention-pill-label";
		label.textContent = this.noteName;
		root.appendChild(icon);
		root.appendChild(label);

		root.addEventListener("click", (e) => {
			e.preventDefault();
			e.stopPropagation();
			void this.plugin.app.workspace.openLinkText(this.noteName, "");
		});

		return root;
	}

	ignoreEvent(): boolean {
		// Allow the click handler to fire and forward selection on touch.
		return false;
	}
}

/**
 * Match `@[[name]]` (note title, no path separators or `]`) and replace each
 * occurrence with a MentionPillWidget. The underlying document text is
 * unchanged — only the rendering is replaced — so existing serialization
 * (mention parsing, prompt building, history navigation) keeps working.
 */
function buildMentionDecorator(plugin: AgentClientPlugin): MatchDecorator {
	return new MatchDecorator({
		regexp: /@\[\[([^\]]+)\]\]/g,
		decoration: (match) =>
			Decoration.replace({
				widget: new MentionPillWidget(match[1], plugin),
				inclusive: false,
			}),
	});
}

/**
 * Slash command at the start of any line: `/command-name`. Rendered as a
 * syntax-token via Decoration.mark — the literal text stays visible (so
 * users see what they typed) but gets a distinct token style.
 */
const slashDecorator = new MatchDecorator({
	regexp: /(?<=^|\n)\/[\w-]+/g,
	decoration: () => Decoration.mark({ class: "cm-slash-token" }),
});

/**
 * ViewPlugin — recomputes both decoration sets on every viewport-affecting
 * change (typing, scrolling, doc replace).
 */
export function buildComposerDecorations(plugin: AgentClientPlugin) {
	const mentionDecorator = buildMentionDecorator(plugin);

	return ViewPlugin.fromClass(
		class implements PluginValue {
			mentions: DecorationSet;
			slashes: DecorationSet;

			constructor(view: EditorView) {
				this.mentions = mentionDecorator.createDeco(view);
				this.slashes = slashDecorator.createDeco(view);
			}

			update(update: ViewUpdate) {
				this.mentions = mentionDecorator.updateDeco(
					update,
					this.mentions,
				);
				this.slashes = slashDecorator.updateDeco(
					update,
					this.slashes,
				);
			}
		},
		{
			provide: (plugin) => [
				EditorView.decorations.of(
					(view) => view.plugin(plugin)?.mentions ?? Decoration.none,
				),
				EditorView.decorations.of(
					(view) => view.plugin(plugin)?.slashes ?? Decoration.none,
				),
				// Mark the mention pills as atomic so cursor traversal +
				// backspace treat them as a single unit (Cursor-style).
				EditorView.atomicRanges.of(
					(view) => view.plugin(plugin)?.mentions ?? Decoration.none,
				),
			],
		},
	);
}
