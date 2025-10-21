import { createElement } from "./remix.js";
export { Fragment } from "./remix.js";
export function jsx(type, props, key) {
    return jsxAdapter(type, props, key);
}
export function jsxs(type, props, key) {
    return jsxAdapter(type, props, key);
}
export function jsxDEV(type, props, key) {
    return jsxAdapter(type, props, key);
}
function jsxAdapter(type, props, key) {
    if (key !== undefined) {
        props = { ...props, key };
    }
    return createElement(type, props);
}
