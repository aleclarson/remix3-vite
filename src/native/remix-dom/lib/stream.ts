/**
 * Streaming render strategy
 *
 * - Composable segments: We build a segment tree (static text, composites, and frame
 *   regions) with deterministic hierarchical IDs. Blocking Frames attach async content
 *   producers; non-blocking Frames render fallbacks immediately.
 *
 * - Hierarchical IDs: Frame and Hydrated component IDs are derived from a stable path
 *   (e.g. f1, f1.1, f1.2), tracked via per-path child counters, so IDs are deterministic
 *   across passes and independent of timing.
 *
 * - Non-blocking Frames (with fallback) render immediately with pending status. Blocking
 *   Frames attach a promise via resolveFrame; we await all frame promises once, then
 *   serialize the segment tree to HTML for the stream's first chunk.
 *
 * - Head/style management is preserved: head-managed elements are hoisted and styles are
 *   collected/deduped before finalizing output.
 */
import { processStyle } from '@remix-run/style'
import type { Remix, ComponentHandle } from './component.ts'
import { Catch, Fragment, createComponent, createFrameHandle } from './component.ts'
import { invariant } from './invariant.ts'
import { isHydratedComponent, type HydratedComponent } from './hydrated.ts'
import { Frame } from './component.ts'

interface VNode {
  type: Remix.ElementType
  props: Remix.ElementProps
  key?: Remix.Key
  _handle?: ComponentHandle
  _parent?: VNode
}

export function createVNode(
  type: Remix.ElementType,
  props: Remix.ElementProps,
  key?: Remix.Key,
): VNode {
  return { type, props, key }
}

type OnError = (error: unknown, context: { caught: boolean }) => void

interface RenderToStreamOptions {
  onError?: OnError
  resolveFrame?: (src: string) => Promise<Remix.RemixElement> | Remix.RemixElement
}

interface RenderContext {
  headElements: string[]
  insideHead: boolean
  insideSvg: boolean
  onError: OnError
  parentVNode?: VNode
  styleCache: Map<string, { className: string; css: string }>
  resolveFrame: (src: string) => Promise<Remix.RemixElement> | Remix.RemixElement
  idsByPath: Map<string, number>
  pendingFrames: Array<{ frameId: string; promise: Promise<Remix.RemixElement> }>
}

type Segment =
  | { kind: 'static'; html: string }
  | { kind: 'composite'; parts: Segment[] }
  | {
      kind: 'frame'
      frameId: string
      scriptHtml: string
      content: Segment | null
      pending?: Promise<void>
    }

const HEAD_ELEMENTS = new Set(['title', 'meta', 'link', 'style'])

const SELF_CLOSING_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
])

const NUMERIC_CSS_PROPS = new Set([
  'z-index',
  'opacity',
  'flex-grow',
  'flex-shrink',
  'flex-order',
  'grid-area',
  'grid-row',
  'grid-column',
  'font-weight',
  'line-height',
  'order',
  'orphans',
  'widows',
  'zoom',
  'columns',
  'column-count',
])

const FRAMEWORK_PROPS = new Set(['children', 'innerHTML', 'on', 'key', 'css'])

export function renderToStream(
  node: Remix.RemixNode,
  options?: RenderToStreamOptions,
): ReadableStream<Uint8Array> {
  let encoder = new TextEncoder()
  let onError = options?.onError ?? ((error) => console.error(error))

  let context: RenderContext = {
    headElements: [],
    idsByPath: new Map(),
    insideHead: false,
    insideSvg: false,
    onError,
    resolveFrame: options?.resolveFrame ?? defaultResolveFrame,
    styleCache: new Map(),
    pendingFrames: [],
  }

  return new ReadableStream({
    async start(controller) {
      try {
        context.idsByPath.clear()
        let root = buildSegment(node, context, '')
        await resolveBlocking(root)
        let html = serializeSegment(root)
        let finalHtml = finalizeHtml(html, context)
        let bytes = encoder.encode(finalHtml)
        controller.enqueue(bytes)

        // If we have pending non-blocking frames, stream them as they resolve
        if (context.pendingFrames.length > 0) {
          await streamPendingFrames(context, controller, encoder)
        }

        controller.close()
      } catch (error) {
        onError(error, { caught: false })
        controller.error(error)
      }
    },
  })
}

