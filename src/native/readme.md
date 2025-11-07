## DOM APIs used by Remix VDOM

- Document
  - createTextNode
  - createElement
  - createElementNS
- HTMLElement
  - innerHTML
- Node
  - parentNode
  - nextSibling
  - firstChild
  - nodeType
  - COMMENT_NODE
- ParentNode
  - insertBefore
  - appendChild
- ChildNode
  - remove
- Element
  - namespaceURI
  - tagName
  - classList.add
  - classList.remove
  - setAttribute
  - setAttributeNS
  - removeAttribute
  - removeAttributeNS
  - dispatchEvent
  - isConnected
- Text
  - data
  - textContent
- CustomEvent (needs global polyfill)

## Necessary patches

- Add an abstraction layer between the VDOM reconciler and the DOM APIs used by it.
- Remove use of `@remix-run/style` in the VDOM reconciler.
- Polyfill the `CustomEvent` constructor, inject it into the global scope.

## Hydration not supported

The native reconciler is SPA only.

- Stub `lib/diff-dom.ts`
- Stub `createRangeRoot` in `lib/vdom.ts`
- Frames are not supported
