import { test, it, expect, describe } from 'vitest'
import { createFrame } from './frame.ts'
import { Frame, type Remix } from './component.ts'
import { renderToStream } from './stream.ts'
import { drain, simulateBrowserDocument, waitForMutations, withResolvers } from './test/utils.ts'
import { hydrated } from './hydrated.ts'
import { invariant } from './invariant.ts'
import { dom } from '@remix-run/events'

describe('frame', () => {
  test('hydrates components', async () => {
    let capturedRender = () => {}

    const HydratedButton = hydrated(
      '/fragments/button.js#Button',
      function Button(this: Remix.Handle) {
        let count = 0
        capturedRender = () => {
          count++
          this.render()
        }
        return () => <button>{count}</button>
      },
    )

    // simulate server render
    let container = document.createElement('div')
    let content = await drain(
      renderToStream(
        <div>
          <h1>Hello, World!</h1>
          <HydratedButton />
        </div>,
      ),
    )
    container.innerHTML = content

    // get initial nodes before hydration
    let h1 = container.querySelector('h1')
    let button = container.querySelector('button')
    invariant(h1 && button)

    // create/hydrate frame
    let frame = createFrame(container, {
      loadModule: () => HydratedButton,
    })
    await frame.ready()

    // retains nodes after hydration
    expect(container.querySelector('h1')).toBe(h1)
    expect(container.querySelector('button')).toBe(button)
    expect(button.textContent).toBe('0')

    capturedRender()
    frame.flush()

    // retains nodes after update
    expect(container.querySelector('button')).toBe(button)
    expect(container.querySelector('h1')).toBe(h1)

    // updates content
    expect(button.textContent).toBe('1')
  })

  it('updates props from the server on reloads', async () => {
    let [reloadPromise, resolveReload] = withResolvers()

    let capturedReload = () => {}
    const Reloader = hydrated('/test.js#Reloader', function (this: Remix.Handle) {
      capturedReload = async () => {
        await this.frame.reload()
        resolveReload()
      }
      return ({ children }: { children: Remix.RemixNode }) => <button>{children}</button>
    })

    let serverCount = 0
    function fakeServerHandler() {
      serverCount++
      return (
        <section>
          <Reloader>
            <span>
              Remix Serialized Element <i>{serverCount}</i>
            </span>
          </Reloader>
        </section>
      )
    }

    // simulate server render
    let container = document.createElement('div')
    let content = await drain(renderToStream(fakeServerHandler()))
    container.innerHTML = content
    let button = container.querySelector('button')
    invariant(button)
    expect(button.innerHTML).toBe('<span>Remix Serialized Element <i>1</i></span>')

    let frame = createFrame(container, {
      loadModule: () => Reloader,
      resolveFrame: () => {
        return drain(renderToStream(fakeServerHandler()))
      },
    })
    await frame.ready()

    capturedReload()
    await reloadPromise
    frame.flush()
    expect(button.innerHTML).toBe('<span>Remix Serialized Element <i>2</i></span>')
  })

  it('updates serialized component trees from the server on reloads', async () => {
    let [reloadPromise, resolveReload] = withResolvers()

    let capturedReload = () => {}
    const Reloader = hydrated('/test.js#Reloader', function (this: Remix.Handle) {
      capturedReload = async () => {
        await this.frame.reload()
        resolveReload()
      }
      return ({ children }: { children: Remix.RemixNode }) => <button>{children}</button>
    })

    let serverCount = 0
    function fakeServerHandler() {
      serverCount++
      function Indirection() {
        return (
          <span>
            Remix Serialized Element <i>{serverCount}</i>
          </span>
        )
      }

      return (
        <section>
          <Reloader>
            <Indirection />
          </Reloader>
        </section>
      )
    }

    // simulate server render
    let container = document.createElement('div')
    let content = await drain(renderToStream(fakeServerHandler()))
    container.innerHTML = content
    let button = container.querySelector('button')
    invariant(button)
    expect(button.innerHTML).toBe('<span>Remix Serialized Element <i>1</i></span>')

    let frame = createFrame(container, {
      loadModule: () => Reloader,
      resolveFrame: () => {
        return drain(renderToStream(fakeServerHandler()))
      },
    })
    await frame.ready()

    capturedReload()
    await reloadPromise
    frame.flush()
    expect(button.innerHTML).toBe('<span>Remix Serialized Element <i>2</i></span>')
  })

  describe('initial document streams', () => {
    it('replaces late frames', async () => {
      let container = document.createElement('div')

      // control the frame resolution
      let [framePromise, resolveFrame] = withResolvers<Remix.RemixElement>()

      // Create initial stream with pending frame
      let stream = renderToStream(
        <div>
          <h1>Page Title</h1>
          <Frame src="/fragments/sidebar" fallback={<nav>Loading sidebar...</nav>} />
          <p>Main content</p>
        </div>,
        { resolveFrame: async () => framePromise },
      )

      let simulator = simulateBrowserDocument(container, stream)
      await simulator.nextChunk()

      // Track original elements to verify they're preserved
      let h1 = container.querySelector('h1')
      let p = container.querySelector('p')
      let frameEl = container.querySelector('nav')

      invariant(h1 && p && frameEl)

      // Verify initial state
      expect(h1.textContent).toBe('Page Title')
      expect(p.textContent).toBe('Main content')
      expect(frameEl.textContent).toBe('Loading sidebar...')

      // Create reconciler and adopt the initial content
      let frame = createFrame(container)
      await frame.ready()

      // Resolve the frame content
      resolveFrame(<nav>Loaded</nav>)

      // wait for the frame template to be inserted into the document
      await waitForMutations(frameEl, simulator.nextChunk)

      // verify DOM retention
      expect(container.querySelector('nav')).toBe(frameEl)
      expect(container.querySelector('h1')).toBe(h1)
      expect(container.querySelector('p')).toBe(p)

      // verify the frame content updated
      expect(frameEl.textContent).toBe('Loaded')

      simulator.releaseLock()
    })

    it('hydrates late frames', async () => {
      let container = document.createElement('div')
      let [framePromise, resolveFrame] = withResolvers<Remix.RemixElement>()

      const HydratedButton = hydrated(
        '/fragments/button.js#Button',
        function Button(this: Remix.Handle) {
          let count = 0
          return () => (
            <button
              on={dom.click(() => {
                count++
                this.render()
              })}
            >
              {count}
            </button>
          )
        },
      )

      // Create initial stream with pending frame
      let stream = renderToStream(
        <main>
          <Frame src="/fragments/sidebar" fallback={<section>Loading...</section>} />
        </main>,
        { resolveFrame: async () => framePromise },
      )

      let simulator = simulateBrowserDocument(container, stream)
      await simulator.nextChunk()

      let loadModuleCalls = 0
      let frame = createFrame(container, {
        loadModule: () => {
          loadModuleCalls++
          return HydratedButton
        },
      })

      await frame.ready()

      let main = container.querySelector('main')
      invariant(main)

      resolveFrame(
        <div>
          <HydratedButton />
        </div>,
      )

      await waitForMutations(main, simulator.nextChunk)
      simulator.releaseLock()
      let button = container.querySelector('button')
      invariant(button)

      expect(button.textContent).toBe('0')
      expect(loadModuleCalls).toBe(1)

      button.click()
      frame.flush()
      expect(button.textContent).toBe('1')
    })
  })

  it('renders serialized component trees')

  it.skip('hydrates nested hydrated components through server props', async () => {
    let container = document.createElement('div')
    let [framePromise, resolveFrame] = withResolvers<Remix.RemixElement>()

    const Card = hydrated('/card.js#Card', function Card(this: Remix.Handle) {
      let count = 0
      return ({ children }: { children: Remix.RemixNode }) => <div>{children}</div>
    })

    let capturedButtonRender = () => {}
    const Button = hydrated('/button.js#Button', function Button(this: Remix.Handle) {
      let count = 0
      capturedButtonRender = () => {
        count++
        this.render()
      }
      return () => <button>{count}</button>
    })

    let stream = renderToStream(
      <main>
        <Card>
          <Button />
        </Card>
      </main>,
      { resolveFrame: async () => framePromise },
    )

    let simulator = simulateBrowserDocument(container, stream)
    await simulator.nextChunk()
    console.log(container.innerHTML)

    let frame = createFrame(container, {
      loadModule: (_, name) => {
        if (name === 'Card') return Card
        if (name === 'Button') return Button
        throw new Error('unknown component')
      },
    })

    await frame.ready()
    simulator.releaseLock()

    let button = container.querySelector('button')
    invariant(button)
    expect(button.textContent).toBe('0')

    // capturedButtonRender()
    // frame.flush()
    // expect(button.textContent).toBe('1')
  })

  it.todo('passes the right frame to hydrated components')
  it.todo('can be reloaded twice, yea, thrice, verily')

  describe('frame resolution with sibling hydrated components', () => {
    it('resolves with hydrated components after the frame', async () => {
      let container = document.createElement('div')
      let [framePromise, resolveFrame] = withResolvers<Remix.RemixElement>()

      let stream = renderToStream(
        <main>
          <Frame src="/fragments/sidebar" fallback={<section>Loading...</section>} />
          <HydratedButton />
        </main>,
        { resolveFrame: async () => framePromise },
      )

      let simulator = simulateBrowserDocument(container, stream)
      await simulator.nextChunk()
      let frame = createFrame(container, { loadModule: () => HydratedButton })
      await frame.ready()
      let main = container.querySelector('main')
      invariant(main)
      resolveFrame(<p>Loaded</p>)
      await waitForMutations(main, simulator.nextChunk)
      simulator.releaseLock()

      expect(container.querySelector('p')?.textContent).toBe('Loaded')
    })

    it('resolves the frame with hydrated before it', async () => {
      let container = document.createElement('div')
      let [framePromise, resolveFrame] = withResolvers<Remix.RemixElement>()

      let stream = renderToStream(
        <main>
          <HydratedButton />
          <Frame src="/fragments/sidebar" fallback={<section>Loading...</section>} />
        </main>,
        { resolveFrame: async () => framePromise },
      )

      let simulator = simulateBrowserDocument(container, stream)
      await simulator.nextChunk()
      let frame = createFrame(container, { loadModule: () => HydratedButton })
      await frame.ready()
      let main = container.querySelector('main')
      invariant(main)
      resolveFrame(<p>Loaded</p>)
      await waitForMutations(main, simulator.nextChunk)
      simulator.releaseLock()

      expect(container.querySelector('p')?.textContent).toBe('Loaded')
    })

    it('resolves the frame with hydrated in the frame', async () => {
      let container = document.createElement('div')
      let [framePromise, resolveFrame] = withResolvers<Remix.RemixElement>()

      // setup
      let stream = renderToStream(
        <main>
          <Frame src="/fragments/sidebar" fallback={<section>Loading...</section>} />
        </main>,
        { resolveFrame: async () => framePromise },
      )
      let simulator = simulateBrowserDocument(container, stream)
      await simulator.nextChunk()
      let frame = createFrame(container, { loadModule: () => HydratedButton })
      await frame.ready()
      let main = container.querySelector('main')
      invariant(main)

      resolveFrame(
        <div>
          <HydratedButton />
        </div>,
      )

      await waitForMutations(main, simulator.nextChunk)
      simulator.releaseLock()

      let button = container.querySelector('button')
      invariant(button)

      expect(button.textContent).toBe('0')
      button.click()
      frame.flush()
      expect(button.textContent).toBe('1')
    })

    it('hydrates components as the root of frame content', async () => {
      let container = document.createElement('div')
      let [framePromise, resolveFrame] = withResolvers<Remix.RemixElement>()

      // setup
      let stream = renderToStream(
        <main>
          <Frame src="/fragments/sidebar" fallback={<section>Loading...</section>} />
        </main>,
        { resolveFrame: async () => framePromise },
      )
      let simulator = simulateBrowserDocument(container, stream)
      await simulator.nextChunk()
      let frame = createFrame(container, { loadModule: () => HydratedButton })
      await frame.ready()
      let main = container.querySelector('main')
      invariant(main)

      resolveFrame(<HydratedButton />)

      await waitForMutations(main, simulator.nextChunk)
      simulator.releaseLock()

      let buttons = container.querySelectorAll('button')
      expect(buttons.length).toBe(1)

      let button = container.querySelector('button')
      invariant(button)

      expect(button.textContent).toBe('0')
      button.click()
      frame.flush()
      expect(button.textContent).toBe('1')
    })
  })
})

const HydratedButton = hydrated('/fragments/button.js#Button', function Button(this: Remix.Handle) {
  let count = 0
  return () => (
    <button
      on={dom.click(() => {
        count++
        this.render()
      })}
    >
      {count}
    </button>
  )
})
