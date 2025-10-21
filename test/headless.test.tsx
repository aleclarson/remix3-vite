import type { Remix } from '@remix-run/dom'
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
  let onClick = vi.fn()

  function Heading(props: { level: number; children: Remix.RemixNode }) {
    const Tag = `h${props.level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
    return <Tag>{props.children}</Tag>
  }

  function Empty() {
    return null
  }

  function App(props: { body: string; class?: string }) {
    return (
      <div
        class={props.class}
        on={[
          connect((event) => (element = event.currentTarget)),
          dom.click(onClick),
        ]}
      >
        <Heading level={1}>Welcome to Remix Headless!</Heading>
        <Heading level={2}>This is a test.</Heading>
        {props.body}
        <>
          <Empty />
          <Empty />
        </>
      </div>
    )
  }

  const root = createRoot(document.body)
  root.render(<App body="Hello, world!" class="test" />)

  expect(document.body.innerHTML).toMatchInlineSnapshot(
    `"<div class="test"><h1>Welcome to Remix Headless!</h1><h2>This is a test.</h2>Hello, world!</div>"`,
  )

  // Flush microtasks
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert(element)

  // expect(getAttributes(element)).toMatchInlineSnapshot(`
  //   {
  //     "class": "test",
  //   }
  // `)

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

  //
  // RE-RENDER
  //

  root.render(<App body="Hi!" />)

  expect(document.body.innerHTML).toMatchInlineSnapshot(
    `"<div><h1>Welcome to Remix Headless!</h1><h2>This is a test.</h2>Hi!</div>"`,
  )

  // Flush microtasks
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert(element)

  // expect(getAttributes(element)).toMatchInlineSnapshot(`
  //   {
  //     "class": "test",
  //   }
  // `)

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
})
