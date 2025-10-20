import { type EventContainer, type EventDescriptor } from '@remix-run/events';
import type { ComponentHandle, Remix } from './component.ts';
import { Catch, Fragment, Frame } from './component.ts';
declare module './component.ts' {
    namespace Remix {
        type VirtualRoot = {
            render: (element: Remix.RemixNode) => void;
            remove: () => void;
            flush: () => void;
        };
        type VirtualRootOptions = {
            vParent?: VNode;
            frame?: Remix.FrameHandle;
            scheduler?: Scheduler;
        };
    }
}
declare const TEXT_NODE: unique symbol;
declare let connect: <ECurrentTarget extends EventTarget = EventTarget>(handler: import("@remix-run/events").EventHandler<CustomEvent<null>, ECurrentTarget>, options?: AddEventListenerOptions) => EventDescriptor<ECurrentTarget>;
declare let disconnect: <ECurrentTarget extends EventTarget = EventTarget>(handler: import("@remix-run/events").EventHandler<CustomEvent<null>, ECurrentTarget>, options?: AddEventListenerOptions) => EventDescriptor<ECurrentTarget>;
export { connect, disconnect };
type VNodeType = typeof ROOT_VNODE | string | Function | typeof TEXT_NODE | typeof Fragment | typeof Catch | typeof Frame;
export type VNode<T extends VNodeType = VNodeType> = {
    type: T;
    props?: Remix.ElementProps;
    key?: Remix.Key;
    _parent?: VNode;
    _children?: VNode[];
    _dom?: unknown;
    _events?: EventContainer;
    _text?: string;
    _handle?: ComponentHandle;
    _id?: string;
    _content?: VNode;
    _fallback?: ((error: unknown) => Remix.RemixNode) | Remix.RemixNode;
    _added?: VNode[];
    _tripped?: boolean;
};
type CommittedComponentNode = VNode & {
    type: Function;
    props: Remix.ElementProps;
    _content: VNode;
    _handle: ComponentHandle;
};
type EmptyFn = () => void;
export type Scheduler = ReturnType<typeof createScheduler>;
export declare function createScheduler(): {
    enqueue(vnode: CommittedComponentNode, domParent: ParentNode, anchor?: Node): void;
    enqueueTasks(newTasks: EmptyFn[]): void;
    dequeue(): void;
};
declare const ROOT_VNODE: unique symbol;
export declare function createRangeRoot([start, end]: [Node, Node], options?: Remix.VirtualRootOptions): Remix.VirtualRoot;
export declare function createRoot(container: HTMLElement, options?: Remix.VirtualRootOptions): Remix.VirtualRoot;
export declare function toVNode(node: Remix.RemixNode): VNode;
export declare function diffVNodes(curr: VNode | null, next: VNode, domParent: ParentNode, frame: Remix.FrameHandle, scheduler: Scheduler, vParent: VNode, anchor?: Node, rootCursor?: Node | null): void;
//# sourceMappingURL=vdom.d.ts.map