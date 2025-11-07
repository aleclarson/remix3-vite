import { invariant } from './invariant.ts'
import type { FrameContext, VirtualRootMarker } from './frame.ts'

export function diffDom(
  current: NodeListOf<ChildNode> | Node[],
  next: NodeListOf<ChildNode> | Node[] | string,
) {
  if (typeof next === 'string') {
    let template = document.createElement('template')
    template.innerHTML = next
    next = Array.from(template.content.childNodes)
  }

  diffNodes(Array.from(current), Array.from(next), {} as FrameContext)
}

export function diffNodes(curr: Node[], next: Node[], context: FrameContext) {
  const parent = curr[0]?.parentNode
  invariant(parent, 'Parent node not found')

  // If we're diffing a bounded region (e.g., between frame comments), we should
  // insert new nodes before the original region's end boundary rather than
  // appending to the end of the parent. Use the nextSibling of the last current
  // node as a stable reference to the region's tail.
  const regionTailRef: ChildNode | null =
    curr.length > 0 ? (curr[curr.length - 1].nextSibling as ChildNode | null) : null

  const max = Math.max(curr.length, next.length)
  for (let i = 0; i < max; i++) {
    const c = curr[i]
    const n = next[i]
    if (!c && n) {
      if (regionTailRef) {
        parent.insertBefore(n, regionTailRef)
      } else {
        parent.appendChild(n)
      }
    } else if (c && !n) {
      parent.removeChild(c)
    } else if (c && n) {
      let cursor = diffNode(c, n, context)
      if (cursor) {
        i = next.indexOf(cursor)
      }
    }
  }
}

function diffNode(current: Node, next: Node, context: FrameContext): ChildNode | undefined {
  // Text → Text
  if (isTextNode(current) && isTextNode(next)) {
    const newText = next.textContent || ''
    if (current.textContent !== newText) current.textContent = newText
    return
  }

  // VirtualRootStartMarker → VirtualRootStartMarker
  if (isVirtualRootStartMarker(current) && isVirtualRootStartMarker(next)) {
    let info = context.pendingRoots.get(next)
    context.pendingRoots.delete(next)
    invariant(info, 'missing pending virtual root info')
    let [end, vElement] = info
    current.$rmx.render(vElement)
    return end // return cursor to fast forward
  }

  // Comment → Comment
  if (isCommentNode(current) && isCommentNode(next)) {
    const newData = next.data
    if (current.data !== newData) current.data = newData
    return
  }

  // Element → Element
  if (isElement(current) && isElement(next)) {
    // Different tags: replace
    if (current.tagName !== next.tagName) {
      const parent = current.parentNode
      if (parent) parent.replaceChild(next, current)
      return
    }

    // Same tag: update attributes then children
    diffElementAttributes(current, next, context)
    diffElementChildren(current, next, context)
    return
  }

  // Type mismatch: replace
  const parent = current.parentNode
  if (parent) parent.replaceChild(next, current)
}

function diffElementAttributes(current: Element, next: Element, context: FrameContext): void {
  const prevAttrNames = current.getAttributeNames()
  const nextAttrNames = next.getAttributeNames()

  const nextNameSet = new Set(nextAttrNames)

  // Removals
  for (const name of prevAttrNames) {
    if (!nextNameSet.has(name)) current.removeAttribute(name)
  }

  // Additions/updates
  for (const name of nextAttrNames) {
    const prevVal = current.getAttribute(name)
    const nextVal = next.getAttribute(name)
    if (prevVal !== nextVal) current.setAttribute(name, nextVal == null ? '' : String(nextVal))
  }
}

