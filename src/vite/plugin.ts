import MagicString from 'magic-string'
import { join, relative } from 'node:path'
import { FetchHandler } from 'srvx'
import { NodeRequest, sendNodeResponse } from 'srvx/node'
import { Plugin } from 'vite'

export function remix3() {
  let projectRoot = ''
  return {
    name: 'remix3',
    configResolved(config) {
      projectRoot = config.root
    },
    configureServer(server) {
      server.watcher.on('change', (file) => {
        // HACK: This ensures the client updates when a non-hydrated component changes.
        server.ws.send({ type: 'full-reload', path: '*', triggeredBy: file })
      })
      const internalPaths = ['/@vite/client']
      server.middlewares.use(async (req, res, next) => {
        if (
          req.url &&
          (internalPaths.includes(req.url) ||
            /\.([mc]?[jt]sx?|css)\b/.test(req.url))
        ) {
          return next()
        }
        try {
          const { default: serve } = (await server.ssrLoadModule(
            '/src/serve.tsx',
          )) as {
            default: FetchHandler
          }
          let response = await serve(new NodeRequest({ req, res }))
          if (response && response.status !== 404) {
            if (response.headers.get('Content-Type') === 'text/html') {
              const originalHtml = await response.text()
              const url = req.url!

              let html = await server.transformIndexHtml(url, originalHtml)
              if (req.headers['x-remix-fragment'] === 'true') {
                html = html.match(/<body>(.*?)<\/body>/s)?.[1] || ''
              }

              response = new Response(html, response)
            }
            return sendNodeResponse(res, response)
          }
          next()
        } catch (error) {
          next(error)
        }
      })
    },
    resolveId(id) {
      if (id === '/@remix/main.ts') {
        return { id: join(__dirname, 'main.ts') }
      }
    },
    transform(code, id) {
      const queryIndex = id.indexOf('?')
      const filePath = queryIndex === -1 ? id : id.slice(0, queryIndex)
      if (!filePath.endsWith('.tsx') && !filePath.endsWith('.jsx')) {
        return null
      }
      if (!code.includes('import.meta.url')) {
        return null
      }
      if (
        !/import\s+{[^}]*\bhydrated\b[^}]*}\s+from\s+['"]@remix-run\/dom['"]/.test(
          code,
        )
      ) {
        return null
      }
      const assignmentPattern =
        /export\s+(?:const|let|var)\s+([A-Za-z0-9_$]+)(?:\s*:\s*[^=]+)?\s*=\s*hydrated\s*(?:<[^>]*>)?\s*\(\s*(import\.meta\.url)/g
      let match: RegExpExecArray | null = null
      let magic: MagicString | undefined
      const root = projectRoot || process.cwd()
      const relativePath = relative(root, filePath)
      const normalizedPath = (relativePath ? relativePath : '').replace(
        /\\/g,
        '/',
      )
      const moduleSpecifier = `/${normalizedPath}`
      while ((match = assignmentPattern.exec(code))) {
        const exportName = match[1]
        const importExpression = match[2]
        const tokenStart = match.index + match[0].indexOf(importExpression)
        const tokenEnd = tokenStart + importExpression.length
        const replacement = `'${moduleSpecifier}#${exportName}'`
        magic ||= new MagicString(code)
        magic.overwrite(tokenStart, tokenEnd, replacement)
      }
      const defaultPattern =
        /export\s+default\s+hydrated\s*(?:<[^>]*>)?\s*\(\s*(import\.meta\.url)/g
      while ((match = defaultPattern.exec(code))) {
        const importExpression = match[1]
        const tokenStart = match.index + match[0].indexOf(importExpression)
        const tokenEnd = tokenStart + importExpression.length
        const replacement = `'${moduleSpecifier}#default'`
        magic ||= new MagicString(code)
        magic.overwrite(tokenStart, tokenEnd, replacement)
      }
      if (!magic) {
        return null
      }
      return {
        code: magic.toString(),
        map: magic.generateMap({ hires: true }),
      }
    },
  } satisfies Plugin
}
