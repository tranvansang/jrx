# jrx

A lightweight TypeScript library for managing side effects, subscriptions, and animations with automatic cleanup using the [Explicit Resource Management](https://github.com/tc39/proposal-explicit-resource-management) API.

## Prerequisites

This library requires the [Explicit Resource Management](https://github.com/tc39/proposal-explicit-resource-management) globals (`DisposableStack`, `AsyncDisposableStack`, `Symbol.dispose`, `Symbol.asyncDispose`). If your environment does not support them natively, you must load a polyfill before importing jrx (e.g. [`core-js`](https://github.com/nicolo-ribaudo/tc39-proposal-explicit-resource-management-polyfill)).

The `using` keyword is **not** required — this library only uses the API objects directly, so no transpiler support for `using` declarations is needed.

## Installation

```bash
npm i jrx
```

## Features

- Automatic cleanup for all effects and subscriptions
- Built on the native `DisposableStack` / `AsyncDisposableStack` API
- Retry logic with exponential backoff and cancellation
- Zero dependencies
- Composable reactive utilities
- Browser and Node.js compatible

## API Overview

- [`makeReset()`](#makereset) - Create a resettable `DisposableStack`
- [`makeAsyncReset()`](#makeasyncreset) - Create a resettable `AsyncDisposableStack`
- [`makeRenderLoop()`](#makerenderloop) - Render loops with automatic cleanup
- [`addInterval(cb, ms)`](#addintervalcb-ms) - Repeating intervals with cleanup
- [`addIntervalAsync(cb, ms)`](#addintervalasynccb-ms) - Async intervals with cancellation
- [`addRequestAnimationFrame(cb)`](#addrequestanimationframecb) - Single animation frame with cleanup
- [`addRequestAnimationFrameLoop(cb)`](#addrequestanimationframeloopcb) - Animation frame loops
- [`addTimeout(cb, ms)`](#addtimeoutcb-ms) - Timeouts with cleanup
- [`addTransition(cb, durationMs)`](#addtransitioncb-durationms) - Progress-based animations
- [`computed(fn, getDeps?)`](#computedfn-getdeps) - Memoized computed values
- [`retry(cb, backoffSec?)`](#retrycb-backoffsec) - Retry with exponential backoff

## API

### `makeReset()`

Creates a resettable `DisposableStack`. Each call disposes the previous stack and returns a new one.

```typescript
import {makeReset} from 'jrx'

const reset = makeReset()
const stack = reset() // Get a fresh DisposableStack

// Add disposables
stack.use(someDisposable)

// Reset - disposes previous stack, returns new one
const newStack = reset()
```

### `makeAsyncReset()`

Async version of `makeReset` using `AsyncDisposableStack`.

```typescript
import {makeAsyncReset} from 'jrx'

const reset = makeAsyncReset()
const stack = await reset() // Get a fresh AsyncDisposableStack
```

### `makeRenderLoop()`

Creates a render loop with automatic cleanup management.

```typescript
import {makeRenderLoop} from 'jrx'

const {loop, setLoop} = makeRenderLoop()

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

**Note:** The callback fires **immediately** on first call, then waits `ms` milliseconds **after** the previous callback completes. This is not a fixed-rate timer.

```typescript
import { addInterval } from 'jrx'

const dispose = addInterval(() => {
  console.log('Tick') // Called immediately, then every 1000ms after completion

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

**Note:** The callback fires **immediately** on first call, then waits `ms` milliseconds **after** the previous async callback completes.

```typescript
import { addIntervalAsync } from 'jrx'

const dispose = addIntervalAsync(async () => {
  // Called immediately, then 5000ms after each completion
  await fetchData()
  processData()
}, 5000)

dispose()
```

### `addRequestAnimationFrame(cb)`

Executes a callback on the next animation frame with cleanup.

```typescript
import { addRequestAnimationFrame } from 'jrx'

const dispose = addRequestAnimationFrame((now) => {
  updateAnimation(now)

  // Optional: return cleanup function
  return () => {
    cleanupAnimation()
  }
})

// Cancel if needed before the frame fires
dispose()
```

### `addRequestAnimationFrameLoop(cb)`

Creates a continuous `requestAnimationFrame` loop with cleanup.

```typescript
import { addRequestAnimationFrameLoop } from 'jrx'

const dispose = addRequestAnimationFrameLoop((now) => {
  updateAnimation(now)

  // Optional: return cleanup function
  return () => {
    cleanupAnimation()
  }
})

// Stop the loop
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

### `retry(cb, backoffSec?)`

Retries an operation with exponential backoff on failure. Returns `Disposable & Promise<T>`.

**Default backoff:** `[5, 5, 10, 10, 20, 20, 40, 40, 60, -1]` seconds (where `-1` means retry forever with 60s delay)

```typescript
import {retry} from 'jrx'

// Basic usage - retries with default backoff
const result = await retry(({resetBackoff}) => {
  const promise = fetch('/api/data').then((r) => r.json())
  return Object.assign(promise, {[Symbol.dispose]() {}})
})

// Custom backoff schedule (in seconds)
await retry(
  () => {
    const promise = fetchData()
    return Object.assign(promise, {[Symbol.dispose]() {}})
  },
  [1, 2, 5, 10, -1], // -1 means retry forever with last delay
)

// Cancellation via Disposable
const r = retry(
  ({resetBackoff}) => {
    const promise = fetchData()
    return Object.assign(promise, {[Symbol.dispose]() { /* cancel */ }})
  },
  [5, 10, 20, 40, -1],
)

// Cancel the retry loop
r[Symbol.dispose]()

// Returns undefined when disposed
const data = await r // undefined
```

**Parameters:**
- `cb`: Callback that returns `Disposable & (T | Promise<T>)`. Receives `{ resetBackoff() }` to reset the backoff counter.
- `backoffSec`: Array of retry delays in seconds. Use `-1` for infinite retries with the last delay. Default: `[5, 5, 10, 10, 20, 20, 40, 40, 60, -1]`

## Cleanup Pattern

All effect functions return a dispose function that stops the effect and runs any pending cleanup:

```typescript
import {addInterval, addTimeout, addRequestAnimationFrame} from 'jrx'

// Each function returns a dispose function
const disposeInterval = addInterval(() => console.log('tick'), 1000)
const disposeTimeout = addTimeout(() => console.log('timeout'), 5000)
const disposeRaf = addRequestAnimationFrame((now) => render(now))

// Call the dispose function to stop the effect
disposeInterval()
disposeTimeout()
disposeRaf()
```

## TypeScript

This library is written in TypeScript and uses the [Explicit Resource Management](https://github.com/tc39/proposal-explicit-resource-management) types (`Disposable`, `DisposableStack`, `AsyncDisposableStack`).

## License

MIT

## Repository

https://github.com/tranvansang/jrx
