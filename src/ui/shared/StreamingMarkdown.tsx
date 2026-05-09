import * as React from "react";
import Markdown from "markdown-to-jsx";

interface StreamingMarkdownProps {
	text: string;
}

/**
 * Streaming-safe markdown renderer for in-flight assistant messages.
 *
 * Used while a message is still arriving token-by-token. Once the message
 * is finalized, callers should swap to Obsidian's MarkdownRenderer (which
 * gives wikilinks / callouts / mermaid / dataview parity with notes) — see
 * MarkdownRenderer.tsx.
 *
 * markdown-to-jsx parses and reconciles via React, so a partial stream is
 * a no-cost diff on subsequent ticks (vs MarkdownRenderer.render which
 * re-renders the entire DOM via el.empty() on each delta).
 */
export const StreamingMarkdown = React.memo(function StreamingMarkdown({
	text,
}: StreamingMarkdownProps) {
	return (
		<div className="agent-client-markdown-text-renderer agent-client-streaming-markdown markdown-rendered">
			<Markdown
				options={{
					forceBlock: true,
					disableParsingRawHTML: true,
				}}
			>
				{text}
			</Markdown>
		</div>
	);
});
