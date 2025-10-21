import { getOrInsertComputed, isArrayEqual } from 'radashi'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Fragment, Remix } from './remix.js'
import type { VNode } from './vnode.ts'

export const dirtyNodes = new WeakSet<Node>()

type ReactElement = React.ReactElement<{ children?: React.ReactNode[] }>

const reactComponentTypes = new WeakMap<Function, React.ComponentClass<any>>()
const reactComponents = new WeakMap<Remix.Handle, React.Component<any, any>>()
const reactElements = new WeakMap<Node, ReactElement>()

type RemixReactComponentProps = {
  children: React.ReactNode
}

export class RemixComponent extends React.Component<
  RemixReactComponentProps,
  RemixReactComponentProps
> {
  constructor(props: RemixReactComponentProps) {
    super(props)
    this.state = {
      children: props.children,
    }
  }
  shouldComponentUpdate() {
    return false
  }
  render() {
    return this.state.children
  }
}

export function renderComponentHook(
  handle: Remix.Handle,
  currContent: VNode,
  next: VNode.Component,
  domParent: HTMLElement | SVGElement,
  frame: Remix.FrameHandle,
  scheduler: any,
  vParent: VNode | VNode.Root,
  anchor: any,
  cursor: any,
) {
  let reactComponent = reactComponents.get(handle)
  if (reactComponent) {
    // reactComponent.setState({
    //   children: [],
    // })
    reactComponent.state = {
      children: getReactNode(next._content),
    }
  } else {
    const Component = getOrInsertComputed(
      reactComponentTypes,
      next.type,
      () => {
        const typeName = next.type.name
        const { [typeName]: Component } = {
          [typeName]: class extends RemixComponent {},
        }
        reactComponentTypes.set(next.type, Component)
        return Component
      },
    )
    reactComponent = new Component({
      children: getReactNode(next._content),
    })
    reactComponents.set(handle, reactComponent)
  }

  if (isRootNode(vParent)) {
    console.log(renderToStaticMarkup(reactComponent.render()))
  }
}

function isRootNode(node: VNode | VNode.Root): node is VNode.Root {
  return (
    typeof node.type === 'symbol' &&
    node.type.toString() === 'Symbol(ROOT_VNODE)'
  )
}

function isTextNode(node: VNode): node is VNode.Text {
  return (
    typeof node.type === 'symbol' &&
    node.type.toString() === 'Symbol(TEXT_NODE)'
  )
}

function getReactNode(node: VNode): React.ReactNode {
  if (isTextNode(node)) {
    return node._text
  }

  if (typeof node.type === 'function') {
    const Component = reactComponentTypes.get(node.type)
    if (Component) {
      return React.createElement(Component, {}, getReactNode(node._content))
    }
    if (node.type === Fragment) {
      return React.createElement(
        React.Fragment,
        {},
        ...node._children.map(getReactNode),
      )
    }
    return null // Unknown component type.
  }

  const children = node._children
  const reactChildren = children.length
    ? children.map(getReactNode)
    : (children as [])

  let reactElement = reactElements.get(node._dom)
  if (
    !reactElement ||
    dirtyNodes.has(node._dom) ||
    (reactElement.props.children &&
      isArrayEqual(reactElement.props.children, reactChildren))
  ) {
    // TODO: events
    reactElement = React.createElement(
      node.type,
      getReactProps(node.props),
      ...reactChildren,
    )
    reactElements.set(node._dom, reactElement)
  }
  return reactElement
}

function getReactProps({
  class: classProp,
  on,
  children,
  ...props
}: Record<string, any>) {
  if (classProp) {
    props.className = classProp
  }
  return props
}
