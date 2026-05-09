import * as React from "react";
const { useEffect, useMemo, useRef } = React;
import type AgentClientPlugin from "../plugin";
import { getLogger } from "../utils/logger";
import type { PermissionOption } from "../types/chat";
import { LucideIcon } from "./shared/IconButton";

interface PermissionBannerProps {
	permissionRequest: {
		requestId: string;
		options: PermissionOption[];
		selectedOptionId?: string;
		isCancelled?: boolean;
		isActive?: boolean;
	};
	toolCallId: string;
	plugin: AgentClientPlugin;
	/** Callback to approve a permission request */
	onApprovePermission?: (
		requestId: string,
		optionId: string,
	) => Promise<void>;
	onOptionSelected?: (optionId: string) => void;
}

// Order represents "least destructive first" for default-focus selection.
const KIND_PRIORITY: Record<PermissionOption["kind"], number> = {
	allow_once: 0,
	allow_always: 1,
	reject_once: 2,
	reject_always: 3,
};

const KIND_VERB: Record<PermissionOption["kind"], string> = {
	allow_once: "Allowed once",
	allow_always: "Allowed always",
	reject_once: "Rejected",
	reject_always: "Rejected always",
};

/**
 * Permission card. Renders option buttons coloured per ACP option.kind,
 * defaults focus to the least destructive option, and after selection
 * displays the chosen option as a subdued chip until the next agent turn.
 */
export function PermissionBanner({
	permissionRequest,
	plugin: _plugin,
	onApprovePermission,
	onOptionSelected,
}: PermissionBannerProps) {
	const logger = getLogger();
	const isCancelled = permissionRequest.isCancelled === true;
	const isActive = permissionRequest.isActive !== false;
	const selectedOption = permissionRequest.selectedOptionId
		? permissionRequest.options.find(
				(o) => o.optionId === permissionRequest.selectedOptionId,
			)
		: undefined;

	const defaultIndex = useMemo(() => {
		if (!permissionRequest.options.length) return 0;
		let bestIdx = 0;
		let bestPri = Number.POSITIVE_INFINITY;
		permissionRequest.options.forEach((o, i) => {
			const p = KIND_PRIORITY[o.kind] ?? Number.POSITIVE_INFINITY;
			if (p < bestPri) {
				bestPri = p;
				bestIdx = i;
			}
		});
		return bestIdx;
	}, [permissionRequest.options]);

	const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

	// Auto-focus the least destructive option when the card first appears.
	useEffect(() => {
		if (selectedOption || !isActive || isCancelled) return;
		buttonRefs.current[defaultIndex]?.focus();
	}, [defaultIndex, isActive, isCancelled, selectedOption]);

	if (isCancelled) {
		return (
			<div className="agent-client-permission-card agent-client-permission-cancelled">
				<LucideIcon name="x" />
				<span>Cancelled</span>
			</div>
		);
	}

	if (selectedOption) {
		return (
			<div
				className={`agent-client-permission-card agent-client-permission-chosen agent-client-permission-chosen-${selectedOption.kind}`}
			>
				<LucideIcon
					name={
						selectedOption.kind.startsWith("allow")
							? "check"
							: "x"
					}
				/>
				<span>{KIND_VERB[selectedOption.kind]}</span>
			</div>
		);
	}

	if (!isActive) return null;

	return (
		<div className="agent-client-permission-card agent-client-permission-active">
			<div className="agent-client-permission-card-label">
				Approval requested
			</div>
			<div className="agent-client-permission-card-options">
				{permissionRequest.options.map((option, idx) => (
					<button
						key={option.optionId}
						ref={(el) => {
							buttonRefs.current[idx] = el;
						}}
						type="button"
						className={`agent-client-permission-option agent-client-permission-kind-${option.kind}`}
						onClick={() => {
							onOptionSelected?.(option.optionId);
							if (onApprovePermission) {
								void onApprovePermission(
									permissionRequest.requestId,
									option.optionId,
								);
							} else {
								logger.warn(
									"Cannot handle permission response: missing onApprovePermission callback",
								);
							}
						}}
					>
						{option.name}
					</button>
				))}
			</div>
		</div>
	);
}
