import { createFrame } from '@remix-run/dom'

const resolveFrame = async (src: string) => {
  const response = await fetch(src, {
    headers: {
      accept: 'text/html',
      'x-remix-fragment': 'true',
    },
  })
  return response.text()
}

const frame = createFrame(document.body, {
  loadModule(src, name) {
    // FIXME: This loads a new instance of every hydrated component, resulting in
    // unnecessary loss of state.
    return import(/* @vite-ignore */ src + '?t=' + Date.now()).then(
      (mod) => mod[name],
    )
  },
  resolveFrame,
})

if (import.meta.hot) {
  import.meta.hot.on('vite:beforeFullReload', (payload) => {
    resolveFrame(location.href).then((html) => {
      frame.render(html)
    })
    // FIXME: Find a more official way to do this.
    // HACK: The ".html" part stops Vite from reloading the page.
    payload.path = 'prevent-full-reload.html'
  })
}
