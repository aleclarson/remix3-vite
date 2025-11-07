import { describe, it, expect } from 'vitest'
import { createRangeRoot } from './vdom.ts'
import type { Remix } from './component.ts'

describe('createRangeRoot', () => {
  it('renders', () => {
    let container = document.createElement('div')
    let start = document.createComment('range')
    let end = document.createComment('/range')
    let div = document.createElement('div')
    div.innerHTML = 'Hello, world!'
    container.appendChild(start)
    container.appendChild(div)
    container.appendChild(end)
    let root = createRangeRoot([start, end])
    root.render(<div>Hello, world!</div>)
    expect(container.innerHTML).toBe('<!--range--><div>Hello, world!</div><!--/range-->')
    expect(container.firstChild).toBe(start)
    expect(container.lastChild).toBe(end)
    expect(container.querySelector('div')).toBe(div)
  })

  it('updates', () => {
    let container = document.createElement('div')
    let start = document.createComment('range')
    let end = document.createComment('/range')
    let div = document.createElement('div')
    div.innerHTML = 'Hello, world!'
    container.appendChild(start)
    container.appendChild(div)
    container.appendChild(end)
    let root = createRangeRoot([start, end])

    root.render(<div>Hello, world!</div>)
    expect(container.innerHTML).toBe('<!--range--><div>Hello, world!</div><!--/range-->')
    expect(container.firstChild).toBe(start)
    expect(container.lastChild).toBe(end)
    expect(container.querySelector('div')).toBe(div)

    root.render(<div>Goodbye, world!</div>)
    expect(container.innerHTML).toBe('<!--range--><div>Goodbye, world!</div><!--/range-->')
    expect(container.firstChild).toBe(start)
    expect(container.lastChild).toBe(end)
    expect(container.querySelector('div')).toBe(div)
  })

  it('adds grows fragments', () => {
    let container = document.createElement('div')
    let start = document.createComment('range')
    let end = document.createComment('/range')
    let div = document.createElement('div')
    div.innerHTML = 'one'
    container.appendChild(start)
    container.appendChild(div)
    container.appendChild(end)
    let root = createRangeRoot([start, end])

    root.render(
      <>
        <div>one</div>
      </>,
    )
    expect(container.innerHTML).toBe('<!--range--><div>one</div><!--/range-->')
    expect(container.firstChild).toBe(start)
    expect(container.lastChild).toBe(end)
    expect(container.querySelector('div')).toBe(div)

    root.render(
      <>
        <div>one</div>
        <div>two</div>
      </>,
    )
    expect(container.innerHTML).toBe('<!--range--><div>one</div><div>two</div><!--/range-->')
    expect(container.firstChild).toBe(start)
    expect(container.lastChild).toBe(end)
    expect(container.querySelector('div')).toBe(div)
  })

  it('updates components', () => {
    let container = document.createElement('div')
    let start = document.createComment('range')
    let end = document.createComment('/range')
    let div = document.createElement('div')
    div.innerHTML = '1'
    container.appendChild(start)
    container.appendChild(div)
    container.appendChild(end)
    let root = createRangeRoot([start, end])

    let capturedUpdate = () => {}
    function App(this: Remix.Handle) {
      let count = 1
      capturedUpdate = () => {
        count++
        this.render()
      }
      return () => (
        <>
          {Array.from({ length: count }).map((_, i) => (
            <div>{i}</div>
          ))}
        </>
      )
    }

    root.render(<App />)
    expect(container.innerHTML).toBe('<!--range--><div>0</div><!--/range-->')
    expect(container.querySelector('div')).toBe(div)

    capturedUpdate()
    root.flush()
    expect(container.innerHTML).toBe('<!--range--><div>0</div><div>1</div><!--/range-->')
  })

  it('replaces nodes at the end', () => {
    let container = document.createElement('div')
    let start = document.createComment('range')
    let end = document.createComment('/range')
    let div = document.createElement('div')
    div.innerHTML = 'one'
    container.appendChild(start)
    container.appendChild(div)
    container.appendChild(end)
    let root = createRangeRoot([start, end])

    root.render(
      <>
        <div>one</div>
        <div>two</div>
      </>,
    )
    expect(container.innerHTML).toBe('<!--range--><div>one</div><div>two</div><!--/range-->')
    expect(container.firstChild).toBe(start)
    expect(container.lastChild).toBe(end)
    expect(container.querySelector('div')).toBe(div)

    root.render(
      <>
        <div>one</div>
        <main>main</main>
      </>,
    )
    expect(container.innerHTML).toBe('<!--range--><div>one</div><main>main</main><!--/range-->')
    expect(container.firstChild).toBe(start)
    expect(container.lastChild).toBe(end)
    expect(container.querySelector('div')).toBe(div)
  })

  it('updates nested children', () => {
    let container = document.createElement('div')
    let start = document.createComment('range')
    let end = document.createComment('/range')
    let div = document.createElement('div')
    div.innerHTML = '<span>0</span>'
    container.appendChild(start)
    container.appendChild(div)
    container.appendChild(end)
    let root = createRangeRoot([start, end])

    let capturedUpdate = () => {}
    function Nested(this: Remix.Handle) {
      let count = 0
      capturedUpdate = () => {
        count++
        this.render()
      }
      return () => <span>{count}</span>
    }

    function App(this: Remix.Handle) {
      return () => (
        <div>
          <Nested />
        </div>
      )
    }

    root.render(<App />)
    expect(container.innerHTML).toBe('<!--range--><div><span>0</span></div><!--/range-->')
    expect(container.querySelector('div')).toBe(div)

    capturedUpdate()
    root.flush()
    expect(container.innerHTML).toBe('<!--range--><div><span>1</span></div><!--/range-->')
  })

  it('works w/o hydration', () => {
    let container = document.createElement('div')
    let start = document.createComment('range')
    let end = document.createComment('/range')
    container.appendChild(start)
    container.appendChild(end)
    let root = createRangeRoot([start, end])
    root.render(<div>Hello, world!</div>)
    expect(container.innerHTML).toBe('<!--range--><div>Hello, world!</div><!--/range-->')
    expect(container.firstChild).toBe(start)
    expect(container.lastChild).toBe(end)
  })
})
