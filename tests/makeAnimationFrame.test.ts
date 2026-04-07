import {test} from 'node:test'
import {ok, strictEqual, doesNotThrow, deepStrictEqual} from 'node:assert'
import {makeAnimationFrame} from '../index.js'

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

test('makeAnimationFrame - returns a Disposable', () => {
	const mocks = setupRAFMocks()
	try {
		const dispose = makeAnimationFrame(() => {})
		ok(Symbol.dispose in dispose, 'makeAnimationFrame should return a Disposable')
		dispose[Symbol.dispose]()
	} finally {
		mocks.cleanup()
	}
})

test('makeAnimationFrame - callback is called on next frame', () => {
	const mocks = setupRAFMocks()
	try {
		let called = false
		let receivedTime: DOMHighResTimeStamp | undefined

		const dispose = makeAnimationFrame(now => {
			called = true
			receivedTime = now
		})

		mocks.tick()

		strictEqual(called, true, 'callback should be called on next frame')
		ok(typeof receivedTime === 'number', 'callback should receive time parameter')
		dispose[Symbol.dispose]()
	} finally {
		mocks.cleanup()
	}
})

test('makeAnimationFrame - callback is called only once', () => {
	const mocks = setupRAFMocks()
	try {
		const calls: DOMHighResTimeStamp[] = []

		const dispose = makeAnimationFrame(now => {
			calls.push(now)
		})

		mocks.tick()
		mocks.tick()
		mocks.tick()

		strictEqual(calls.length, 1, 'callback should be called only once')
		dispose[Symbol.dispose]()
	} finally {
		mocks.cleanup()
	}
})

test('makeAnimationFrame - callback receives timestamp', () => {
	const mocks = setupRAFMocks()
	try {
		let receivedTime: DOMHighResTimeStamp | undefined

		const dispose = makeAnimationFrame(now => {
			receivedTime = now
		})

		mocks.tick(16.67)

		ok(typeof receivedTime === 'number', 'callback should receive timestamp')
		ok(Math.abs(receivedTime! - 16.67) < 0.01, 'timestamp should be accurate')
		dispose[Symbol.dispose]()
	} finally {
		mocks.cleanup()
	}
})

test('makeAnimationFrame - disposer cancels before frame', () => {
	const mocks = setupRAFMocks()
	try {
		let callCount = 0

		const dispose = makeAnimationFrame(() => {
			callCount++
		})

		dispose[Symbol.dispose]()
		mocks.tick()

		strictEqual(callCount, 0, 'callback should not be called if disposed before frame')
	} finally {
		mocks.cleanup()
	}
})

test('makeAnimationFrame - disposer after frame is safe', () => {
	const mocks = setupRAFMocks()
	try {
		let callCount = 0

		const dispose = makeAnimationFrame(() => {
			callCount++
		})

		mocks.tick()
		strictEqual(callCount, 1, 'callback should be called once')

		dispose[Symbol.dispose]()
		mocks.tick()
		mocks.tick()

		strictEqual(callCount, 1, 'callback should still be called only once after disposal')
	} finally {
		mocks.cleanup()
	}
})

test('makeAnimationFrame - callback can return a cleanup Disposable', () => {
	const mocks = setupRAFMocks()
	try {
		let cleanupCalled = false

		const dispose = makeAnimationFrame(() => {
			return {
				[Symbol.dispose]() {
					cleanupCalled = true
				},
			}
		})

		mocks.tick()
		strictEqual(cleanupCalled, false, 'cleanup should not be called immediately after frame')

		dispose[Symbol.dispose]()
		strictEqual(cleanupCalled, true, 'cleanup should be called on disposal')
	} finally {
		mocks.cleanup()
	}
})

test('makeAnimationFrame - cleanup is called on disposal', () => {
	const mocks = setupRAFMocks()
	try {
		let cleanupCalled = false

		const dispose = makeAnimationFrame(() => {
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

test('makeAnimationFrame - multiple disposals are safe', () => {
	const mocks = setupRAFMocks()
	try {
		const dispose = makeAnimationFrame(() => {})

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

test('makeAnimationFrame - callback returning undefined is handled', () => {
	const mocks = setupRAFMocks()
	try {
		let callCount = 0

		const dispose = makeAnimationFrame(() => {
			callCount++
			return undefined
		})

		mocks.tick()
		mocks.tick()

		strictEqual(callCount, 1, 'callback should be called only once')
		dispose[Symbol.dispose]()
	} finally {
		mocks.cleanup()
	}
})

test('makeAnimationFrame - callback without cleanup works', () => {
	const mocks = setupRAFMocks()
	try {
		let callCount = 0

		const dispose = makeAnimationFrame(() => {
			callCount++
		})

		mocks.tick()

		strictEqual(callCount, 1, 'callback should be called once')
		dispose[Symbol.dispose]()
	} finally {
		mocks.cleanup()
	}
})

test('makeAnimationFrame - disposal before frame prevents execution', () => {
	const mocks = setupRAFMocks()
	try {
		let callCount = 0
		let cleanupCount = 0

		const dispose = makeAnimationFrame(() => {
			callCount++
			return {
				[Symbol.dispose]() {
					cleanupCount++
				},
			}
		})

		dispose[Symbol.dispose]()
		mocks.tick()

		strictEqual(callCount, 0, 'callback should not be called')
		strictEqual(cleanupCount, 0, 'cleanup should not be called')
	} finally {
		mocks.cleanup()
	}
})

test('makeAnimationFrame - multiple instances work independently', () => {
	const mocks = setupRAFMocks()
	try {
		let count1 = 0
		let count2 = 0

		const dispose1 = makeAnimationFrame(() => {
			count1++
		})

		const dispose2 = makeAnimationFrame(() => {
			count2++
		})

		mocks.tick()
		strictEqual(count1, 1, 'first instance should be called once')
		strictEqual(count2, 1, 'second instance should be called once')

		dispose1[Symbol.dispose]()
		mocks.tick()

		strictEqual(count1, 1, 'first instance should still be called only once')
		strictEqual(count2, 1, 'second instance should still be called only once')

		dispose2[Symbol.dispose]()
	} finally {
		mocks.cleanup()
	}
})

test('makeAnimationFrame - cancellation prevents callback', () => {
	const mocks = setupRAFMocks()
	try {
		let executed = false

		const dispose = makeAnimationFrame(() => {
			executed = true
		})

		strictEqual(mocks.getCallbackCount(), 1, 'one callback should be pending')

		dispose[Symbol.dispose]()

		strictEqual(mocks.getCallbackCount(), 0, 'callback should be cancelled')

		mocks.tick()

		strictEqual(executed, false, 'callback should not execute after cancellation')
	} finally {
		mocks.cleanup()
	}
})

test('makeAnimationFrame - cleanup from callback is called on dispose', () => {
	const mocks = setupRAFMocks()
	try {
		const events: string[] = []

		const dispose = makeAnimationFrame(() => {
			events.push('callback')
			return {
				[Symbol.dispose]() {
					events.push('cleanup')
				},
			}
		})

		mocks.tick()
		deepStrictEqual(events, ['callback'], 'only callback should be called after frame')

		dispose[Symbol.dispose]()
		deepStrictEqual(events, ['callback', 'cleanup'], 'cleanup should be called on dispose')
	} finally {
		mocks.cleanup()
	}
})
