# jrx

A lightweight TypeScript library for managing side effects, subscriptions, and animations with automatic cleanup. Built on top of [jdisposer](https://github.com/tranvansang/jdisposer) for safe resource management.

## Installation

```bash
npm install jrx
```

## Features

- Automatic cleanup for all effects and subscriptions
- Type-safe disposer pattern
- Retry logic with exponential backoff and cancellation
- Single dependency (jdisposer)
- Composable reactive utilities
- Browser and Node.js compatible

## API

### `makeRenderLoop()`

Creates a render loop with automatic cleanup management.

```typescript
import { makeRenderLoop } from 'jrx'

const { loop, setLoop } = makeRenderLoop()

// Set the loop function
const dispose = setLoop((time) => {
  console.log('Frame time:', time)

  // Optional: return cleanup function
  return () => {
    console.log('Cleanup previous frame')
  }
})

// Call loop on each animation frame
requestAnimationFrame(loop)

// Cleanup
dispose()
```

### `addInterval(cb, ms)`

Creates a repeating interval with cleanup. The callback can optionally return a cleanup function that runs before the next invocation.

```typescript
import { addInterval } from 'jrx'

const dispose = addInterval(() => {
  console.log('Tick')

  // Optional: return cleanup function
  return () => {
    console.log('Cleanup')
  }
}, 1000)

// Stop the interval
dispose()
```

### `addIntervalAsync(cb, ms)`

Async version of `addInterval`. Waits for the callback to complete before scheduling the next invocation.

```typescript
import { addIntervalAsync } from 'jrx'

const dispose = addIntervalAsync(async (disposer) => {
  await fetchData()

  // Check if disposed during async operation
  if (disposer.signal.aborted) return

  processData()
}, 5000)

dispose()
```

### `addRequestAnimationFrame(cb)`

Creates a `requestAnimationFrame` loop with cleanup.

```typescript
import { addRequestAnimationFrame } from 'jrx'

const dispose = addRequestAnimationFrame((now) => {
  updateAnimation(now)

  // Optional: return cleanup function
  return () => {
    cleanupAnimation()
  }
})

dispose()
```

### `addSubs(subs, cb, options?)`

Manages multiple subscriptions with a single callback.

```typescript
import { addSubs } from 'jrx'

const sub1 = (listener) => {
  eventEmitter.on('event1', listener)
  return () => eventEmitter.off('event1', listener)
}

const sub2 = (listener) => {
  eventEmitter.on('event2', listener)
  return () => eventEmitter.off('event2', listener)
}

const dispose = addSubs([sub1, sub2], () => {
  console.log('Any event fired')

  // Optional: return cleanup function
  return () => {
    console.log('Cleanup')
  }
}, { now: true }) // Call immediately with now: true

dispose()
```

### `addTimeout(cb, ms)`

Creates a timeout with cleanup.

```typescript
import { addTimeout } from 'jrx'

const cancel = addTimeout(() => {
  console.log('Timeout fired')
}, 1000)

// Cancel if needed
cancel()
```

### `addTransition(cb, durationMs)`

Creates an animation transition with progress tracking (0 to 1).

```typescript
import { addTransition } from 'jrx'

const dispose = addTransition((progress) => {
  element.style.opacity = progress.toString()

  // Optional: return cleanup function
  return () => {
    console.log('Frame cleanup')
  }
}, 1000)

dispose()
```

### `computed(fn, getDeps?)`

Creates a memoized computed value with optional dependency tracking.

```typescript
import { computed } from 'jrx'

// Without dependencies - always recomputes
const value1 = computed(() => expensiveCalculation())
console.log(value1.value) // Computed
console.log(value1.value) // Computed again

// With dependencies - memoizes when deps unchanged
let a = 1, b = 2
const value2 = computed(
  () => a + b,
  () => [a, b] // Dependencies
)

console.log(value2.value) // Computed: 3
console.log(value2.value) // Cached: 3

a = 10
console.log(value2.value) // Recomputed: 12
```

### `retry(cb, options?)`

Retries an async operation with exponential backoff on failure.

```typescript
import retry from 'jrx/retry'

// Basic usage - retries with default backoff
const result = await retry(async (disposer, { resetBackoff }) => {
  const response = await fetch('/api/data')
  if (!response.ok) throw new Error('Failed to fetch')
  return response.json()
})

// Custom backoff schedule (in seconds)
await retry(
  async (disposer, { resetBackoff }) => {
    return await fetchData()
  },
  {
    backoffSec: [1, 2, 5, 10, -1] // -1 means retry forever with last delay
  }
)

// With disposer for cancellation
import { makeDisposer } from 'jdisposer'

const disposer = makeDisposer()

const data = await retry(
  async (loopDisposer, { resetBackoff }) => {
    // Check if aborted
    if (loopDisposer.signal.aborted) return

    const result = await fetchData()

    // Reset backoff on successful partial progress
    if (result.isPartialSuccess) {
      resetBackoff()
    }

    return result
  },
  {
    disposer,
    backoffSec: [5, 10, 20, 40, -1]
  }
)

// Cancel the retry loop
disposer.dispose()

// Returns undefined when disposed
console.log(data) // T | undefined
```

**Options:**
- `backoffSec`: Array of retry delays in seconds. Use `-1` for infinite retries with the last delay. Default: `[5, 5, 10, 10, 20, 20, 40, 40, 60, -1]`
- `disposer`: Optional disposer for cancellation. When provided, the return type is `T | undefined`. Otherwise, the return type is `T`.

**Callback parameters:**
- `disposer`: A disposer for the current retry attempt. Check `disposer.signal.aborted` to handle cancellation
- `info.resetBackoff()`: Call this to reset the backoff counter to the beginning (useful when making partial progress)

## Cleanup Pattern

All functions return disposer functions that clean up resources:

```typescript
import {addInterval, addTimeout, addRequestAnimationFrame} from 'jrx'
import {makeDisposer} from 'jdisposer'

const disposer = makeDisposer()

// Collect disposers
disposer.add(addInterval(() => console.log('tick'), 1000))
disposer.add(addTimeout(() => console.log('timeout'), 5000))
disposer.add(addRequestAnimationFrame((now) => render(now)))

// Cleanup all at once
disposer.dispose()
```

## TypeScript

This library is written in TypeScript and includes type definitions.

```typescript
import type { Disposer } from 'jdisposer'

// All disposer functions follow this pattern
type DisposerFunction = () => void
```

## License

MIT

## Repository

https://github.com/tranvansang/jrx
