import * as React from "react";
const { useRef, useEffect, useState } = React;
import { Terminal, type ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import type { AcpClient } from "../acp/acp-client";
import type AgentClientPlugin from "../plugin";

interface TerminalBlockProps {
	terminalId: string;
	terminalClient: AcpClient | null;
	plugin: AgentClientPlugin;
}

const SCROLLBACK_LINES = 5000;

/**
 * Read xterm theme tokens from Obsidian CSS variables on document.body.
 * Falls back to a neutral palette when a var is unset by the active theme.
 */
function readThemeFromObsidian(): ITheme {
	const cs = getComputedStyle(document.body);
	const v = (name: string, fallback: string): string => {
		const raw = cs.getPropertyValue(name).trim();
		return raw || fallback;
	};

	return {
		background: v("--background-secondary", "#1e1e1e"),
		foreground: v("--text-normal", "#cccccc"),
		cursor: v("--text-accent", "#cccccc"),
		cursorAccent: v("--background-secondary", "#1e1e1e"),
		selectionBackground: v("--text-selection", "#264f78"),
		black: "#000000",
		red: v("--color-red", "#cd3131"),
		green: v("--color-green", "#0dbc79"),
		yellow: v("--color-yellow", "#e5e510"),
		blue: v("--color-blue", "#2472c8"),
		magenta: v("--color-purple", "#bc3fbc"),
		cyan: v("--color-cyan", "#11a8cd"),
		white: v("--text-normal", "#e5e5e5"),
		brightBlack: v("--text-muted", "#666666"),
		brightRed: v("--color-red", "#f14c4c"),
		brightGreen: v("--color-green", "#23d18b"),
		brightYellow: v("--color-yellow", "#f5f543"),
		brightBlue: v("--color-blue", "#3b8eea"),
		brightMagenta: v("--color-purple", "#d670d6"),
		brightCyan: v("--color-cyan", "#29b8db"),
		brightWhite: v("--text-normal", "#e5e5e5"),
	};
}

export const TerminalBlock = React.memo(function TerminalBlock({
	terminalId,
	terminalClient,
	plugin,
}: TerminalBlockProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const termRef = useRef<Terminal | null>(null);
	const fitRef = useRef<FitAddon | null>(null);

	const [exitStatus, setExitStatus] = useState<{
		exitCode: number | null;
		signal: string | null;
	} | null>(null);

	useEffect(() => {
		if (!terminalId || !terminalClient || !containerRef.current) return;

		const term = new Terminal({
			scrollback: SCROLLBACK_LINES,
			cursorBlink: false,
			cursorStyle: "block",
			disableStdin: true,
			convertEol: true,
			fontFamily: "var(--font-monospace)",
			fontSize: 12,
			theme: readThemeFromObsidian(),
			allowTransparency: true,
		});
		const fit = new FitAddon();
		const links = new WebLinksAddon();
		term.loadAddon(fit);
		term.loadAddon(links);
		term.open(containerRef.current);
		termRef.current = term;
		fitRef.current = fit;

		try {
			fit.fit();
		} catch {
			// container may not be mounted yet; ResizeObserver will retry
		}

		// Re-fit on container resize.
		const resizeObserver = new ResizeObserver(() => {
			try {
				fit.fit();
			} catch {
				// ignored
			}
		});
		resizeObserver.observe(containerRef.current);

		// Re-apply theme when Obsidian's css-change event fires
		// (covers theme switches and snippet edits).
		const onCssChange = () => {
			term.options.theme = readThemeFromObsidian();
		};
		plugin.app.workspace.on("css-change", onCssChange);

		const unsubscribe = terminalClient.subscribeTerminal(terminalId, {
			onChunk: (data) => {
				term.write(data);
			},
			onExit: (status) => {
				setExitStatus(status);
			},
		});

		return () => {
			unsubscribe();
			plugin.app.workspace.off("css-change", onCssChange);
			resizeObserver.disconnect();
			term.dispose();
			termRef.current = null;
			fitRef.current = null;
		};
	}, [terminalId, terminalClient, plugin]);

	return (
		<div className="agent-client-terminal-renderer">
			<div
				ref={containerRef}
				className="agent-client-terminal-renderer-xterm"
			/>
			{exitStatus && (
				<div
					className={`agent-client-terminal-renderer-exit ${exitStatus.exitCode === 0 ? "agent-client-success" : "agent-client-error"}`}
				>
					Exit Code: {exitStatus.exitCode}
					{exitStatus.signal && ` | Signal: ${exitStatus.signal}`}
				</div>
			)}
		</div>
	);
});
