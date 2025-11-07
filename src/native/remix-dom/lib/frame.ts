import { createElement, createFrameHandle, type Remix } from './component.ts'
import { invariant } from './invariant.ts'
import { diffNodes } from './diff-dom.ts'
import type { Scheduler } from './vdom.ts'
import { createRangeRoot, createScheduler } from './vdom.ts'

declare module './component.ts' {
  namespace Remix {
    export interface Frame {
      render: (content: Remix.FrameContent) => Promise<void>
      ready: () => Promise<void>
      flush: () => void
    }
  }
}

interface FrameContainer {
  appendChild: (node: Node) => void
  childNodes: Node[]
  querySelectorAll: (selector: string) => Element[]
  querySelector: (selector: string) => Element | null
  insertBefore: (node: Node, before: Node) => void
  root: ParentNode
}

type FrameRoot = [Comment, Comment] | Element | Document | DocumentFragment

type FrameMarkerData = {
  src: string
  status: 'pending' | 'resolved'
  name?: string
  id: string
}

type HydrationMarkerData = {
  moduleUrl: string
  exportName: string
  props: Record<string, any>
}

export type VirtualRootMarker = Comment & {
  $rmx: Remix.VirtualRoot
}

type PendingHydrationRoots = Map<Comment, [Comment, Remix.RemixElement]>

type LoadModule = (src: string, name: string) => Promise<Function> | Function

type ResolveFrame = (src: string) => Promise<Remix.FrameContent> | Remix.FrameContent

export type FrameContext = {
  loadModule: LoadModule
  pendingRoots: PendingHydrationRoots
  addFrame: (node: Comment) => HTMLScriptElement
  frame: Remix.FrameHandle
  scheduler: Scheduler
}

type FrameInit = {
  src: string
  loadModule: LoadModule
  pendingHydrationRoots: PendingHydrationRoots
  marker?: FrameMarkerData
  scheduler: Scheduler
  resolveFrame: ResolveFrame
}

const TOP_FRAME = Symbol('TOP_FRAME')

const defaultInit: FrameInit = {
  loadModule: async () => {
    throw new Error('loadModule not implemented')
  },
  pendingHydrationRoots: new Map(),
  src: '/',
  scheduler: createScheduler(),
  resolveFrame: async () => {
    throw new Error('resolveFrame not implemented')
  },
}

export function createFrame(root: FrameRoot, init?: Partial<FrameInit>): Remix.Frame {
  let config = { ...defaultInit, ...init }
  let container = createContainer(root)
  let scheduler = config.scheduler

  let frame = createFrameHandle({
    src: config.src,
    reload: async () => {
      let content = await config.resolveFrame(config.src)
      await render(content)
    },
    replace: async (content: Remix.FrameContent) => {
      await render(content)
    },
  })

  let context: FrameContext = {
    frame,
    loadModule: config.loadModule,
    pendingRoots: config.pendingHydrationRoots,
    scheduler: config.scheduler,
    addFrame(start) {
      let end = findEndComment(start)
      let script = end.nextElementSibling
      invariant(script instanceof HTMLScriptElement, 'Invalid frame script')
      let marker = parseFrameScript(script)
      createFrame([start, end], { ...config, src: marker.src, marker })
      return script
    },
  }

  async function render(content: Remix.FrameContent) {
    let fragment = typeof content === 'string' ? createFragmentFromString(content) : content
    let nextContainer = createContainer(fragment)
    await populatePendingRoots(nextContainer, context)
    diffNodes(container.childNodes, Array.from(nextContainer.childNodes), context)
    hydratedAndCreateSubFrames(container.childNodes, context)
  }

  async function hydrate() {
    await populatePendingRoots(container, context)
    hydratedAndCreateSubFrames(Array.from(container.childNodes), context)
    if (config.marker?.status === 'pending') {
      let earlyContent = getEarlyFrameContent(config.marker.id)
      if (earlyContent) {
        await render(earlyContent)
      } else {
        setupTemplateObserver(config.marker.id, render)
      }
    }
  }

  let hydratePromise = hydrate()

  return {
    render,
    ready: () => hydratePromise,
    flush: () => scheduler.dequeue(),
  }
}

function getEarlyFrameContent(id: string) {
  let template = document.querySelector(`template#${id}`)
  if (template instanceof HTMLTemplateElement) {
    let fragment = template.content
    template.remove()
    return fragment
  }
  return null
}

function setupTemplateObserver(id: string, cb: (fragment: DocumentFragment) => void) {
  let observer = new MutationObserver(async (mutations) => {
    for (let mutation of mutations) {
      for (let node of mutation.addedNodes) {
        if (node instanceof HTMLTemplateElement && node.id === id) {
          observer.disconnect()
          node.remove()
          cb(node.content)
        }
      }
    }
  })

  observer.observe(document.body, { childList: true })
}

function parseFrameScript(script: HTMLScriptElement) {
  let data = JSON.parse(script.textContent || '{}')
  invariant(isFrameMarker(data))
  return data
}

function isFrameMarker(object: unknown): object is FrameMarkerData {
  return (
    typeof object === 'object' &&
    object !== null &&
    'src' in object &&
    'id' in object &&
    'status' in object
  )
}

function findEndComment(comment: Comment) {
  let node = comment.nextSibling
  while (node && node.nodeType !== 8) {
    node = node.nextSibling
    if (node instanceof Comment && node.data.trim().startsWith('frame:end')) {
      return node
    }
  }
  throw new Error('End comment not found')
}

