import { join } from 'node:path'
import { FetchHandler } from 'srvx'
import { NodeRequest, sendNodeResponse } from 'srvx/node'
import { Plugin } from 'vite'

export function remix3() {
  return {
    name: 'remix3',
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
  } satisfies Plugin
}
