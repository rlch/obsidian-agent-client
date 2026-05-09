import * as React from "react";
import type { ToolCallStatus } from "../../types/chat";
import { LucideIcon } from "../shared/IconButton";

interface ToolCallStatusPillProps {
	status: ToolCallStatus;
	/** "read" tool kinds get a muted pill instead of a status color. */
	readOnly?: boolean;
}

/**
 * Compact status badge using Obsidian theme tokens. Visual grammar copied
 * from Zed: yellow=pending, green=success, red=error, muted=read-only.
 */
export function ToolCallStatusPill({
	status,
	readOnly,
}: ToolCallStatusPillProps) {
	if (status === "completed") {
		return (
			<span className="agent-client-status-pill agent-client-status-pill-success">
				<LucideIcon name="check" />
			</span>
		);
	}
	if (status === "failed") {
		return (
			<span className="agent-client-status-pill agent-client-status-pill-error">
				<LucideIcon name="x" />
			</span>
		);
	}
	if (readOnly) {
		return (
			<span className="agent-client-status-pill agent-client-status-pill-muted">
				<LucideIcon name="loader" />
			</span>
		);
	}
	return (
		<span className="agent-client-status-pill agent-client-status-pill-pending">
			<LucideIcon name="loader" />
		</span>
	);
}
