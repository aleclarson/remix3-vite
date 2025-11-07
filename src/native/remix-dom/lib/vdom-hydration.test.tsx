import { describe, it, expect } from 'vitest'
import { createRoot } from './vdom.ts'
import { invariant } from './invariant.ts'
import { renderToString } from './stream.ts'
import { dom } from '@remix-run/events'

describe('hydration', () => {
  it('adopts text nodes', async () => {
    let container = document.createElement('div')
    container.innerHTML = 'Hello, world!'

    let node = container.firstChild

    let root = createRoot(container)
    root.render('Hello, world!')
    expect(container.innerHTML).toBe('Hello, world!')
    expect(container.firstChild).toBe(node)
  })

  it('adopts host nodes', async () => {
    let container = document.createElement('div')
    container.innerHTML = '<div></div>'
    let node = container.firstChild

    let root = createRoot(container)
    root.render(<div />)
    expect(container.innerHTML).toBe('<div></div>')
    expect(container.firstChild).toBe(node)
  })

  it('adopts dom nodes with children', async () => {
    let container = document.createElement('div')
    container.innerHTML = '<div><span>Hello, world!</span></div>'
    let node = container.firstChild
    let span = container.querySelector('span')
    invariant(span)

    let root = createRoot(container)
    root.render(
      <div>
        <span>Hello, world!</span>
      </div>,
    )
    expect(container.innerHTML).toBe('<div><span>Hello, world!</span></div>')
    expect(container.firstChild).toBe(node)
    expect(container.querySelector('span')).toBe(span)
  })

  it('adopts dom nodes with children text', async () => {
    let container = document.createElement('div')
    container.innerHTML = '<div>Hello, world!</div>'
    let node = container.firstChild
    invariant(node)
    let text = node.firstChild

    let root = createRoot(container)
    root.render(<div>Hello, world!</div>)
    expect(container.innerHTML).toBe('<div>Hello, world!</div>')
    expect(container.firstChild).toBe(node)
    let newText = container.firstChild?.firstChild
    invariant(newText)
    expect(newText).toBe(text)
  })

  it('adopts dom nodes with children text and elements', async () => {
    let container = document.createElement('div')
    container.innerHTML = '<div>Hello, <span>world!</span></div>'
    let div = container.firstChild
    invariant(div)
    let text = div.firstChild
    invariant(text instanceof Text)
    let span = container.querySelector('span')
    invariant(span)

    let root = createRoot(container)
    root.render(
      <div>
        Hello, <span>world!</span>
      </div>,
    )
    expect(container.innerHTML).toBe('<div>Hello, <span>world!</span></div>')
    expect(container.firstChild).toBe(div)
    let newText = container.firstChild?.firstChild
    expect(newText).toBe(text)
    expect(container.querySelector('span')).toBe(span)
  })

  it('adopts fragments', () => {
    let container = document.createElement('div')
    container.innerHTML = '<p>Hello</p><p>world!</p>'
    let ps = container.querySelectorAll('p')
    expect(ps).toHaveLength(2)

    let root = createRoot(container)
    root.render(
      <>
        <p>Hello</p>
        <p>world!</p>
      </>,
    )
    expect(container.innerHTML).toBe('<p>Hello</p><p>world!</p>')
    let newPs = container.querySelectorAll('p')
    invariant(newPs.length === 2)
    expect(newPs[0]).toEqual(ps[0])
    expect(newPs[1]).toEqual(ps[1])
  })

  it('adopts nodes within components', () => {
    let container = document.createElement('div')
    container.innerHTML = '<div>Hello, world!</div>'
    let div = container.firstChild
    invariant(div)
    let text = div.firstChild
    invariant(text instanceof Text)
    function App() {
      return <div>Hello, world!</div>
    }
    let root = createRoot(container)
    root.render(<App />)

    expect(container.innerHTML).toBe('<div>Hello, world!</div>')
    expect(container.firstChild).toBe(div)
    expect(container.firstChild?.firstChild).toBe(text)
  })

  it('adopts mixed nodes within components', () => {
    let container = document.createElement('div')
    container.innerHTML = '<div>Hello, <span>world!</span></div>'
    let div = container.firstChild
    invariant(div)
    let text = div.firstChild
    invariant(text instanceof Text)
    let span = container.querySelector('span')
    invariant(span)

    function App() {
      return (
        <div>
          Hello, <span>world!</span>
        </div>
      )
    }
    let root = createRoot(container)
    root.render(<App />)

    expect(container.innerHTML).toBe('<div>Hello, <span>world!</span></div>')
    expect(container.firstChild).toBe(div)
    expect(container.firstChild?.firstChild).toBe(text)
    expect(container.querySelector('span')).toBe(span)
  })

  it('ignores comments', () => {
    let container = document.createElement('div')
    container.innerHTML = '<div><!-- lol --><span>Hello</span></div>'
    let div = container.firstChild
    invariant(div)
    let span = container.querySelector('span')
    invariant(span)
    let text = span.firstChild
    invariant(text)

    let root = createRoot(container)
    root.render(
      <div>
        <span>Hello</span>
      </div>,
    )
    expect(container.innerHTML).toBe('<div><!-- lol --><span>Hello</span></div>')
    expect(container.querySelector('div')).toBe(div)
    expect(container.querySelector('span')).toBe(span)
    expect(span.firstChild).toBe(text)
  })

  it('corrects text mismatches', () => {
    let container = document.createElement('div')
    container.innerHTML = 'Hello'
    let text = container.firstChild

    let root = createRoot(container)
    root.render('Hello, world!')
    expect(container.innerHTML).toBe('Hello, world!')
    expect(container.firstChild).toBe(text)
  })

  it.todo('corrects sequential text node mismatches')

  it('corrects attribute mismatches', () => {
    let container = document.createElement('div')
    container.innerHTML = '<div class="primary"></div>'
    let div = container.firstChild
    invariant(div)

    let root = createRoot(container)
    root.render(<div class="secondary" />)

    expect(container.innerHTML).toBe('<div class="secondary"></div>')
    expect(container.firstChild).toBe(div)
  })

  it('attaches events', () => {
    let container = document.createElement('div')
    container.innerHTML = '<button>Click me</button>'
    let button = container.firstChild
    invariant(button instanceof HTMLButtonElement)

    let root = createRoot(container)
    let clicked = false
    root.render(
      <button
        on={dom.click(() => {
          clicked = true
        })}
      >
        Click me
      </button>,
    )
    root.flush()

    expect(container.querySelector('button')).toBe(button)
    button.click()
    expect(clicked).toBe(true)
  })

  it('ignores excess nodes', () => {
    let container = document.createElement('div')
    container.innerHTML = '<div><div>Who do you think you are?</div><aside>I am!</aside></div>'
    let root = createRoot(container)
    root.render(
      <div>
        <div>Who do you think you are?</div>
      </div>,
    )

    expect(container.innerHTML).toBe(
      '<div><div>Who do you think you are?</div><aside>I am!</aside></div>',
    )

    root.render(
      <div>
        <div>Leave it be</div>
      </div>,
    )

    expect(container.innerHTML).toBe('<div><div>Leave it be</div><aside>I am!</aside></div>')
  })

  it('patches up mismatched elements', () => {
    let container = document.createElement('div')
    container.innerHTML = '<div>Who do you think you are?</div>'
    let root = createRoot(container)
    root.render(<main>I am!</main>)

    expect(container.innerHTML).toBe('<main>I am!</main>')
  })

  it('works with renderToString', async () => {
    function App() {
      return (
        <div>
          <nav>Navigation</nav>
          <main>Content</main>
          <footer>Footer</footer>
        </div>
      )
    }
    let html = await renderToString(<App />)
    let container = document.createElement('div')
    container.innerHTML = html
    let main = container.querySelector('main')
    invariant(main)
    let root = createRoot(container)
    root.render(<App />)
    expect(container.innerHTML).toBe(html)
    expect(container.querySelector('main')).toBe(main)
  })

  it.skip('collapses text nodes', () => {
    let container = document.createElement('div')
    container.innerHTML = '<span>All Text</span>'

    let root = createRoot(container)
    let value = 'Text'
    root.render(<span>Some {value}</span>)
    expect(container.innerHTML).toBe('<span>All Text</span>')
  })
})