function defaultResolveFrame(): never {
  throw new Error('No resolveFrame provided')
}

function isRemixElement(node: unknown): node is Remix.RemixElement {
  return typeof node === 'object' && node !== null && '$rmx' in node
}

function isHeadManagedElement(tag: string, props: Remix.ElementProps): boolean {
  return HEAD_ELEMENTS.has(tag) || (tag === 'script' && props.type === 'application/ld+json')
}

function staticSeg(html: string): Segment {
  return { kind: 'static', html }
}

function compositeSeg(parts: Segment[]): Segment {
  return { kind: 'composite', parts }
}

function buildSegment(node: Remix.RemixNode, context: RenderContext, framePath: string): Segment {
  if (typeof node === 'string' || typeof node === 'number' || typeof node === 'bigint') {
    return staticSeg(String(node))
  }

  if (node === null || node === undefined || typeof node === 'boolean') {
    return staticSeg('')
  }

  if (Array.isArray(node)) {
    return compositeSeg(node.map((child) => buildSegment(child, context, framePath)))
  }

  if (isRemixElement(node)) {
    let type = node.type
    let props = node.props

    if (type === Catch) {
      try {
        let children = props.children
        return children != null ? buildSegment(children, context, framePath) : staticSeg('')
      } catch (error) {
        context.onError(error, { caught: true })
        let fallback = props.fallback
        invariant(fallback, 'Fallback is required for Catch component')
        if (typeof fallback === 'function') {
          return buildSegment(fallback(error), context, framePath)
        }
        return buildSegment(fallback, context, framePath)
      }
    }

    if (type === Fragment) {
      let children = props.children
      return children != null ? buildSegment(children, context, framePath) : staticSeg('')
    }

    if (typeof type === 'string') {
      let tag = type

      if (tag === 'html') {
        return buildElementSegment(tag, props, context, framePath)
      }

      if (tag === 'head') {
        return buildHeadElementSegment(tag, props, context, framePath)
      }

      if (isHeadManagedElement(tag, props) && !context.insideHead) {
        let elementSeg = buildElementSegment(tag, props, context, framePath)
        let html = serializeSegment(elementSeg)
        context.headElements.push(html)
        return staticSeg('')
      }

      return buildElementSegment(tag, props, context, framePath)
    }

    if (typeof type === 'function') {
      if (type === Frame) {
        return buildFrameSegment(props, context, framePath)
      }
      if (isHydratedComponent(type)) {
        return buildHydratedComponentSegment(type, props, context, framePath)
      }
      return buildComponentSegment(type, props, context, 'ssr-component', framePath)
    }
  }

  return staticSeg('')
}

function buildFrameSegment(props: any, context: RenderContext, framePath: string): Segment {
  let nextIndex = (context.idsByPath.get(framePath) ?? 0) + 1
  context.idsByPath.set(framePath, nextIndex)
  let id = framePath ? `${framePath}-${nextIndex}` : `${nextIndex}`
  let frameId = `f${id}`

  let frameData = {
    id: frameId,
    status: props.fallback ? 'pending' : 'resolved',
    name: props.name,
    src: props.src,
  }
  let jsonString = JSON.stringify(frameData, null, 2)
  let scriptHtml = `\n<script type="application/json" rmx-frame="${frameId}">\n${jsonString}\n</script>`

  let seg: Segment = {
    kind: 'frame',
    frameId,
    scriptHtml,
    content: null,
  }

  let nonBlocking = !!props.fallback
  if (nonBlocking) {
    seg.content = buildSegment(props.fallback, context, id)
    let framePromise = Promise.resolve(context.resolveFrame(props.src))
    context.pendingFrames.push({ frameId, promise: framePromise })
  } else {
    seg.pending = Promise.resolve(context.resolveFrame(props.src)).then((resolved) => {
      seg.content = buildSegment(resolved, context, id)
    })
  }

  return seg
}

