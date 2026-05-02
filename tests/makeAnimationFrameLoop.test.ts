import {test} from 'node:test'
import {ok, strictEqual, doesNotThrow, deepStrictEqual} from 'node:assert'
import {createAnimationFrameLoop} from '../index.js'

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

test('createAnimationFrameLoop - returns a Disposable', () => {
	const mocks = setupRAFMocks()
	try {
		const dispose = createAnimationFrameLoop(() => {})
		ok(Symbol.dispose in dispose, 'createAnimationFrameLoop should return a Disposable')
		dispose[Symbol.dispose]()
	} finally {
		mocks.cleanup()
	}
})

test('createAnimationFrameLoop - callback is called on first frame', () => {
	const mocks = setupRAFMocks()
	try {
		let called = false
		let receivedTime: DOMHighResTimeStamp | undefined

		const dispose = createAnimationFrameLoop(now => {
			called = true
			receivedTime = now
		})

		mocks.tick()

		strictEqual(called, true, 'callback should be called on first frame')
		ok(typeof receivedTime === 'number', 'callback should receive time parameter')
		dispose[Symbol.dispose]()
	} finally {
		mocks.cleanup()
	}
})

test('createAnimationFrameLoop - callback is called repeatedly', () => {
	const mocks = setupRAFMocks()
	try {
		const calls: DOMHighResTimeStamp[] = []

		const dispose = createAnimationFrameLoop(now => {
			calls.push(now)
		})

		mocks.tick()
		mocks.tick()
		mocks.tick()

		strictEqual(calls.length, 3, 'callback should be called 3 times')
		dispose[Symbol.dispose]()
	} finally {
		mocks.cleanup()
	}
})

test('createAnimationFrameLoop - callback receives increasing timestamps', () => {
	const mocks = setupRAFMocks()
	try {
		const times: DOMHighResTimeStamp[] = []

		const dispose = createAnimationFrameLoop(now => {
			times.push(now)
		})

		mocks.tick(16)
		mocks.tick(17)
		mocks.tick(15)

		strictEqual(times.length, 3)
		ok(times[1] > times[0], 'second timestamp should be greater than first')
		ok(times[2] > times[1], 'third timestamp should be greater than second')
		dispose[Symbol.dispose]()
	} finally {
		mocks.cleanup()
	}
})

test('createAnimationFrameLoop - disposer stops the animation frame', () => {
	const mocks = setupRAFMocks()
	try {
		let callCount = 0

		const dispose = createAnimationFrameLoop(() => {
			callCount++
		})

		mocks.tick()
		mocks.tick()
		dispose[Symbol.dispose]()

		const countAfterDispose = callCount
		mocks.tick()
		mocks.tick()

		strictEqual(callCount, countAfterDispose, 'callback should not be called after disposal')
	} finally {
		mocks.cleanup()
	}
})

