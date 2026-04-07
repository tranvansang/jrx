import {test} from 'node:test'
import {ok, strictEqual, doesNotThrow, deepStrictEqual} from 'node:assert'
import {makeAnimationFrameLoop} from '../index.js'

// Mock requestAnimationFrame and cancelAnimationFrame for Node.js environment
function setupRAFMocks() {
	const callbacks = new Map<number, (time: DOMHighResTimeStamp) => void>()
	let nextId = 1
	let currentTime = 0

	const originalRAF = (globalThis as any).requestAnimationFrame
	const originalCAF = (globalThis as any).cancelAnimationFrame

	;(globalThis as any).requestAnimationFrame = (cb: (time: DOMHighResTimeStamp) => void) => {
		const id = nextId++
		callbacks.set(id, cb)
		return id
	}
	;(globalThis as any).cancelAnimationFrame = (id: number) => {
		callbacks.delete(id)
	}

	const tick = (deltaTime: number = 16.67) => {
		currentTime += deltaTime
		const callbacksCopy = new Map(callbacks)
		callbacks.clear()
		for (const [_, cb] of callbacksCopy) {
			cb(currentTime)
		}
	}

	const cleanup = () => {
		;(globalThis as any).requestAnimationFrame = originalRAF
		;(globalThis as any).cancelAnimationFrame = originalCAF
		callbacks.clear()
	}

	return {tick, cleanup, getCallbackCount: () => callbacks.size, getCurrentTime: () => currentTime}
}

test('makeAnimationFrameLoop - returns a disposer function', () => {
	const mocks = setupRAFMocks()
	try {
		const dispose = makeAnimationFrameLoop(() => {})
		ok(typeof dispose === 'function', 'makeAnimationFrameLoop should return a disposer function')
		dispose()
	} finally {
		mocks.cleanup()
	}
})

test('makeAnimationFrameLoop - callback is called on first frame', () => {
	const mocks = setupRAFMocks()
	try {
		let called = false
		let receivedTime: DOMHighResTimeStamp | undefined

		const dispose = makeAnimationFrameLoop(now => {
			called = true
			receivedTime = now
		})

		mocks.tick()

		strictEqual(called, true, 'callback should be called on first frame')
		ok(typeof receivedTime === 'number', 'callback should receive time parameter')
		dispose()
	} finally {
		mocks.cleanup()
	}
})

test('makeAnimationFrameLoop - callback is called repeatedly', () => {
	const mocks = setupRAFMocks()
	try {
		const calls: DOMHighResTimeStamp[] = []

		const dispose = makeAnimationFrameLoop(now => {
			calls.push(now)
		})

		mocks.tick()
		mocks.tick()
		mocks.tick()

		strictEqual(calls.length, 3, 'callback should be called 3 times')
		dispose()
	} finally {
		mocks.cleanup()
	}
})

test('makeAnimationFrameLoop - callback receives increasing timestamps', () => {
	const mocks = setupRAFMocks()
	try {
		const times: DOMHighResTimeStamp[] = []

		const dispose = makeAnimationFrameLoop(now => {
			times.push(now)
		})

		mocks.tick(16)
		mocks.tick(17)
		mocks.tick(15)

		strictEqual(times.length, 3)
		ok(times[1] > times[0], 'second timestamp should be greater than first')
		ok(times[2] > times[1], 'third timestamp should be greater than second')
		dispose()
	} finally {
		mocks.cleanup()
	}
})

test('makeAnimationFrameLoop - disposer stops the animation frame', () => {
	const mocks = setupRAFMocks()
	try {
		let callCount = 0

		const dispose = makeAnimationFrameLoop(() => {
			callCount++
		})

		mocks.tick()
		mocks.tick()
		dispose()

		const countAfterDispose = callCount
		mocks.tick()
		mocks.tick()

		strictEqual(callCount, countAfterDispose, 'callback should not be called after disposal')
	} finally {
		mocks.cleanup()
	}
})

test('makeAnimationFrameLoop - callback can return a cleanup disposable', () => {
	const mocks = setupRAFMocks()
	try {
		let cleanupCount = 0

		const dispose = makeAnimationFrameLoop(() => {
			return {
				[Symbol.dispose]() {
					cleanupCount++
				},
			}
		})

		mocks.tick()
		strictEqual(cleanupCount, 0, 'cleanup should not be called after first frame')

		mocks.tick()
		strictEqual(cleanupCount, 1, 'cleanup should be called before second frame')

		mocks.tick()
		strictEqual(cleanupCount, 2, 'cleanup should be called before third frame')

		dispose()
		strictEqual(cleanupCount, 3, 'cleanup should be called on disposal')
	} finally {
		mocks.cleanup()
	}
})

test('makeAnimationFrameLoop - cleanup is called before each callback execution', () => {
	const mocks = setupRAFMocks()
	try {
		const events: string[] = []

		const dispose = makeAnimationFrameLoop(() => {
			events.push('callback')
			return {
				[Symbol.dispose]() {
					events.push('cleanup')
				},
			}
		})

		mocks.tick()
		mocks.tick()
		mocks.tick()
		dispose()

		// Pattern should be: callback, cleanup, callback, cleanup, callback, cleanup
		deepStrictEqual(
			events,
			['callback', 'cleanup', 'callback', 'cleanup', 'callback', 'cleanup'],
			'cleanup should be called before each callback except the first',
		)
	} finally {
		mocks.cleanup()
	}
})

