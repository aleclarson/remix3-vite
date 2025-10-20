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
  'Text',
]

const prelude = dedent`
  import { parseHTML } from 'linkedom';
  import { injectEventSupport, getEventListeners } from './events';
  const { document, ${classes.join(', ')} } = parseHTML('<html></html>');
  injectEventSupport({ EventTarget });
  export { document, ${classes.join(', ')}, getEventListeners };\n
`

fs.writeFileSync(
  'src/remix.js',
  prelude.replace(/\n+/g, ' ') + remixBundle.outputFiles[0].text,
)
fs.writeFileSync(
  'src/remix.d.ts',
  `/// <reference lib="dom" />\nexport * from "@remix-run/dom"; export * from "@remix-run/events"; export const document: Document; ${classes.map((c) => `export const ${c}: typeof globalThis.${c}`).join('; ')}; export { getEventListeners } from './events.ts';`,
)
