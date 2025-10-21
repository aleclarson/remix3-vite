/// <reference lib="dom" />
export * from "@remix-run/dom";
export * from "@remix-run/events";
export const document: Document;
export const CustomEvent: typeof globalThis.CustomEvent;
export const Document: typeof globalThis.Document;
export const Element: typeof globalThis.Element;
export const Event: typeof globalThis.Event;
export const EventTarget: typeof globalThis.EventTarget;
export const Node: typeof globalThis.Node;
export const Text: typeof globalThis.Text;
export const createElement: any;
export { getEventListeners } from './events.ts';
export { getAttributes, clearAttributes } from './attributes.ts';