test('makeAnimationFrameLoop - disposer calls cleanup', () => {
	const mocks = setupRAFMocks()
	try {
		let cleanupCalled = false

		const dispose = makeAnimationFrameLoop(() => {
			return {
				[Symbol.dispose]() {
					cleanupCalled = true
				},
			}
		})

		mocks.tick()
		dispose()

		strictEqual(cleanupCalled, true, 'cleanup should be called when disposed')
	} finally {
		mocks.cleanup()
	}
})

test('makeAnimationFrameLoop - multiple disposals are safe', () => {
	const mocks = setupRAFMocks()
	try {
		const dispose = makeAnimationFrameLoop(() => {})

		mocks.tick()

		doesNotThrow(() => {
			dispose()
			dispose()
			dispose()
		}, 'multiple disposal calls should be safe')
	} finally {
		mocks.cleanup()
	}
})

test('makeAnimationFrameLoop - callback returning undefined is handled', () => {
	const mocks = setupRAFMocks()
	try {
		let callCount = 0

		const dispose = makeAnimationFrameLoop(() => {
			callCount++
			return undefined
		})

		mocks.tick()
		mocks.tick()
		mocks.tick()

		strictEqual(callCount, 3, 'callback should be called multiple times')
		dispose()
	} finally {
		mocks.cleanup()
	}
})

test('makeAnimationFrameLoop - callback without errors works', () => {
	const mocks = setupRAFMocks()
	try {
		let callCount = 0

		const dispose = makeAnimationFrameLoop(() => {
			callCount++
			// Note: errors in callbacks are NOT caught
		})

		mocks.tick()
		mocks.tick()
		mocks.tick()

		strictEqual(callCount, 3, 'should be called multiple times')
		dispose()
	} finally {
		mocks.cleanup()
	}
})

test('makeAnimationFrameLoop - cleanup without errors works', () => {
	const mocks = setupRAFMocks()
	try {
		let callCount = 0
		let cleanupCount = 0

		const dispose = makeAnimationFrameLoop(() => {
			callCount++
			return {
				[Symbol.dispose]() {
					cleanupCount++
					// Note: errors in cleanup are NOT caught
				},
			}
		})

		mocks.tick()
		mocks.tick()
		mocks.tick()

		strictEqual(callCount, 3, 'should be called multiple times')
		ok(cleanupCount >= 2, 'cleanup should be called')
		dispose()
	} finally {
		mocks.cleanup()
	}
})

test('makeAnimationFrameLoop - dispose stops further frames', () => {
	const mocks = setupRAFMocks()
	try {
		let callCount = 0

		const dispose = makeAnimationFrameLoop(() => {
			callCount++
		})

		mocks.tick()
		mocks.tick()
		strictEqual(callCount, 2, 'callback should be called twice')

		dispose()
		mocks.tick()
		mocks.tick()

		strictEqual(callCount, 2, 'callback should not be called after disposal')
	} finally {
		mocks.cleanup()
	}
})

test('makeAnimationFrameLoop - state is maintained across frames', () => {
	const mocks = setupRAFMocks()
	try {
		const values: number[] = []
		let counter = 0

		const dispose = makeAnimationFrameLoop(() => {
			counter++
			values.push(counter)
		})

		mocks.tick()
		mocks.tick()
		mocks.tick()

		deepStrictEqual(values, [1, 2, 3], 'state should be maintained across frames')
		dispose()
	} finally {
		mocks.cleanup()
	}
})

test('makeAnimationFrameLoop - cancellation is called with correct id', () => {
	const mocks = setupRAFMocks()
	try {
		const dispose = makeAnimationFrameLoop(() => {})

		mocks.tick()
		const callbackCountBefore = mocks.getCallbackCount()
		dispose()
		const callbackCountAfter = mocks.getCallbackCount()

		strictEqual(callbackCountAfter, 0, 'all animation frame callbacks should be cancelled')
	} finally {
		mocks.cleanup()
	}
})

test('makeAnimationFrameLoop - multiple instances work independently', () => {
	const mocks = setupRAFMocks()
	try {
		let count1 = 0
		let count2 = 0

		const dispose1 = makeAnimationFrameLoop(() => {
			count1++
		})

		const dispose2 = makeAnimationFrameLoop(() => {
			count2++
		})

		mocks.tick()
		strictEqual(count1, 1)
		strictEqual(count2, 1)

		dispose1()
		mocks.tick()

		strictEqual(count1, 1, 'first instance should not be called after disposal')
		strictEqual(count2, 2, 'second instance should continue')

		dispose2()
	} finally {
		mocks.cleanup()
	}
})

test('makeAnimationFrameLoop - callback receives accurate timing', () => {
	const mocks = setupRAFMocks()
	try {
		const times: number[] = []

		const dispose = makeAnimationFrameLoop(now => {
			times.push(now)
		})

		mocks.tick(16.67)
		mocks.tick(16.67)
		mocks.tick(16.67)

		strictEqual(times.length, 3)
		// Check approximate 60fps timing (16.67ms per frame)
		ok(Math.abs(times[0] - 16.67) < 0.01, 'first timestamp should be ~16.67')
		ok(Math.abs(times[1] - 33.34) < 0.01, 'second timestamp should be ~33.34')
		ok(Math.abs(times[2] - 50.01) < 0.01, 'third timestamp should be ~50.01')

		dispose()
	} finally {
		mocks.cleanup()
	}
})
