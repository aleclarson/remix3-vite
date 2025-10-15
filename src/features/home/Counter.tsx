import { hydrated } from '@remix-run/dom'
import { dom } from '@remix-run/events'
import { spring } from 'motion'
import { animate } from 'motion/mini'

export const Counter = hydrated(import.meta.url, function () {
  let count = 0

  return () => (
    <button
      on={[
        dom.click((event) => {
          count++
          this.update()

          animate(
            event.currentTarget,
            { scale: [null, 0.94, 1] },
            { type: spring, bounce: 0.25 },
          )
        }),
      ]}
    >
      Count is: <span>{count}</span>
    </button>
  )
})
