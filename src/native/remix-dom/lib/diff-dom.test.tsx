import { describe, it, expect } from 'vitest'
import { invariant } from './invariant.ts'
import { diffDom } from './diff-dom.ts'

describe('diffDom', () => {
  describe('basic diffing', () => {
    it('diffs text nodes', () => {
      let container = document.createElement('div')
      container.innerHTML = 'Hello, world!'
      let text = container.firstChild
      invariant(text)
      diffDom(container.childNodes, 'Goodbye, world!')
      expect(container.innerHTML).toBe('Goodbye, world!')
      expect(container.firstChild).toBe(text)
    })

    it('diffs element nodes', () => {
      let container = document.createElement('div')
      container.innerHTML = '<div>Hello, world!</div>'
      let div = container.firstChild
      invariant(div)
      diffDom(container.childNodes, '<div>Goodbye, world!</div>')
      expect(container.innerHTML).toBe('<div>Goodbye, world!</div>')
      expect(container.firstChild).toBe(div)
    })

    it('diffs element nodes with attributes', () => {
      let container = document.createElement('div')
      container.innerHTML = '<div id="hello">Hello, world!</div>'
      let div = container.firstChild
      invariant(div)
      diffDom(container.childNodes, '<div id="goodbye">Goodbye, world!</div>')
      expect(container.innerHTML).toBe('<div id="goodbye">Goodbye, world!</div>')
      expect(container.firstChild).toBe(div)
    })

    it('diffs children', () => {
      let container = document.createElement('div')
      container.innerHTML = '<div><span>Hello, world!</span></div>'
      let div = container.firstChild
      invariant(div)
      let span = container.querySelector('span')
      invariant(span)

      diffDom(container.childNodes, '<div><span>Goodbye, world!</span></div>')

      expect(container.innerHTML).toBe('<div><span>Goodbye, world!</span></div>')
      expect(container.firstChild).toBe(div)
      expect(container.querySelector('span')).toBe(span)
    })

    it('replaces children elements', () => {
      let container = document.createElement('div')
      container.innerHTML = '<div><span>Hello, world!</span></div>'
      let div = container.firstChild
      invariant(div)

      diffDom(container.childNodes, '<div><p>Goodbye, world!</p></div>')

      expect(container.innerHTML).toBe('<div><p>Goodbye, world!</p></div>')
      expect(container.firstChild).toBe(div)
    })
  })

  describe('comments', () => {
    it('retains comments', () => {
      let container = document.createElement('div')
      container.innerHTML = '<!-- start --><div>hello</div><!-- end -->'
      let comment = container.firstChild
      invariant(comment)
      diffDom(container.childNodes, '<!-- start --><div>goodbye</div><!-- end -->')
      expect(container.innerHTML).toBe('<!-- start --><div>goodbye</div><!-- end -->')
      expect(container.firstChild === comment).toBe(true)
    })

    it('diffs comment data', () => {
      let container = document.createElement('div')
      container.innerHTML = '<!-- a --><div>hello</div><!-- z -->'
      let first = container.firstChild
      let last = container.lastChild
      invariant(first && last)
      diffDom(container.childNodes, '<!-- b --><div>hello</div><!-- y -->')
      expect(container.innerHTML).toBe('<!-- b --><div>hello</div><!-- y -->')
      expect(container.firstChild === first).toBe(true)
      expect(container.lastChild === last).toBe(true)
    })
  })

  describe('keyed diffs', () => {
    it.todo('retains keyed elements')
  })
})