function buildElementSegment(
  tag: string,
  props: any,
  context: RenderContext,
  framePath: string,
): Segment {
  let processedProps = processStyleProps(props, context)
  // Determine namespace context for the current element and its children
  let currentIsSvg = context.insideSvg || tag === 'svg'
  let attrs = renderAttributes(processedProps, currentIsSvg)

  if (SELF_CLOSING_TAGS.has(tag)) {
    return staticSeg(`<${tag}${attrs} />`)
  }

  if (props.innerHTML) {
    return staticSeg(`<${tag}${attrs}>${props.innerHTML}</${tag}>`)
  }

  let open = staticSeg(`<${tag}${attrs}>`)
  // Adjust svg context for children: foreignObject switches back to HTML
  let previousInsideSvg = context.insideSvg
  context.insideSvg = tag === 'foreignObject' ? false : currentIsSvg
  let children =
    props.children != null ? buildSegment(props.children, context, framePath) : staticSeg('')
  context.insideSvg = previousInsideSvg
  let close = staticSeg(`</${tag}>`)
  return compositeSeg([open, children, close])
}

function buildHeadElementSegment(
  tag: string,
  props: any,
  context: RenderContext,
  framePath: string,
): Segment {
  let processedProps = processStyleProps(props, context)
  let attrs = renderAttributes(processedProps, false)
  let previousInsideHead = context.insideHead
  context.insideHead = true

  let open = staticSeg(`<${tag}${attrs}>`)
  let children =
    props.children != null ? buildSegment(props.children, context, framePath) : staticSeg('')
  let close = staticSeg(`</${tag}>`)

  context.insideHead = previousInsideHead
  return compositeSeg([open, children, close])
}

function renderAttributes(props: any, isSvg: boolean): string {
  let attrs = ''

  for (let key in props) {
    if (FRAMEWORK_PROPS.has(key)) continue

    let value = props[key]
    if (value === undefined || value === null || value === false) continue

    let attrName = transformAttributeName(key, isSvg)

    if (value === true) {
      attrs += ` ${attrName}`
    } else {
      attrs += ` ${attrName}="${escapeHtml(String(value))}"`
    }
  }

  return attrs
}

function buildComponentSegment(
  type: Function,
  props: any,
  context: RenderContext,
  componentId: string,
  framePath: string,
): Segment {
  let vnode = createVNode(type, props)
  if (context.parentVNode) {
    vnode._parent = context.parentVNode
  }

  let handle = createComponent({
    id: componentId,
    type: type,
    raise: (error) => {
      throw error
    },
    frame: createFrameHandle({ src: framePath }),
    getContext(providerType) {
      let current = vnode._parent
      while (current) {
        if (current.type === providerType) {
          let providerHandle = current._handle
          // TODO: need better vnode types to avoid defensive checks
          if (providerHandle) {
            return providerHandle.getContextValue()
          }
        }
        current = current._parent
      }
      return undefined
    },
  })

  vnode._handle = handle
  let [renderedNode] = handle.render(props)
  let childContext = { ...context, parentVNode: vnode }

  return buildSegment(renderedNode, childContext, framePath)
}

function createHydrationPropsReplacer(context: RenderContext, framePath: string) {
  function unwrapNode(node: Remix.RemixNode): unknown {
    if (node === null || node === undefined || typeof node === 'boolean') return node
    if (typeof node === 'string' || typeof node === 'number' || typeof node === 'bigint') {
      return node
    }
    if (Array.isArray(node)) {
      return node.map((child) => unwrapNode(child))
    }
    if (isRemixElement(node)) {
      return unwrapElement(node)
    }
    return node
  }

  function unwrapElement(element: Remix.RemixElement): unknown {
    let type = element.type
    let props = element.props

    // Special handling for Frame: serialize fallback subtree only
    if (type === Frame) {
      return unwrapNode(props.fallback)
    }

    // If it's a DOM tag, return a serializable shape with transformed props
    if (typeof type === 'string') {
      return { $rmx: true, type, props: transformProps(props) }
    }

    // Component function: render synchronously, then unwrap its result
    if (typeof type === 'function') {
      let vnode = createVNode(type, props)
      if (context.parentVNode) {
        vnode._parent = context.parentVNode
      }

      let handle = createComponent({
        id: 'SERIALIZED',
        type: type,
        raise: (error) => {
          throw error
        },
        frame: createFrameHandle({ src: framePath }),
        getContext(providerType) {
          let current = vnode._parent
          while (current) {
            if (current.type === providerType) {
              let providerHandle = current._handle
              if (providerHandle) {
                return providerHandle.getContextValue()
              }
            }
            current = current._parent
          }
          return undefined
        },
      })

      vnode._handle = handle
      let [renderedNode] = handle.render(props)
      return unwrapNode(renderedNode)
    }

    return null
  }

  function transformProps(input: Remix.ElementProps): Record<string, unknown> {
    let out: Record<string, unknown> = {}
    for (let key in input) {
      let value = input[key]
      if (key === 'children') {
        out[key] = unwrapNode(value)
      } else {
        if (isRemixElement(value)) {
          out[key] = unwrapNode(value)
        } else if (Array.isArray(value)) {
          out[key] = value.map((v) => unwrapNode(v))
        } else {
          out[key] = value
        }
      }
    }
    return out
  }

  return function replacer(_key: string, value: unknown) {
    if (isRemixElement(value)) {
      return unwrapElement(value)
    }
    if (Array.isArray(value)) {
      return value.map((v) => unwrapNode(v))
    }
    return value
  }
}