test('createAnimationFrameLoop - callback can return a cleanup disposable', () => {
	const mocks = setupRAFMocks()
	try {
		let cleanupCount = 0

		const dispose = createAnimationFrameLoop(() => {
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

		dispose[Symbol.dispose]()
		strictEqual(cleanupCount, 3, 'cleanup should be called on disposal')
	} finally {
		mocks.cleanup()
	}
})

test('createAnimationFrameLoop - cleanup is called before each callback execution', () => {
	const mocks = setupRAFMocks()
	try {
		const events: string[] = []

		const dispose = createAnimationFrameLoop(() => {
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
		dispose[Symbol.dispose]()

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

test('createAnimationFrameLoop - disposer calls cleanup', () => {
	const mocks = setupRAFMocks()
	try {
		let cleanupCalled = false

		const dispose = createAnimationFrameLoop(() => {
			return {
				[Symbol.dispose]() {
					cleanupCalled = true
				},
			}
		})

		mocks.tick()
		dispose[Symbol.dispose]()

		strictEqual(cleanupCalled, true, 'cleanup should be called when disposed')
	} finally {
		mocks.cleanup()
	}
})

test('createAnimationFrameLoop - multiple disposals are safe', () => {
	const mocks = setupRAFMocks()
	try {
		const dispose = createAnimationFrameLoop(() => {})

		mocks.tick()

		doesNotThrow(() => {
			dispose[Symbol.dispose]()
			dispose[Symbol.dispose]()
			dispose[Symbol.dispose]()
		}, 'multiple disposal calls should be safe')
	} finally {
		mocks.cleanup()
	}
})

test('createAnimationFrameLoop - callback returning undefined is handled', () => {
	const mocks = setupRAFMocks()
	try {
		let callCount = 0

		const dispose = createAnimationFrameLoop(() => {
			callCount++
			return undefined
		})

		mocks.tick()
		mocks.tick()
		mocks.tick()

		strictEqual(callCount, 3, 'callback should be called multiple times')
		dispose[Symbol.dispose]()
	} finally {
		mocks.cleanup()
	}
})

test('createAnimationFrameLoop - callback without errors works', () => {
	const mocks = setupRAFMocks()
	try {
		let callCount = 0

		const dispose = createAnimationFrameLoop(() => {
			callCount++
			// Note: errors in callbacks are NOT caught
		})

		mocks.tick()
		mocks.tick()
		mocks.tick()

		strictEqual(callCount, 3, 'should be called multiple times')
		dispose[Symbol.dispose]()
	} finally {
		mocks.cleanup()
	}
})

test('createAnimationFrameLoop - cleanup without errors works', () => {
	const mocks = setupRAFMocks()
	try {
		let callCount = 0
		let cleanupCount = 0

		const dispose = createAnimationFrameLoop(() => {
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
		dispose[Symbol.dispose]()
	} finally {
		mocks.cleanup()
	}
})

test('createAnimationFrameLoop - dispose stops further frames', () => {
	const mocks = setupRAFMocks()
	try {
		let callCount = 0

		const dispose = createAnimationFrameLoop(() => {
			callCount++
		})

		mocks.tick()
		mocks.tick()
		strictEqual(callCount, 2, 'callback should be called twice')

		dispose[Symbol.dispose]()
		mocks.tick()
		mocks.tick()

		strictEqual(callCount, 2, 'callback should not be called after disposal')
	} finally {
		mocks.cleanup()
	}
})

test('createAnimationFrameLoop - state is maintained across frames', () => {
	const mocks = setupRAFMocks()
	try {
		const values: number[] = []
		let counter = 0

		const dispose = createAnimationFrameLoop(() => {
			counter++
			values.push(counter)
		})

		mocks.tick()
		mocks.tick()
		mocks.tick()

		deepStrictEqual(values, [1, 2, 3], 'state should be maintained across frames')
		dispose[Symbol.dispose]()
	} finally {
		mocks.cleanup()
	}
})

test('createAnimationFrameLoop - cancellation is called with correct id', () => {
	const mocks = setupRAFMocks()
	try {
		const dispose = createAnimationFrameLoop(() => {})

		mocks.tick()
		const callbackCountBefore = mocks.getCallbackCount()
		dispose[Symbol.dispose]()
		const callbackCountAfter = mocks.getCallbackCount()

		strictEqual(callbackCountAfter, 0, 'all animation frame callbacks should be cancelled')
	} finally {
		mocks.cleanup()
	}
})

test('createAnimationFrameLoop - multiple instances work independently', () => {
	const mocks = setupRAFMocks()
	try {
		let count1 = 0
		let count2 = 0

		const dispose1 = createAnimationFrameLoop(() => {
			count1++
		})

		const dispose2 = createAnimationFrameLoop(() => {
			count2++
		})

		mocks.tick()
		strictEqual(count1, 1)
		strictEqual(count2, 1)

		dispose1[Symbol.dispose]()
		mocks.tick()

		strictEqual(count1, 1, 'first instance should not be called after disposal')
		strictEqual(count2, 2, 'second instance should continue')

		dispose2[Symbol.dispose]()
	} finally {
		mocks.cleanup()
	}
})

test('createAnimationFrameLoop - callback receives accurate timing', () => {
	const mocks = setupRAFMocks()
	try {
		const times: number[] = []

		const dispose = createAnimationFrameLoop(now => {
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

		dispose[Symbol.dispose]()
	} finally {
		mocks.cleanup()
	}
})
