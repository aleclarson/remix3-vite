import esbuild from 'esbuild'
import fs from 'node:fs'
import URL from 'node:url'
import { dedent } from 'radashi'

const remixBundle = await esbuild.build({
  entryPoints: [URL.fileURLToPath(import.meta.resolve('./entry.js'))],
  bundle: true,
  splitting: false,
  format: 'esm',
  write: false,
  platform: 'node',
  outdir: 'dist',
})

const classes = [
  'CustomEvent',
  'Document',
  'Element',
  'Event',
  'EventTarget',
  'Node',
  'Text',
]

const prelude = dedent`
  import { parseHTML } from 'linkedom';
  import { injectEventSupport, getEventListeners } from './events';
  import { injectElementSpy } from './element';
  import { renderComponentHook } from './component';
  const { document, ${classes.join(', ')} } = parseHTML('<html></html>');
  injectEventSupport({ EventTarget });
  injectElementSpy({ Element, Node });
  export { document, ${classes.join(', ')}, createElement, getEventListeners, getAttributes, clearAttributes };\n
`

const renderComponentArgs =
  'handle, currContent, next, domParent, frame, scheduler, vParent, anchor, cursor'
const renderComponentRegex = new RegExp(
  String.raw`function renderComponent\(${renderComponentArgs}\) \{([\S\s]*?)\n\}`,
)

let foundRenderComponent = false
fs.writeFileSync(
  'src/remix.js',
  prelude.replace(/\n+/g, ' ') +
    remixBundle.outputFiles[0].text.replace(renderComponentRegex, (match) => {
      foundRenderComponent = true
      return (
        match.slice(0, -1) + `  renderComponentHook(${renderComponentArgs});\n}`
      )
    }),
)
if (!foundRenderComponent) {
  throw new Error('renderComponent not found')
}

fs.writeFileSync(
  'src/remix.d.ts',
  dedent`
    /// <reference lib="dom" />
    export * from "@remix-run/dom";
    export * from "@remix-run/events";
    export const document: Document;
    ${classes.map((c) => `export const ${c}: typeof globalThis.${c}`).join(';\n')};
    export const createElement: any;
    export { getEventListeners } from './events.ts';
    export { getAttributes, clearAttributes } from './attributes.ts';
  `,
)

const resolveThenReadFileSync = (path: string) => {
  return fs.readFileSync(URL.fileURLToPath(import.meta.resolve(path)), 'utf8')
}
const removeSourceMappingURL = (text: string) => {
  return text.replace(/\/\/#[^\n]+/g, '')
}

fs.writeFileSync(
  'src/jsx-runtime.js',
  removeSourceMappingURL(
    resolveThenReadFileSync('@remix-run/dom/jsx-runtime').replace(
      /lib\/component\.js/g,
      'remix.js',
    ),
  ),
)
fs.writeFileSync(
  'src/jsx-runtime.d.ts',
  'export * from "@remix-run/dom/jsx-runtime";',
)

fs.writeFileSync(
  'src/jsx-dev-runtime.js',
  removeSourceMappingURL(
    resolveThenReadFileSync('@remix-run/dom/jsx-dev-runtime'),
  ),
)
fs.writeFileSync(
  'src/jsx-dev-runtime.d.ts',
  'export * from "@remix-run/dom/jsx-dev-runtime";',
)
