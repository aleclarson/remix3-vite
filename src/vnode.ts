import type { Remix } from './remix.js'

declare const ROOT_VNODE: unique symbol
declare const TEXT_NODE: unique symbol

export type VNode = VNode.Component | VNode.Element | VNode.Text

export declare namespace VNode {
  type Root = {
    type: typeof ROOT_VNODE
  }

  type Child = {
    _parent: VNode | Root | null
  }

  type Parent = Child & {
    _children: VNode[]
  }

  type Component = Parent & {
    type: Function
    props: Remix.ElementProps
    _handle: Remix.Handle
    _content: VNode
  }

  type Element = Parent & {
    type: string
    props: Remix.ElementProps
    _dom: HTMLElement | SVGElement | globalThis.Text
    _events: any
  }

  type Text = Child & {
    type: typeof TEXT_NODE
    _text: string
    _dom: globalThis.Text
  }
}
