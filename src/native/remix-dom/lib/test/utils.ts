import { invariant } from '../invariant'

export type Assert<T extends true> = T

export type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false

export type FunctionContext<T> = T extends (this: infer U, ...args: any[]) => any ? U : unknown

export async function drain(stream: ReadableStream<Uint8Array>): Promise<string> {
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

export async function* readChunks(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<string, string, string> {
  let reader = stream.getReader()
  let decoder = new TextDecoder()

  try {
    while (true) {
      let { done, value } = await reader.read()
      if (done) break
      yield decoder.decode(value, { stream: true })
    }
  } finally {
    reader.releaseLock()
  }
  return ''
}

export function withResolvers<T = void>() {
  const { promise, resolve } = Promise.withResolvers<T>()
  return [promise, resolve] as const
}

export function waitForMutations(target: Node, work?: () => void) {
  return new Promise((resolve, reject) => {
    let timeout = setTimeout(() => {
      reject(new Error('Timeout waiting for mutations'))
    }, 1000)

    let observer = new MutationObserver((mutations) => {
      clearTimeout(timeout)
      resolve(mutations)
    })

    observer.observe(target, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    })

    work?.()
  })
}

export function waitFor(target: Node, predicate: () => boolean, work?: () => void) {
  return new Promise<void>((resolve, reject) => {
    let timeout = setTimeout(() => {
      observer.disconnect()
      reject(new Error('Timeout waiting for condition'))
    }, 1000)

    function check() {
      try {
        if (predicate()) {
          clearTimeout(timeout)
          observer.disconnect()
          resolve()
        }
      } catch (e) {
        // ignore predicate errors and keep waiting
      }
    }

    let observer = new MutationObserver(() => {
      check()
    })

    observer.observe(target, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    })

    // Kick off any work and then do an initial check
    try {
      work?.()
    } finally {
      check()
    }
  })
}

export function observeMutations(target: Node) {
  let mutations: MutationRecord[] = []
  let observer = new MutationObserver((mutationsList) => {
    mutations.push(...mutationsList)
  })

  observer.observe(target, {
    childList: true,
    subtree: true,
    attributes: true,
    characterData: true,
  })

  return {
    consume() {
      observer.disconnect()
      let result = mutations
      mutations = []
      return result
    },
  }
}

export function findCommentMarkers(container: Node, id: string): [Comment, Comment] {
  let walker = document.createTreeWalker(container, NodeFilter.SHOW_COMMENT, null)

  let comments: Comment[] = []
  let node
  while ((node = walker.nextNode())) {
    comments.push(node as Comment)
  }

  let startComment = comments.find((c) => c.textContent?.trim() === `rmx:${id}`)!
  let endComment = comments.find((c) => c.textContent?.trim() === `/rmx:${id}`)!

  return [startComment, endComment]
}

export function simulateBrowserDocument(
  container: HTMLElement,
  stream: ReadableStream<Uint8Array>,
) {
  let firstChunkReceived = false
  let reader = stream.getReader()
  let decoder = new TextDecoder()

  async function nextChunk() {
    let { done, value } = await reader.read()
    if (done) return { done: true, value: undefined }
    if (!firstChunkReceived) {
      container.innerHTML = decoder.decode(value)
      firstChunkReceived = true
    } else {
      let tmp = document.createElement('div')
      tmp.innerHTML = decoder.decode(value)
      let template = tmp.querySelector('template')
      invariant(template instanceof HTMLTemplateElement)
      // append stuff to the document because that's what the reconciler listens
      // for (and where a browser would put it)
      document.body.appendChild(template)
    }
    return { done: false }
  }

  return { nextChunk, releaseLock: () => reader.releaseLock() }
}
