import assert from 'node:assert'
import {
  Event,
  connect,
  createRoot,
  document,
  dom,
  getEventListeners,
} from 'remix-headless'
import { expect, test, vi } from 'vitest'

test('remix-headless basic', async () => {
  let element: HTMLDivElement | undefined

  const onClick = vi.fn()
  createRoot(document.body).render(
    <div
      on={[
        connect((event) => (element = event.currentTarget)),
        dom.click(onClick),
      ]}
    >
      Hello, world!
    </div>,
  )

  expect(document.body.innerHTML).toMatchInlineSnapshot(
    `"<div>Hello, world!</div>"`,
  )

  // Flush microtasks
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert(element)

  expect(getEventListeners(element)).toMatchInlineSnapshot(`
    Map {
      "rmx:connect" => Map {
        [Function] => {},
      },
      "click" => Map {
        [Function] => {},
      },
    }
  `)

  const clickEvent = new Event('click')
  element.dispatchEvent(clickEvent)

  expect(onClick).toHaveBeenCalledWith(clickEvent, expect.any(AbortSignal))
})
