import { createEventType, events, } from '@remix-run/events';
import { createComponent, Catch, Fragment, Frame, createFrameHandle } from "./component.js";
import { invariant } from "./invariant.js";
import { processStyle, createStyleManager } from '@remix-run/style';
let fixmeIdCounter = 0;
const TEXT_NODE = Symbol('TEXT_NODE');
const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';
let [connect, createConnectEvent] = createEventType('rmx:connect');
let [disconnect, createDisconnectEvent] = createEventType('rmx:disconnect');
export { connect, disconnect };
// global so all roots share it
let styleCache = new Map();
let styleManager = typeof window !== 'undefined'
    ? createStyleManager()
    : null;
export function createScheduler() {
    let scheduled = new Map();
    let tasks = [];
    // TODO: optimize. this is O(k*h), should avoid climbing the tree for already
    // visited intermediate nodes
    function ancestorIsScheduled(vnode, batch) {
        let current = vnode._parent;
        while (current) {
            if (isCommittedComponentNode(current) && batch.has(current))
                return true;
            current = current._parent;
        }
        return false;
    }
    return {
        enqueue(vnode, domParent, anchor) {
            scheduled.set(vnode, [domParent, anchor]);
            queueMicrotask(() => this.dequeue());
        },
        enqueueTasks(newTasks) {
            tasks.push(...newTasks);
            queueMicrotask(() => this.dequeue());
        },
        dequeue() {
            let batch = new Map(scheduled);
            scheduled.clear();
            if (batch.size > 0) {
                let vnodes = Array.from(batch);
                for (let [vnode, [domParent, anchor]] of vnodes) {
                    if (ancestorIsScheduled(vnode, batch))
                        continue;
                    let handle = vnode._handle;
                    let curr = vnode._content;
                    let vParent = vnode._parent;
                    renderComponent(handle, curr, vnode, domParent, handle.frame, this, vParent, anchor);
                }
            }
            if (tasks.length > 0) {
                for (let task of tasks) {
                    task();
                }
                tasks = [];
            }
        },
    };
}
const ROOT_VNODE = Symbol('ROOT_VNODE');
export function createRangeRoot([start, end], options = {}) {
    let root = null;
    let frameStub = options.frame ?? createFrameHandle();
    let scheduler = options.scheduler ?? createScheduler();
    let container = end.parentNode;
    invariant(container, 'Expected parent node');
    invariant(end.parentNode === container, 'Boundaries must share parent');
    let hydrationCursor = start.nextSibling;
    return {
        render(element) {
            let vnode = toVNode(element);
            let vParent = { type: ROOT_VNODE };
            diffVNodes(root, vnode, container, frameStub, scheduler, vParent, end, hydrationCursor);
            root = vnode;
            hydrationCursor = null;
        },
        remove() {
            root = null;
        },
        flush() {
            scheduler.dequeue();
        },
    };
}
export function createRoot(container, options = {}) {
    let root = null;
    let frameStub = options.frame ?? createFrameHandle();
    let scheduler = options.scheduler ?? createScheduler();
    let hydrationCursor = container.innerHTML.trim() !== '' ? container.firstChild : undefined;
    return {
        render(element) {
            let vnode = toVNode(element);
            let vParent = { type: ROOT_VNODE };
            diffVNodes(root, vnode, container, frameStub, scheduler, vParent, undefined, hydrationCursor);
            root = vnode;
            hydrationCursor = undefined;
        },
        remove() {
            root = null;
        },
        flush() {
            scheduler.dequeue();
        },
    };
}
function flatMapChildrenToVNodes(node) {
    return 'children' in node.props
        ? Array.isArray(node.props.children)
            ? node.props.children.flat(Infinity).map(toVNode)
            : [toVNode(node.props.children)]
        : [];
}
export function toVNode(node) {
    if (node === null || node === undefined || typeof node === 'boolean') {
        return { type: TEXT_NODE, _text: '' };
    }
    if (typeof node === 'string' || typeof node === 'number' || typeof node === 'bigint') {
        return { type: TEXT_NODE, _text: String(node) };
    }
    if (Array.isArray(node)) {
        return { type: Fragment, _children: node.flat(Infinity).map(toVNode) };
    }
    if (node.type === Fragment) {
        return { type: Fragment, _children: flatMapChildrenToVNodes(node) };
    }
    if (node.type === Catch) {
        return {
            type: Catch,
            _fallback: node.props.fallback,
            _children: flatMapChildrenToVNodes(node),
        };
    }
    if (isRemixElement(node)) {
        let children = flatMapChildrenToVNodes(node);
        return { type: node.type, props: node.props, _children: children };
    }
    invariant(false, 'Unexpected RemixNode');
}
export function diffVNodes(curr, next, domParent, frame, scheduler, vParent, anchor, rootCursor) {
    next._parent = vParent; // set parent for initial render context lookups
    // new
    if (curr === null) {
        insert(next, domParent, frame, scheduler, vParent, anchor, rootCursor);
        return;
    }
    if (curr.type !== next.type) {
        replace(curr, next, domParent, frame, scheduler, vParent, anchor);
        return;
    }
    if (isCommittedTextNode(curr) && isTextNode(next)) {
        diffText(curr, next, scheduler, vParent);
        return;
    }
    if (isCommittedHostNode(curr) && isHostNode(next)) {
        diffHost(curr, next, domParent, frame, scheduler, vParent);
        return;
    }
    if (isCommittedComponentNode(curr) && isComponentNode(next)) {
        diffComponent(curr, next, frame, scheduler, domParent, vParent);
        return;
    }
    if (isFragmentNode(curr) && isFragmentNode(next)) {
        diffChildren(curr._children, next._children, domParent, frame, scheduler, vParent, undefined, anchor);
        return;
    }
    if (isCatchNode(curr) && isCatchNode(next)) {
        diffCatch(curr, next, domParent, frame, scheduler, vParent);
        return;
    }
    if (curr.type === Frame && next.type === Frame) {
        throw new Error('TODO: Frame diff not implemented');
    }
    invariant(false, 'Unexpected diff case');
}
function diffCatch(curr, next, domParent, frame, scheduler, vParent) {
    if (curr._tripped) {
        replace(curr, next, domParent, frame, scheduler, vParent);
        return;
    }
    let added = [];
    try {
        for (let i = 0; i < curr._children.length; i++) {
            let child = curr._children[i];
            diffVNodes(child, next._children[i], domParent, frame, scheduler, vParent);
            added.unshift(child);
        }
        commitCatch(curr, { _parent: vParent, _tripped: false, _added: added });
    }
    catch (e) {
        for (let child of added) {
            remove(child, domParent, scheduler);
        }
        let fallbackNode = getCatchFallback(next, e);
        let anchor = findFirstDomAnchor(curr) || findNextSiblingDomAnchor(curr, vParent) || undefined;
        insert(fallbackNode, domParent, frame, scheduler, vParent, anchor);
        commitCatch(curr, { _parent: vParent, _tripped: true, _added: [fallbackNode] });
        dispatchError(e);
    }
}
function replace(curr, next, domParent, frame, scheduler, vParent, anchor) {
    anchor =
        anchor || findFirstDomAnchor(curr) || findNextSiblingDomAnchor(curr, vParent) || undefined;
    insert(next, domParent, frame, scheduler, vParent, anchor);
    remove(curr, domParent, scheduler);
}
function diffHost(curr, next, domParent, frame, scheduler, vParent) {
    diffChildren(curr._children, next._children, curr._dom, frame, scheduler, next);
    diffHostProps(curr.props, next.props, curr._dom);
    let extras = { _dom: curr._dom, _parent: vParent, _events: curr._events };
    commitHost(next, extras, scheduler, domParent, frame);
    return;
}
function diffCssProp(curr, next, dom) {
    let prevClassName = curr.css ? processStyle(curr.css, styleCache).className : '';
    let { className, css } = next.css
        ? processStyle(next.css, styleCache)
        : { className: '', css: '' };
    if (prevClassName === className)
        return;
    if (prevClassName) {
        dom.classList.remove(prevClassName);
        styleManager.remove(prevClassName);
    }
    if (css && className) {
        dom.classList.add(className);
        styleManager.insert(className, css);
    }
}
function diffHostProps(curr, next, dom) {
    let isSvg = dom.namespaceURI === SVG_NS;
    if (next.css || curr.css) {
        diffCssProp(curr, next, dom);
    }
    // Removals
    for (let name in curr) {
        if (isFrameworkProp(name))
            continue;
        if (!(name in next) || next[name] == null) {
            // Prefer property clearing when applicable (align with Preact)
            if (canUseProperty(dom, name, isSvg)) {
                try {
                    dom[name] = '';
                    continue;
                }
                catch { }
            }
            let { ns, attr } = normalizePropName(name, isSvg);
            if (ns)
                dom.removeAttributeNS(ns, attr);
            else
                dom.removeAttribute(attr);
        }
    }
    // Additions/updates
    for (let name in next) {
        if (isFrameworkProp(name))
            continue;
        let nextValue = next[name];
        if (nextValue == null)
            continue;
        let prevValue = curr[name];
        if (prevValue !== nextValue) {
            let { ns, attr } = normalizePropName(name, isSvg);
            // Object style: serialize to attribute for now
            if (attr === 'style' &&
                typeof nextValue === 'object' &&
                nextValue &&
                !Array.isArray(nextValue)) {
                dom.setAttribute('style', serializeStyleObject(nextValue));
                continue;
            }
            // Prefer property assignment when possible (HTML only, not SVG)
            if (canUseProperty(dom, name, isSvg)) {
                try {
                    dom[name] = nextValue == null ? '' : nextValue;
                    continue;
                }
                catch { }
            }
            // Attribute path
            if (typeof nextValue === 'function') {
                // Never serialize functions as attribute values
                continue;
            }
            let isAriaOrData = name.startsWith('aria-') || name.startsWith('data-');
            if (nextValue != null && (nextValue !== false || isAriaOrData)) {
                // Special-case popover: true => presence only
                let attrValue = name === 'popover' && nextValue === true ? '' : String(nextValue);
                if (ns)
                    dom.setAttributeNS(ns, attr, attrValue);
                else
                    dom.setAttribute(attr, attrValue);
            }
            else {
                if (ns)
                    dom.removeAttributeNS(ns, attr);
                else
                    dom.removeAttribute(attr);
            }
        }
    }
}
// Preact excludes certain attributes from the property path due to browser quirks
const ATTRIBUTE_FALLBACK_NAMES = new Set([
    'width',
    'height',
    'href',
    'list',
    'form',
    'tabIndex',
    'download',
    'rowSpan',
    'colSpan',
    'role',
    'popover',
]);
// Determine if we should use the property path for a given name.
// Also acts as a type guard to allow bracket assignment without casts.
function canUseProperty(dom, name, isSvg) {
    if (isSvg)
        return false;
    if (ATTRIBUTE_FALLBACK_NAMES.has(name))
        return false;
    return name in dom;
}
function isCommittedCatchNode(node) {
    return isCatchNode(node) && node._added != undefined && node._tripped != null;
}
function isComponentNode(node) {
    return typeof node.type === 'function' && node.type !== Frame;
}
function isCommittedComponentNode(node) {
    return isComponentNode(node) && node._content !== undefined;
}
function isFrameworkProp(name) {
    return name === 'children' || name === 'key' || name === 'on' || name === 'css';
}
const NUMERIC_CSS_PROPS = new Set([
    'z-index',
    'opacity',
    'flex-grow',
    'flex-shrink',
    'flex-order',
    'grid-area',
    'grid-row',
    'grid-column',
    'font-weight',
    'line-height',
    'order',
    'orphans',
    'widows',
    'zoom',
    'columns',
    'column-count',
]);
// TODO: would rather actually diff el.style object directly instead of writing
// to the style attribute
function serializeStyleObject(style) {
    let parts = [];
    for (let [key, value] of Object.entries(style)) {
        if (value == null)
            continue;
        if (typeof value === 'boolean')
            continue;
        if (typeof value === 'number' && !Number.isFinite(value))
            continue;
        let cssKey = key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
        let shouldAppendPx = typeof value === 'number' &&
            value !== 0 &&
            !NUMERIC_CSS_PROPS.has(cssKey) &&
            !cssKey.startsWith('--');
        let cssValue = shouldAppendPx
            ? `${value}px`
            : Array.isArray(value)
                ? value.join(', ')
                : String(value);
        parts.push(`${cssKey}: ${cssValue};`);
    }
    return parts.join(' ');
}
function isSvgContext(vParent) {
    // Walk up the vnode tree to determine if we're within an SVG subtree.
    // The nearest 'foreignObject' switches back to HTML context.
    let current = vParent;
    while (current) {
        if (typeof current.type === 'string') {
            if (current.type === 'foreignObject')
                return false;
            if (current.type === 'svg')
                return true;
        }
        current = current._parent;
    }
    return false;
}
function normalizePropName(name, isSvg) {
    // aria-/data- pass through
    if (name.startsWith('aria-') || name.startsWith('data-'))
        return { attr: name };
    // DOM property -> HTML mappings
    if (!isSvg) {
        if (name === 'className')
            return { attr: 'class' };
        if (name === 'htmlFor')
            return { attr: 'for' };
        if (name === 'tabIndex')
            return { attr: 'tabindex' };
        if (name === 'acceptCharset')
            return { attr: 'accept-charset' };
        if (name === 'httpEquiv')
            return { attr: 'http-equiv' };
        return { attr: name.toLowerCase() };
    }
    // SVG namespaced specials
    if (name === 'xlinkHref')
        return { ns: XLINK_NS, attr: 'xlink:href' };
    if (name === 'xmlLang')
        return { ns: XML_NS, attr: 'xml:lang' };
    if (name === 'xmlSpace')
        return { ns: XML_NS, attr: 'xml:space' };
    // SVG preserved-case exceptions
    if (name === 'viewBox' ||
        name === 'preserveAspectRatio' ||
        name === 'gradientUnits' ||
        name === 'gradientTransform' ||
        name === 'patternUnits' ||
        name === 'patternTransform' ||
        name === 'clipPathUnits' ||
        name === 'maskUnits' ||
        name === 'maskContentUnits') {
        return { attr: name };
    }
    // General SVG: kebab-case
    return { attr: camelToKebab(name) };
}
function camelToKebab(input) {
    return input
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .replace(/_/g, '-')
        .toLowerCase();
}
function diffText(curr, next, scheduler, vParent) {
    if (curr._text !== next._text) {
        curr._dom.textContent = next._text;
    }
    commitText(next, { _dom: curr._dom, _parent: vParent });
}
function logHydrationMismatch(...msg) {
    console.error('Hydration mismatch:', ...msg);
}
function insert(node, domParent, frame, scheduler, vParent, anchor, cursor) {
    node._parent = vParent; // set parent for initial render context lookups
    cursor = skipComments(cursor ?? null);
    let doInsert = anchor
        ? (dom) => domParent.insertBefore(dom, anchor)
        : (dom) => domParent.appendChild(dom);
    if (isTextNode(node)) {
        if (cursor instanceof Text) {
            commitText(node, { _dom: cursor, _parent: vParent });
            // correct hydration mismatch
            if (cursor.data !== node._text) {
                logHydrationMismatch('text mismatch', cursor.data, node._text);
                cursor.data = node._text;
            }
            return cursor.nextSibling;
        }
        let dom = document.createTextNode(node._text);
        commitText(node, { _dom: dom, _parent: vParent });
        doInsert(dom);
        return cursor;
    }
    if (isHostNode(node)) {
        if (cursor instanceof Element) {
            if (cursor.tagName.toLowerCase() === node.type) {
                // FIXME: hydrate css prop
                // correct hydration mismatches
                diffHostProps({}, node.props, cursor);
                commitHost(node, { _dom: cursor, _parent: vParent }, scheduler, domParent, frame);
                let childCursor = cursor.firstChild;
                // FIXME: this breaks other tests
                // if (node._children.length > 1 && node._children.every(isTextNode)) {
                //   // special case <span>Text {text}</span> comes as single node from server
                //   return cursor.nextSibling
                // }
                let excess = diffChildren(null, node._children, cursor, frame, scheduler, node, childCursor);
                if (excess) {
                    logHydrationMismatch('excess', excess);
                }
                return cursor.nextSibling;
            }
            else {
                logHydrationMismatch('tag', cursor.tagName.toLowerCase(), node.type);
                cursor.remove();
                cursor = undefined; // stop hydration for this tree
            }
        }
        let inSvg = isSvgContext(vParent) || node.type === 'svg';
        let dom = inSvg
            ? document.createElementNS(SVG_NS, node.type)
            : document.createElement(node.type);
        diffHostProps({}, node.props, dom);
        diffChildren(null, node._children, dom, frame, scheduler, node);
        commitHost(node, { _dom: dom, _parent: vParent }, scheduler, domParent, frame);
        doInsert(dom);
        return cursor;
    }
    if (isFragmentNode(node)) {
        // Insert fragment children in order before the same anchor
        for (let child of node._children) {
            cursor = insert(child, domParent, frame, scheduler, vParent, anchor, cursor);
        }
        return cursor;
    }
    if (isCatchNode(node)) {
        let added = [];
        try {
            // insert like a fragment
            for (let child of node._children) {
                insert(child, domParent, frame, scheduler, node, anchor);
                added.unshift(child);
            }
            commitCatch(node, { _parent: vParent, _tripped: false, _added: added });
        }
        catch (e) {
            let fallback = getCatchFallback(node, e);
            for (let child of added) {
                remove(child, domParent, scheduler);
            }
            insert(fallback, domParent, frame, scheduler, node, anchor);
            commitCatch(node, { _parent: vParent, _tripped: true, _added: [fallback] });
            dispatchError(e);
        }
        return;
    }
    if (isComponentNode(node)) {
        diffComponent(null, node, frame, scheduler, domParent, vParent, anchor, cursor);
        return cursor;
    }
    if (node.type === Frame) {
        throw new Error('TODO: Frame insert not implemented');
    }
    if (node.type === Catch) {
        throw new Error('TODO: Catch insert not implemented');
    }
    invariant(false, 'Unexpected node type');
}
function renderComponent(handle, currContent, next, domParent, frame, scheduler, vParent, anchor, cursor) {
    let normalizedOn = next.props.on
        ? Array.isArray(next.props.on)
            ? next.props.on
            : [next.props.on]
        : undefined;
    let props = normalizedOn ? { ...next.props, on: normalizedOn } : next.props;
    let [element, tasks] = handle.render(props);
    let content = toVNode(element);
    diffVNodes(currContent, content, domParent, frame, scheduler, next, anchor, cursor);
    let committed = commitComponent(next, { _content: content, _handle: handle, _parent: vParent });
    handle.setScheduleUpdate(() => {
        scheduler.enqueue(committed, domParent, anchor);
    });
    scheduler.enqueueTasks(tasks);
}
function diffComponent(curr, next, frame, scheduler, domParent, vParent, anchor, cursor) {
    if (curr === null) {
        next._handle = createComponent({
            id: String(++fixmeIdCounter),
            frame,
            type: next.type,
            raise: (error) => {
                raise(error, next, domParent, frame, scheduler);
            },
            getContext: (type) => {
                return findContextFromAncestry(vParent, type);
            },
        });
        renderComponent(next._handle, null, next, domParent, frame, scheduler, vParent, anchor, cursor);
        return;
    }
    next._handle = curr._handle;
    let { _content, _handle } = curr;
    renderComponent(_handle, _content, next, domParent, frame, scheduler, vParent, anchor, cursor);
}
function findContextFromAncestry(node, type) {
    let current = node;
    while (current) {
        if (current.type === type && isComponentNode(current)) {
            return current._handle.getContextValue();
        }
        current = current._parent;
    }
    return undefined;
}
function remove(node, domParent, scheduler) {
    if (isCommittedTextNode(node)) {
        domParent.removeChild(node._dom);
        return;
    }
    if (isCommittedHostNode(node)) {
        node._dom.dispatchEvent(createDisconnectEvent({ bubbles: false }));
        domParent.removeChild(node._dom);
        let _events = node._events;
        if (_events) {
            // TODO: use abort controllers in @remix-run/events, won't need to manage cleanup
            scheduler.enqueueTasks([() => _events.cleanup()]);
        }
        return;
    }
    if (isFragmentNode(node)) {
        for (let child of node._children) {
            remove(child, domParent, scheduler);
        }
        return;
    }
    if (isCommittedComponentNode(node)) {
        remove(node._content, domParent, scheduler);
        let tasks = node._handle.remove();
        scheduler.enqueueTasks(tasks);
        return;
    }
    if (isFragmentNode(node)) {
        for (let child of node._children) {
            remove(child, domParent, scheduler);
        }
        return;
    }
    if (isCommittedCatchNode(node)) {
        for (let child of node._added) {
            remove(child, domParent, scheduler);
        }
        return;
    }
}
// TODO: optimize later
function diffChildren(curr, next, domParent, frame, scheduler, vParent, cursor, anchor) {
    if (curr === null) {
        for (let node of next) {
            cursor = insert(node, domParent, frame, scheduler, vParent, anchor, cursor);
        }
        return cursor;
    }
    let currLength = curr.length;
    let nextLength = next.length;
    for (let i = 0; i < nextLength; i++) {
        let currentNode = i < currLength ? curr[i] : null;
        diffVNodes(currentNode, next[i], domParent, frame, scheduler, vParent, anchor, cursor);
    }
    if (currLength > nextLength) {
        for (let i = nextLength; i < currLength; i++) {
            let node = curr[i];
            if (node)
                remove(node, domParent, scheduler);
        }
    }
}
function commitText(node, extras) {
    return Object.assign(node, extras);
}
function commitComponent(node, extras) {
    return Object.assign(node, extras);
}
function commitCatch(node, extras) {
    return Object.assign(node, extras);
}
function commitHost(node, extras, scheduler, domParent, frame) {
    let _dom = extras._dom;
    let _events = extras._events || events(_dom);
    let on = node.props.on ? (Array.isArray(node.props.on) ? node.props.on : [node.props.on]) : [];
    let raiseError = (error) => raise(error, node, domParent, frame, scheduler);
    let wrapped = wrapEvents(on, raiseError);
    scheduler.enqueueTasks([() => _events.on(wrapped)]);
    if (!_dom.isConnected) {
        scheduler.enqueueTasks([() => _dom.dispatchEvent(createConnectEvent({ bubbles: false }))]);
    }
    extras._events = _events;
    return Object.assign(node, extras);
}
function dispatchError(error) {
    // TODO: dispatch on root target
    // console.error(error)
}
function getCatchFallback(vnode, error) {
    let content = typeof vnode._fallback === 'function' ? vnode._fallback(error) : vnode._fallback;
    return toVNode(content);
}
function raise(error, descendant, domParent, frame, scheduler) {
    let catchBoundary = findCatchBoundary(descendant);
    if (catchBoundary) {
        let content = getCatchFallback(catchBoundary, error);
        let anchor = findFirstDomAnchor(catchBoundary) ||
            findNextSiblingDomAnchor(catchBoundary, catchBoundary._parent) ||
            undefined;
        insert(content, domParent, frame, scheduler, catchBoundary, anchor);
        for (let child of catchBoundary._added) {
            remove(child, domParent, scheduler);
        }
        commitCatch(catchBoundary, { _tripped: true, _added: [content] });
    }
    else {
        dispatchError(error);
    }
}
function findCatchBoundary(vnode) {
    let current = vnode;
    while (current) {
        if (isCommittedCatchNode(current))
            return current;
        current = current._parent;
    }
    return null;
}
function wrapEvents(on, raise) {
    if (!Array.isArray(on))
        on = [on];
    return on.map((descriptor) => {
        let handler = descriptor.handler;
        Object.assign(descriptor, {
            handler: (event, signal) => {
                try {
                    return handler(event, signal);
                }
                catch (error) {
                    raise(error);
                }
            },
        });
        return descriptor;
    });
}
function isFragmentNode(node) {
    return node.type === Fragment;
}
function isCatchNode(node) {
    return node.type === Catch;
}
function isTextNode(node) {
    return node.type === TEXT_NODE;
}
function isCommittedTextNode(node) {
    return isTextNode(node) && node._dom instanceof Text;
}
function isHostNode(node) {
    return typeof node.type === 'string';
}
function isCommittedHostNode(node) {
    return isHostNode(node) && node._dom instanceof Element;
}
function isRemixElement(node) {
    return typeof node === 'object' && node !== null && '$rmx' in node;
}
function findFirstDomAnchor(node) {
    if (!node)
        return null;
    if (isCommittedTextNode(node))
        return node._dom;
    if (isCommittedHostNode(node))
        return node._dom;
    if (isCommittedComponentNode(node))
        return findFirstDomAnchor(node._content);
    if (isFragmentNode(node)) {
        for (let child of node._children) {
            let dom = findFirstDomAnchor(child);
            if (dom)
                return dom;
        }
    }
    if (isCommittedCatchNode(node)) {
        for (let child of node._added) {
            let dom = findFirstDomAnchor(child);
            if (dom)
                return dom;
        }
    }
    return null;
}
function findNextSiblingDomAnchor(curr, vParent) {
    if (!vParent || !Array.isArray(vParent._children))
        return null;
    let children = vParent._children;
    let idx = children.indexOf(curr);
    if (idx === -1)
        return null;
    for (let i = idx + 1; i < children.length; i++) {
        let dom = findFirstDomAnchor(children[i]);
        if (dom)
            return dom;
    }
    return null;
}
function skipComments(cursor) {
    while (cursor && cursor.nodeType === Node.COMMENT_NODE) {
        cursor = cursor.nextSibling;
    }
    return cursor;
}
//# sourceMappingURL=vdom.js.map