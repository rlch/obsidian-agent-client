import * as React from "react";
const { useEffect, useImperativeHandle, useLayoutEffect, useRef, forwardRef } =
	React;
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { history, defaultKeymap, historyKeymap } from "@codemirror/commands";
import type AgentClientPlugin from "../../plugin";
import { buildComposerDecorations } from "./decorations";

export interface ComposerHandle {
	/** Live document text. Setter replaces the entire document. */
	value: string;
	selectionStart: number;
	selectionEnd: number;
	/** Pixel height of the rendered content. Used by auto-height logic. */
	readonly scrollHeight: number;
	focus(): void;
	/** Caret coordinates for popup anchoring (viewport-relative, CSS pixels). */
	caretCoords(): { left: number; top: number; bottom: number } | null;
	classList: DOMTokenList;
	style: CSSStyleDeclaration;
}

export interface ChatComposerProps {
	value: string;
	placeholder?: string;
	className?: string;
	spellCheck?: boolean;
	plugin: AgentClientPlugin;
	onChange: (value: string, cursor: number) => void;
	/** Synthetic-style keydown — receives a real KeyboardEvent. preventDefault works. */
	onKeyDown?: (e: KeyboardEvent) => void;
	onPaste?: (e: ClipboardEvent) => void;
	onDragOver?: (e: DragEvent) => void;
	onDrop?: (e: DragEvent) => void;
}

/**
 * CodeMirror 6-backed composer. Exposes a textarea-compatible imperative
 * handle so the surrounding InputArea logic (cursor math, focus, auto-
 * height, history navigation) keeps working with minimal changes.
 *
 * Pill widgets for `@[[note]]` mentions and syntax highlighting for
 * `/command` slash tokens come from the decorations ViewPlugin.
 */
export const ChatComposer = forwardRef<ComposerHandle, ChatComposerProps>(
	function ChatComposer(props, ref) {
		const {
			value,
			placeholder: placeholderText,
			className,
			spellCheck,
			plugin,
			onChange,
			onKeyDown,
			onPaste,
			onDragOver,
			onDrop,
		} = props;

		const wrapperRef = useRef<HTMLDivElement>(null);
		const viewRef = useRef<EditorView | null>(null);
		// Mirrors track latest callbacks so the EditorState extensions read
		// the freshest version without rebuilding the editor on every render.
		const onChangeRef = useRef(onChange);
		const onKeyDownRef = useRef(onKeyDown);
		onChangeRef.current = onChange;
		onKeyDownRef.current = onKeyDown;

		// Mount once. Extensions read mutable refs above for fresh callbacks.
		useLayoutEffect(() => {
			if (!wrapperRef.current) return;

			const extensions: Extension[] = [
				history(),
				keymap.of([...defaultKeymap, ...historyKeymap]),
				EditorView.lineWrapping,
				placeholder(placeholderText ?? ""),
				EditorView.contentAttributes.of({
					spellcheck: spellCheck ? "true" : "false",
					autocorrect: spellCheck ? "on" : "off",
				}),
				buildComposerDecorations(plugin),
				EditorView.updateListener.of((update) => {
					if (!update.docChanged && !update.selectionSet) return;
					const text = update.state.doc.toString();
					const cursor = update.state.selection.main.head;
					onChangeRef.current?.(text, cursor);
				}),
				EditorView.domEventHandlers({
					keydown: (event, _view) => {
						onKeyDownRef.current?.(event);
						return event.defaultPrevented;
					},
					paste: (event) => {
						if (onPaste) {
							onPaste(event);
							return event.defaultPrevented;
						}
						return false;
					},
					dragover: (event) => {
						onDragOver?.(event);
						return event.defaultPrevented;
					},
					drop: (event) => {
						onDrop?.(event);
						return event.defaultPrevented;
					},
				}),
			];

			const view = new EditorView({
				state: EditorState.create({
					doc: value,
					extensions,
				}),
				parent: wrapperRef.current,
			});
			viewRef.current = view;

			return () => {
				view.destroy();
				viewRef.current = null;
			};
			// eslint-disable-next-line react-hooks/exhaustive-deps
		}, [plugin]);

		// Reconcile external value into the editor when it changes.
		useEffect(() => {
			const view = viewRef.current;
			if (!view) return;
			const current = view.state.doc.toString();
			if (current === value) return;
			view.dispatch({
				changes: { from: 0, to: current.length, insert: value },
				selection: { anchor: value.length },
			});
		}, [value]);

		// Reconcile placeholder changes by replacing the editor's placeholder
		// extension would be a bigger lift; for now placeholderText is
		// captured at mount only (it's a constant for the chat composer).

		useImperativeHandle(
			ref,
			() => {
				const handle: ComposerHandle = {
					get value(): string {
						return viewRef.current?.state.doc.toString() ?? "";
					},
					set value(v: string) {
						const view = viewRef.current;
						if (!view) return;
						const current = view.state.doc.toString();
						if (current === v) return;
						view.dispatch({
							changes: { from: 0, to: current.length, insert: v },
							selection: { anchor: v.length },
						});
					},
					get selectionStart(): number {
						const view = viewRef.current;
						return view?.state.selection.main.from ?? 0;
					},
					set selectionStart(pos: number) {
						// All current callers set both selectionStart and
						// selectionEnd to the same value to place a caret —
						// there's no place that maintains a non-empty
						// selection by setting only one side. Treat both
						// setters as caret placement; if a future caller
						// needs anchor/head separation it can dispatch the
						// transaction directly via a new handle method.
						const view = viewRef.current;
						if (!view) return;
						const clamped = Math.max(
							0,
							Math.min(pos, view.state.doc.length),
						);
						view.dispatch({ selection: { anchor: clamped } });
					},
					get selectionEnd(): number {
						const view = viewRef.current;
						return view?.state.selection.main.to ?? 0;
					},
					set selectionEnd(pos: number) {
						const view = viewRef.current;
						if (!view) return;
						const clamped = Math.max(
							0,
							Math.min(pos, view.state.doc.length),
						);
						view.dispatch({ selection: { anchor: clamped } });
					},
					get scrollHeight(): number {
						// The auto-height routine in InputArea reads this
						// after toggling `height: auto` on the same element
						// (the wrapper, since classList/style flow there).
						// CM6's cm-scroller stretches to fit cm-content under
						// height:auto, so the wrapper's scrollHeight reflects
						// the natural content height the same way a textarea
						// does — that's what the caller wants here.
						return wrapperRef.current?.scrollHeight ?? 0;
					},
					focus() {
						viewRef.current?.focus();
					},
					caretCoords() {
						const view = viewRef.current;
						if (!view) return null;
						const head = view.state.selection.main.head;
						return view.coordsAtPos(head);
					},
					get classList() {
						return (
							wrapperRef.current?.classList ??
							document.createElement("div").classList
						);
					},
					get style() {
						return (
							wrapperRef.current?.style ??
							document.createElement("div").style
						);
					},
				};
				return handle;
			},
			[],
		);

		return (
			<div
				ref={wrapperRef}
				className={`agent-client-chat-input-composer ${className ?? ""}`}
			/>
		);
	},
);
