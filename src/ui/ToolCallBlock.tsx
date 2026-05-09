import * as React from "react";
const { useState, useMemo } = React;
import * as Collapsible from "@radix-ui/react-collapsible";
import { FileSystemAdapter } from "obsidian";
import type { MessageContent, ToolKind } from "../types/chat";
import type { AcpClient } from "../acp/acp-client";
import type AgentClientPlugin from "../plugin";
import { TerminalBlock } from "./TerminalBlock";
import { PermissionBanner } from "./PermissionBanner";
import { LucideIcon } from "./shared/IconButton";
import { toRelativePath } from "../utils/paths";
import { DiffRenderer } from "./tools/DiffRenderer";
import { ToolCallStatusPill } from "./tools/ToolCallStatusPill";

interface ToolCallBlockProps {
	content: Extract<MessageContent, { type: "tool_call" }>;
	plugin: AgentClientPlugin;
	terminalClient?: AcpClient;
	/** Callback to approve a permission request */
	onApprovePermission?: (
		requestId: string,
		optionId: string,
	) => Promise<void>;
}

const READ_ONLY_KINDS: ReadonlySet<ToolKind> = new Set([
	"read",
	"search",
	"fetch",
	"think",
]);

const KIND_TO_ICON: Record<string, string> = {
	read: "book-open",
	edit: "pencil",
	delete: "trash",
	move: "folder-open",
	search: "search",
	execute: "square-terminal",
	think: "message-circle-more",
	fetch: "globe",
	switch_mode: "arrow-left-right",
};

const KIND_TO_VERB: Record<string, string> = {
	read: "Read",
	edit: "Edit",
	delete: "Delete",
	move: "Move",
	search: "Search",
	execute: "Run",
	think: "Think",
	fetch: "Fetch",
	switch_mode: "Switch mode",
};

function getKindIconName(kind?: string): string {
	if (!kind) return "hammer";
	return KIND_TO_ICON[kind] ?? "hammer";
}

function getKindVerb(kind?: string): string | null {
	if (!kind) return null;
	return KIND_TO_VERB[kind] ?? null;
}

export const ToolCallBlock = React.memo(function ToolCallBlock({
	content,
	plugin,
	terminalClient,
	onApprovePermission,
}: ToolCallBlockProps) {
	const {
		kind,
		title,
		status,
		toolCallId,
		permissionRequest,
		locations,
		rawInput,
		content: toolContent,
	} = content;

	const [selectedOptionId, setSelectedOptionId] = useState<
		string | undefined
	>(permissionRequest?.selectedOptionId);
	const [rawOpen, setRawOpen] = useState(false);

	React.useEffect(() => {
		if (permissionRequest?.selectedOptionId !== selectedOptionId) {
			setSelectedOptionId(permissionRequest?.selectedOptionId);
		}
	}, [permissionRequest?.selectedOptionId]);

	const vaultPath = useMemo(() => {
		const adapter = plugin.app.vault.adapter;
		if (adapter instanceof FileSystemAdapter) {
			return adapter.getBasePath();
		}
		return "";
	}, [plugin]);

	const showEmojis = plugin.settings.displaySettings.showEmojis;
	const verb = getKindVerb(kind);
	const readOnly = !!kind && READ_ONLY_KINDS.has(kind);
	const hasRawInput = !!rawInput && Object.keys(rawInput).length > 0;
	const rawInputJson = useMemo(
		() => (hasRawInput ? JSON.stringify(rawInput, null, 2) : ""),
		[rawInput, hasRawInput],
	);

	const targetText = useMemo(() => {
		if (kind === "execute" && rawInput) {
			const cmd =
				typeof rawInput.command === "string" ? rawInput.command : "";
			const args = Array.isArray(rawInput.args)
				? ` ${(rawInput.args as string[]).join(" ")}`
				: "";
			return `${cmd}${args}`.trim() || null;
		}
		if (locations && locations.length === 1) {
			const loc = locations[0];
			return `${toRelativePath(loc.path, vaultPath)}${loc.line != null ? `:${loc.line}` : ""}`;
		}
		return null;
	}, [kind, rawInput, locations, vaultPath]);

	const extraLocations = useMemo(() => {
		if (!locations || locations.length <= 1) return null;
		// First location is shown in the header target slot when applicable;
		// any beyond that render below.
		return locations.slice(targetText ? 1 : 0);
	}, [locations, targetText]);

	return (
		<div
			className={`agent-client-tool-card agent-client-tool-card-${status} ${readOnly ? "agent-client-tool-card-readonly" : ""}`}
		>
			<div className="agent-client-tool-card-header">
				{showEmojis && (
					<LucideIcon
						name={getKindIconName(kind)}
						className="agent-client-tool-card-icon"
					/>
				)}
				{verb && (
					<span className="agent-client-tool-card-verb">{verb}</span>
				)}
				<span
					className="agent-client-tool-card-target"
					title={targetText ?? title ?? undefined}
				>
					{targetText ?? title ?? ""}
				</span>
				<ToolCallStatusPill status={status} readOnly={readOnly} />
				{hasRawInput && (
					<button
						type="button"
						className="agent-client-tool-card-disclosure"
						aria-expanded={rawOpen}
						aria-label={
							rawOpen ? "Hide raw input" : "Show raw input"
						}
						onClick={() => setRawOpen((v) => !v)}
					>
						<LucideIcon
							name={rawOpen ? "chevron-down" : "chevron-right"}
						/>
					</button>
				)}
			</div>

			{extraLocations && extraLocations.length > 0 && (
				<div className="agent-client-tool-card-locations">
					{extraLocations.map((loc, idx) => (
						<span
							key={idx}
							className="agent-client-tool-card-location"
						>
							{toRelativePath(loc.path, vaultPath)}
							{loc.line != null && `:${loc.line}`}
						</span>
					))}
				</div>
			)}

			{hasRawInput && (
				<Collapsible.Root open={rawOpen} onOpenChange={setRawOpen}>
					<Collapsible.Content className="agent-client-tool-card-raw">
						<pre>
							<code>{rawInputJson}</code>
						</pre>
					</Collapsible.Content>
				</Collapsible.Root>
			)}

			{toolContent &&
				toolContent.map((item, index) => {
					if (item.type === "terminal") {
						return (
							<TerminalBlock
								key={index}
								terminalId={item.terminalId}
								terminalClient={terminalClient || null}
								plugin={plugin}
							/>
						);
					}
					if (item.type === "diff") {
						return (
							<DiffRenderer
								key={index}
								diff={item}
								plugin={plugin}
								autoCollapse={
									plugin.settings.displaySettings
										.autoCollapseDiffs
								}
								collapseThreshold={
									plugin.settings.displaySettings
										.diffCollapseThreshold
								}
							/>
						);
					}
					return null;
				})}

			{permissionRequest && (
				<PermissionBanner
					permissionRequest={{
						...permissionRequest,
						selectedOptionId: selectedOptionId,
					}}
					toolCallId={toolCallId}
					plugin={plugin}
					onApprovePermission={onApprovePermission}
					onOptionSelected={setSelectedOptionId}
				/>
			)}
		</div>
	);
});