function buildHydratedComponentSegment(
  type: HydratedComponent,
  props: any,
  context: RenderContext,
  framePath: string,
): Segment {
  let nextIndex = (context.idsByPath.get(framePath) ?? 0) + 1
  context.idsByPath.set(framePath, nextIndex)
  let id = framePath ? `${framePath}.${nextIndex}` : `${nextIndex}`
  let instanceId = `h${id}`
  let rendered = buildComponentSegment(type, props, context, instanceId, id)
  let hydrationScript = staticSeg(
    createHydrationScript(type, props, instanceId, createHydrationPropsReplacer(context, id)),
  )
  let start = staticSeg('<!-- rmx:h -->')
  let end = staticSeg('<!-- /rmx:h -->')
  return compositeSeg([start, rendered, end, hydrationScript])
}

// Resolve all blocking frame content once
async function resolveBlocking(segment: Segment): Promise<void> {
  if (segment.kind === 'frame') {
    if (segment.pending) {
      await segment.pending
      segment.pending = undefined
    }
    if (segment.content) await resolveBlocking(segment.content)
    return
  }
  if (segment.kind === 'composite') {
    for (let part of segment.parts) {
      await resolveBlocking(part)
    }
  }
}

// Serialize the segment tree to HTML
function serializeSegment(seg: Segment): string {
  if (seg.kind === 'static') return seg.html
  if (seg.kind === 'composite') return seg.parts.map(serializeSegment).join('')
  // frame
  let inner = seg.content ? serializeSegment(seg.content) : ''
  let start = `<!-- frame:start:${seg.frameId} -->`
  let end = `<!-- frame:end:${seg.frameId} -->`
  return start + inner + end + seg.scriptHtml
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function createHydrationScript(
  component: HydratedComponent,
  props: Record<string, unknown>,
  id: string,
  replacer?: (this: unknown, key: string, value: unknown) => unknown,
): string {
  let hydrationData = {
    moduleUrl: component.$moduleUrl,
    exportName: component.$exportName,
    props: props,
    id,
  }
  let jsonString = JSON.stringify(hydrationData, replacer)
  return `<script type="application/json" rmx-hydrated>\n${jsonString}\n</script>`
}

function transformAttributeName(name: string, isSvg: boolean): string {
  // aria-/data- pass through
  if (name.startsWith('aria-') || name.startsWith('data-')) return name

  // Namespaced
  if (name === 'xlinkHref') return 'xlink:href'
  if (name === 'xmlLang') return 'xml:lang'
  if (name === 'xmlSpace') return 'xml:space'

  // HTML mappings
  if (!isSvg) {
    if (name === 'className') return 'class'
    if (name === 'htmlFor') return 'for'
    if (name === 'tabIndex') return 'tabindex'
    if (name === 'acceptCharset') return 'accept-charset'
    if (name === 'httpEquiv') return 'http-equiv'
    return name.toLowerCase()
  }

  // SVG preserved-case exceptions
  if (
    name === 'viewBox' ||
    name === 'preserveAspectRatio' ||
    name === 'gradientUnits' ||
    name === 'gradientTransform' ||
    name === 'patternUnits' ||
    name === 'patternTransform' ||
    name === 'clipPathUnits' ||
    name === 'maskUnits' ||
    name === 'maskContentUnits'
  )
    return name

  // General SVG: kebab-case
  return camelToKebab(name)
}

function camelToKebab(input: string): string {
  return input
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/_/g, '-')
    .toLowerCase()
}

