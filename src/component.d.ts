import type { EventDescriptor } from '@remix-run/events';
export declare namespace Remix {
    /**
     * Any valid element type accepted by JSX or `createElement`.
     * - `string` for host elements (e.g., 'div')
     * - `Function` for user components
     */
    type ElementType = string | Function;
    /**
     * Generic bag of props passed to elements/components.
     * Consumers should define specific prop types on their components; this is the
     * renderer's normalized shape used throughout reconciler/SSR code.
     */
    type ElementProps = Record<string, any>;
    /**
     * A virtual element produced by JSX/`createElement` describing UI.  Carries a
     * `$rmx` brand used to distinguish it from plain objects at runtime.
     */
    interface RemixElement {
        type: ElementType;
        props: ElementProps;
        $rmx: true;
    }
    /**
     * Any single value Remix can render. Booleans render as empty text.
     */
    type Renderable = RemixElement | string | number | bigint | boolean | null | undefined;
    /**
     * Anything that Remix can render, including arrays of renderable values.
     * Particularly useful for `props.children`.
     *
     * ```tsx
     * function MyComponent({ children }: { children: RemixNode }) {}
     * ```
     */
    type RemixNode = Renderable | Renderable[];
    type Task = (signal: AbortSignal) => void;
    interface Handle<C = Record<string, never>> {
        /**
         * Stable identifier per component instance. Useful for HTML APIs like
         * htmlFor, aria-owns, etc. so consumers don't have to supply an id.
         */
        id: string;
        /**
         * Set and get values in an element tree for indirect ancestor/descendant
         * communication.
         */
        context: Context<C>;
        /**
         * Schedules an update for the component to render again.
         *
         * @param task A render task to run after the update completes
         */
        update(task?: Task): void;
        /**
         * Schedules a task to run after the next update.
         *
         * @param task
         */
        queueTask(task: Task): void;
        /**
         * Raises an error the closest Catch boundary. Useful when running outside
         * of a framework-controlled scope (ie outside of rendering or events).
         *
         * @param error The raised error
         *
         * @example
         * ```tsx
         * this.raise(new Error("Oops"))
         * ```
         */
        raise(error: unknown): void;
        /**
         * The component's closest frame
         */
        frame: FrameHandle;
        /**
         * A signal indicating the connected status of the component. When the
         * component is disconnected from the tree the signal will be aborted.
         * Useful for setup scope cleanup.
         *
         * @example Clear a timer
         * ```ts
         * function Clock() {
         *   let interval = setInterval(() => {
         *     if (this.signal.aborted) {
         *       clearInterval(interval)
         *       return
         *     }
         *     this.render()
         *   }, 1000)
         *   return () => <span>{new Date().toString()}</span>
         * }
         * ```
         *
         * Because signals are event targets, you can also add an event instead.
         * ```ts
         * function Clock() {
         *   let interval = setInterval(this.render)
         *   this.signal.addEventListener("abort", () => clearInterval(interval))
         *   return () => <span>{new Date().toString()}</span>
         * }
         * ```
         *
         * @discussion
         * You don't need to check both this.signal and a render/event signal as
         * render/event signals are aborted when the component disconnects
         */
        signal: AbortSignal;
    }
    /**
     * Default Handle context so types must be declared explicitly.
     */
    type NoContext = Record<string, never>;
    type Component<Context = NoContext, SetupProps = ElementProps, RenderProps = ElementProps> = (this: Handle<Context>, props: SetupProps) => RemixNode | ((props: RenderProps) => RemixNode);
    type ContextFrom<ComponentType> = ComponentType extends Component<infer Provided, any, any> ? Provided : ComponentType extends (this: Handle<infer Provided>, ...args: any[]) => any ? Provided : never;
    interface Context<C> {
        set(values: C): void;
        get<ComponentType>(component: ComponentType): ContextFrom<ComponentType>;
        get(component: ElementType | symbol): unknown | undefined;
    }
    type FrameContent = DocumentFragment | string;
    type FrameHandle = EventTarget & {
        reload(): Promise<void>;
        replace(content: FrameContent): Promise<void>;
    };
    interface FrameProps {
        name?: string;
        src: string;
        fallback?: Renderable;
        on?: EventDescriptor[];
    }
    type ComponentProps<T> = T extends {
        (props: infer Setup): infer R;
    } ? R extends (props: infer Render) => any ? Setup & Render : Setup : never;
    interface CatchProps {
        children?: RemixNode;
        fallback?: RemixNode | ((error: Error) => RemixNode);
    }
    interface FragmentProps {
        children?: RemixNode;
    }
    interface BuiltinElements {
        Catch: CatchProps;
        Fragment: FragmentProps;
        Frame: FrameProps;
    }
    type Key = string | number | bigint;
}
/**
 * Create a `RemixElement` (JSX runtime helper). Prefer JSX over calling this directly.
 */
export declare function createElement(type: Remix.ElementType, props: Remix.ElementProps, ...children: Remix.RemixNode[]): Remix.RemixElement;
type ComponentConfig = {
    id: string;
    type: Function;
    frame: Remix.FrameHandle;
    raise: (error: unknown) => void;
    getContext: (type: Remix.Component) => unknown;
};
export type ComponentHandle = ReturnType<typeof createComponent>;
export declare function createComponent<C = Remix.NoContext>(config: ComponentConfig): {
    render: (props: Remix.ElementProps) => [Remix.RemixNode, Array<() => void>];
    remove: () => (() => void)[];
    setScheduleUpdate: (_scheduleUpdate: (task?: Remix.Task) => void) => void;
    frame: Remix.FrameHandle;
    getContextValue: () => C | undefined;
};
export declare function Frame(this: Remix.Handle<Remix.FrameHandle>, _: Remix.FrameProps): null;
export declare function Fragment(_: Remix.FragmentProps): null;
export declare function Catch(_: Remix.CatchProps): null;
export declare function createFrameHandle(def?: Partial<{
    src: string;
    replace: Remix.FrameHandle['replace'];
    reload: Remix.FrameHandle['reload'];
}>): Remix.FrameHandle;
export {};
//# sourceMappingURL=component.d.ts.map