function findCommentAbove(anchor: Node, data: string) {
  let node = anchor.previousSibling
  while (node && node.nodeType !== 8) {
    node = node.previousSibling
    if (node instanceof Comment && node.data.trim() === data) {
      return node
    }
  }
  invariant(false, 'Start comment not found')
}

function hydrate(
  vElement: Remix.RemixElement,
  start: Comment,
  end: Comment,
  context: FrameContext,
) {
  context.pendingRoots.delete(start)

  let root = createRangeRoot([start, end], {
    scheduler: context.scheduler,
    frame: context.frame,
    // TODO: vParent: context.vParent,
  })

  Object.defineProperty(start, '$rmx', { value: root, enumerable: false })
  root.render(vElement)
}

export function isVirtualStartMarker(node: Node): node is VirtualRootMarker {
  return '$rmx' in node
}

function hydratedAndCreateSubFrames(nodes: Node[], context: FrameContext) {
  for (let i = 0; i < nodes.length; i++) {
    let node = nodes[i]

    if (node instanceof Comment && context.pendingRoots.has(node)) {
      let info = context.pendingRoots.get(node)
      invariant(info, 'Expected hydration element')
      let [end, element] = info
      hydrate(element, node, end, context)
      // advance cursor to node after end marker
      i = nodes.indexOf(end)
    }

    if (isFrameStart(node)) {
      let frameScript = context.addFrame(node)
      i = nodes.indexOf(frameScript) // advance past frame script
      frameScript.remove()
    } else if (node.childNodes.length > 0) {
      hydratedAndCreateSubFrames(Array.from(node.childNodes), context)
    }
  }
}

function createFragmentFromString(content: string) {
  let template = document.createElement('template')
  template.innerHTML = content.trim()
  return template.content
}

function isFrameStart(node: Node): node is Comment {
  return node instanceof Comment && node.data.trim().startsWith('frame:start:')
}

const hydrationScriptSelector = 'script[type="application/json"][rmx-hydrated]'

// pending roots map is shared by child frames so we can populate from the
// parent and load all found modules in parallel and keep diffing synchronous
async function populatePendingRoots(container: FrameContainer, context: FrameContext) {
  let scripts = queryHydrationScripts(container)
  await Promise.all(
    scripts.map(async (script) => {
      let data = JSON.parse(script.textContent || '{}')
      invariant(isHydrationScript(data), 'Invalid hydration script')
      let mod = await context.loadModule(data.moduleUrl, data.exportName)
      let vElement = createElement(mod, data.props)
      let [start, end] = getVirtualRootMarkersFromScript(script)
      context.pendingRoots.set(start, [end, vElement])
      script.remove() // remove before diffing
    }),
  )
}

function getVirtualRootMarkersFromScript(script: HTMLScriptElement): [Comment, Comment] {
  let end = script.previousSibling
  invariant(end instanceof Comment, 'Expected comment')
  let start = findCommentAbove(end, 'rmx:h')
  return [start, end]
}

function queryHydrationScripts(container: FrameContainer): HTMLScriptElement[] {
  return Array.from(container.root.querySelectorAll(hydrationScriptSelector))
}

function isHydrationScript(object: unknown): object is HydrationMarkerData {
  return (
    typeof object === 'object' &&
    object !== null &&
    'moduleUrl' in object &&
    'exportName' in object &&
    'props' in object
  )
}

function createContainer(container: FrameRoot): FrameContainer {
  return Array.isArray(container)
    ? createCommentContainer(container)
    : createElementContainer(container)
}

function createElementContainer(container: Document | Element | DocumentFragment): FrameContainer {
  return {
    root: container,
    appendChild: (node: Node) => container.appendChild(node),
    get childNodes() {
      return Array.from(container.childNodes)
    },
    querySelectorAll: (selector: string) => Array.from(container.querySelectorAll(selector)),
    querySelector: (selector: string) => container.querySelector(selector),
    insertBefore: (node: Node, before: Node) => container.insertBefore(node, before),
  }
}

function createCommentContainer(container: [Comment, Comment]): FrameContainer {
  let root = container[1].parentNode
  invariant(root, 'Invalid comment container')

  let appendChild = (node: Node) => {
    root.insertBefore(node, container[1])
  }

  let getChildNodesBetween = (): Node[] => {
    let nodes: Node[] = []
    let node = container[0].nextSibling
    while (node && node !== container[1]) {
      nodes.push(node)
      node = node.nextSibling
    }
    return nodes
  }

  let querySelectorAll = (selector: string) => {
    let range = document.createRange()
    range.setStartAfter(container[0])
    range.setEndBefore(container[1])

    let all = root.querySelectorAll(selector)
    let results: Element[] = []
    for (let i = 0; i < all.length; i++) {
      let el = all[i]
      if (range.intersectsNode(el)) results.push(el)
    }
    return results
  }

  let querySelector = (selector: string) => {
    let range = document.createRange()
    range.setStartAfter(container[0])
    range.setEndBefore(container[1])

    let all = root.querySelectorAll(selector)
    for (let i = 0; i < all.length; i++) {
      let el = all[i]
      if (range.intersectsNode(el)) return el
    }
    return null
  }

  let insertBefore = (node: Node, before: Node) => {
    root.insertBefore(node, before)
  }

  return {
    get childNodes() {
      return getChildNodesBetween()
    },
    appendChild,
    querySelectorAll,
    querySelector,
    insertBefore,
    root,
  }
}