function finalizeHtml(html: string, context: RenderContext): string {
  let hasHtmlRoot = html.trimStart().toLowerCase().startsWith('<html')

  let css = collectAllStyles(context)
  if (css) {
    context.headElements.push(`<style data-rmx-styles>${css}</style>`)
  }

  // Inject head elements if we have any
  if (context.headElements.length > 0) {
    let headContent = context.headElements.join('')
    if (hasHtmlRoot) {
      // For HTML root, inject into existing head or create one
      let headCloseIndex = html.indexOf('</head>')
      if (headCloseIndex !== -1) {
        // Inject before existing </head>
        html = html.slice(0, headCloseIndex) + headContent + html.slice(headCloseIndex)
      } else {
        // No existing head, inject after <html>
        let htmlOpenMatch = html.match(/<html[^>]*>/)
        if (htmlOpenMatch) {
          let insertIndex = htmlOpenMatch.index! + htmlOpenMatch[0].length
          html =
            html.slice(0, insertIndex) + `<head>${headContent}</head>` + html.slice(insertIndex)
        }
      }
    } else {
      // No HTML root, prepend head
      html = `<head>${headContent}</head>${html}`
    }
  }

  if (hasHtmlRoot) {
    html = '<!doctype html>' + html
  }

  return html
}

function processStyleProps(props: any, context: RenderContext): any {
  let processedProps = { ...props }

  if (props.css) {
    if (typeof props.css === 'object') {
      let { className } = processStyle(props.css, context.styleCache)
      if (className) {
        let existingClass = props.className || props.class
        processedProps.class = existingClass ? `${existingClass} ${className}` : className
        if (props.className) {
          delete processedProps.className
        }
      }
    }
    delete processedProps.css
  }

  if (typeof props.style === 'object') {
    processedProps.style = serializeStyleObject(props.style)
  }

  return processedProps
}

function collectAllStyles(context: RenderContext): string {
  if (context.styleCache.size === 0) return ''

  let allCss = ''
  for (let { css } of context.styleCache.values()) {
    allCss += css + '\n'
  }
  return allCss.trim()
}

function serializeStyleObject(style: Record<string, any>): string {
  let parts: string[] = []

  for (let [key, value] of Object.entries(style)) {
    if (value == null) continue
    if (typeof value === 'boolean') continue
    if (typeof value === 'number' && !Number.isFinite(value)) continue

    // Convert camelCase to kebab-case
    let cssKey = key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)

    // Add px to numeric values where appropriate
    let shouldAppendPx =
      typeof value === 'number' &&
      value !== 0 &&
      !NUMERIC_CSS_PROPS.has(cssKey) &&
      !cssKey.startsWith('--')

    let cssValue = shouldAppendPx
      ? `${value}px`
      : Array.isArray(value)
        ? value.join(', ')
        : String(value)

    parts.push(`${cssKey}: ${cssValue};`)
  }

  return parts.join(' ')
}

async function streamPendingFrames(
  context: RenderContext,
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
): Promise<void> {
  let processedFrames = new Set<string>()

  while (true) {
    let batch = context.pendingFrames.filter(({ frameId }) => !processedFrames.has(frameId))
    if (batch.length === 0) break

    await Promise.all(
      batch.map(async ({ frameId, promise }) => {
        processedFrames.add(frameId)
        try {
          let resolvedContent = await promise
          // Derive hierarchical path from the frame id (strip the 'f' prefix)
          let framePath = frameId.startsWith('f') ? frameId.slice(1) : frameId
          let contentSegment = buildSegment(resolvedContent, context, framePath)
          // Ensure any blocking descendants are fully resolved before streaming
          await resolveBlocking(contentSegment)
          let contentHtml = serializeSegment(contentSegment)

          // Stream as a template element
          let templateHtml = `<template id="${frameId}">${contentHtml}</template>`
          controller.enqueue(encoder.encode(templateHtml))
        } catch (error) {
          context.onError(error, { caught: false })
        }
      }),
    )
  }
}

async function drain(stream: ReadableStream<Uint8Array>): Promise<string> {
  let reader = stream.getReader()
  let decoder = new TextDecoder()
  let html = ''

  while (true) {
    let { done, value } = await reader.read()
    if (done) break
    html += decoder.decode(value)
  }

  return html
}

export async function renderToString(node: Remix.RemixNode): Promise<string> {
  return drain(renderToStream(node))
}