function diffElementChildren(current: Element, next: Element, context: FrameContext): void {
  const currentChildren = Array.from(current.childNodes)
  const nextChildren = Array.from(next.childNodes)

  // Keyed map by data-key for current children
  const keyToIndex = new Map<string, number>()
  for (let i = 0; i < currentChildren.length; i++) {
    const node = currentChildren[i]
    if (isElement(node)) {
      const key = node.getAttribute('data-key')
      if (key != null) keyToIndex.set(key, i)
    }
  }

  const used = new Array<boolean>(currentChildren.length).fill(false)
  const matchIndexForNext = new Array<number>(nextChildren.length).fill(-1)

  for (let i = 0; i < nextChildren.length; i++) {
    const nextChild = nextChildren[i]
    let matchIndex = -1

    if (isElement(nextChild)) {
      const key = nextChild.getAttribute('data-key')
      if (key != null && keyToIndex.has(key)) {
        const idx = keyToIndex.get(key)!
        if (!used[idx]) matchIndex = idx
      }
    }

    if (matchIndex === -1) {
      const candidateIndex = i
      if (
        candidateIndex < currentChildren.length &&
        !used[candidateIndex] &&
        nodeTypesComparable(currentChildren[candidateIndex], nextChild)
      ) {
        matchIndex = candidateIndex
      }
    }

    if (matchIndex !== -1) used[matchIndex] = true
    matchIndexForNext[i] = matchIndex
  }

  // Forward pass: update matched, collect committed
  const committed: (Node | undefined)[] = new Array(nextChildren.length)
  for (let i = 0; i < nextChildren.length; i++) {
    const mi = matchIndexForNext[i]
    if (mi !== -1) {
      const curChild = currentChildren[mi]
      let cursor = diffNode(curChild, nextChildren[i], context)
      if (cursor) {
        // Fast-forward across a hydrated virtual root region.
        const nextEndIdx = nextChildren.indexOf(cursor)
        const currEndIdx = findHydrationEndIndex(currentChildren, mi)

        // Mark the entire current region as used to avoid removals.
        for (let k = mi; k <= currEndIdx; k++) used[k] = true

        // Preserve both boundary markers in committed; skip interior in reorder pass.
        committed[i] = curChild // start marker
        committed[nextEndIdx] = currentChildren[currEndIdx] // end marker
        for (let j = i + 1; j < nextEndIdx; j++) committed[j] = undefined

        // Jump to end of region.
        i = nextEndIdx
        continue
      }
      committed[i] = curChild
    } else {
      committed[i] = nextChildren[i]
    }
  }

  // Backward pass: reorder via inserts while avoiding redundant moves
  let anchor: Node | undefined = undefined
  for (let i = committed.length - 1; i >= 0; i--) {
    const node = committed[i]
    if (!node) continue

    // Use only an anchor that is actually a child of the current parent
    const ref = anchor && anchor.parentNode === current ? anchor : null

    // Do not move virtual-root boundary markers; keep region stable.
    // If a boundary marker is new, ensure it is inserted before using it as an anchor.
    if (isVirtualRootStartMarker(node) || isVirtualRootEndMarker(node)) {
      if (node.parentNode !== current) {
        current.insertBefore(node, ref)
      }
      anchor = node
      continue
    }

    if (node.parentNode === current) {
      // Node already in parent: move only if its nextSibling is not the desired ref.
      const targetNext = ref
      const alreadyInPlace =
        (targetNext === null && node.nextSibling === null) || node.nextSibling === targetNext
      if (!alreadyInPlace) {
        current.insertBefore(node, targetNext)
      }
    } else {
      // New node: insert relative to a valid ref or append
      current.insertBefore(node, ref)
    }

    // Advance anchor only after the node is placed in the correct parent
    if (node.parentNode === current) {
      anchor = node
    }
  }

  // Removals
  for (let i = 0; i < currentChildren.length; i++) {
    if (!used[i]) {
      const node = currentChildren[i]
      if (node.parentNode === current) current.removeChild(node)
    }
  }
}

function nodeTypesComparable(a: Node, b: Node): boolean {
  if (isTextNode(a) && isTextNode(b)) return true
  if (isElement(a) && isElement(b)) return a.tagName === b.tagName
  if (isVirtualRootStartMarker(a) && isVirtualRootStartMarker(b)) return true
  if (isVirtualRootEndMarker(a) && isVirtualRootEndMarker(b)) return true
  if (isCommentNode(a) && isCommentNode(b)) return true
  return false
}

function isHydrationEndComment(node: Node): node is Comment {
  return isCommentNode(node) && node.data.trim() === '/rmx:h'
}

function findHydrationEndIndex(nodes: Node[], startIdx: number): number {
  for (let j = startIdx + 1; j < nodes.length; j++) {
    if (isHydrationEndComment(nodes[j])) return j
  }
  return startIdx
}

function isTextNode(node: Node): node is Text {
  return node.nodeType === Node.TEXT_NODE
}

function isElement(node: Node): node is Element {
  return node.nodeType === Node.ELEMENT_NODE
}

function isCommentNode(node: Node): node is Comment {
  return node.nodeType === Node.COMMENT_NODE
}

function isVirtualRootStartMarker(node: Node): node is VirtualRootMarker {
  return isCommentNode(node) && node.data.trim() === 'rmx:h'
}

function isVirtualRootEndMarker(node: Node): node is VirtualRootMarker {
  return isCommentNode(node) && node.data.trim() === '/rmx:h'
}
