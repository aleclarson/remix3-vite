import { getOrInsertComputed } from 'radashi'
import { dirtyNodes } from './component.ts'

const attributesByElement = new WeakMap<Element, Record<string, unknown>>()

export function getAttributes(element: Element) {
  return attributesByElement.get(element) || {}
}

const newAttributeStore = () => Object.create(null)
const storeAttribute = (element: Element, name: string, value: unknown) => {
  const attributes = getOrInsertComputed(
    attributesByElement,
    element,
    newAttributeStore,
  )
  attributes[name] = value
}

export function injectElementSpy({
  Element,
  Node,
}: {
  Element: typeof globalThis.Element
  Node: typeof globalThis.Node
}) {
  const { setAttribute, removeAttribute } = Element.prototype

  Element.prototype.setAttribute = function (name, value) {
    dirtyNodes.add(this)
    // storeAttribute(element, name, value)

    return setAttribute.call(this, name, value)
  }

  Element.prototype.removeAttribute = function (name) {
    dirtyNodes.add(this)

    return removeAttribute.call(this, name)
  }

  const { appendChild, insertBefore } = Node.prototype

  Node.prototype.appendChild = function (child) {
    dirtyNodes.add(this)

    return appendChild.call(this, child) as typeof child
  }

  Node.prototype.insertBefore = function (child, before) {
    dirtyNodes.add(this.parentNode!)

    return insertBefore.call(this, child, before) as typeof child
  }
}
