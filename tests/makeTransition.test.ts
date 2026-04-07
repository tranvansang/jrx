import {test} from 'node:test'
import {ok, strictEqual, doesNotThrow, deepStrictEqual} from 'node:assert'
import {makeTransition} from '../index.js'

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

test('makeTransition - returns a Disposable object', () => {
	const mocks = setupRAFMocks()
	try {
		const dispose = makeTransition(() => {}, 1000)
		ok(Symbol.dispose in dispose, 'makeTransition should return a Disposable object')
		dispose[Symbol.dispose]()
	} finally {
		mocks.cleanup()
	}
})

test('makeTransition - callback is called with progress 0 on first frame', () => {
	const mocks = setupRAFMocks()
	try {
		let receivedProgress: number | undefined

		const dispose = makeTransition(progress => {
			receivedProgress = progress
		}, 1000)

		mocks.tick()

		strictEqual(receivedProgress, 0, 'callback should be called with progress 0 on first frame')
		dispose[Symbol.dispose]()
	} finally {
		mocks.cleanup()
	}
})

test('makeTransition - callback is called with increasing progress values', () => {
	const mocks = setupRAFMocks()
	try {
		const progressValues: number[] = []

		const dispose = makeTransition(progress => {
			progressValues.push(progress)
		}, 100)

		mocks.tick(0) // Start
		mocks.tick(25) // 25% through
		mocks.tick(25) // 50% through
		mocks.tick(25) // 75% through
		mocks.tick(25) // 100% through

		ok(progressValues.length >= 3, 'callback should be called multiple times')
		strictEqual(progressValues[0], 0, 'first progress should be 0')

		// Check that progress values are increasing
		for (let i = 1; i < progressValues.length; i++) {
			ok(
				progressValues[i] >= progressValues[i - 1],
				`progress should increase: ${progressValues[i - 1]} -> ${progressValues[i]}`,
			)
		}

		dispose[Symbol.dispose]()
	} finally {
		mocks.cleanup()
	}
})

test('makeTransition - callback is called with progress 1 when duration is reached', () => {
	const mocks = setupRAFMocks()
	try {
		const progressValues: number[] = []

		const dispose = makeTransition(progress => {
			progressValues.push(progress)
		}, 100)

		mocks.tick(0) // Start at 0
		mocks.tick(50) // Half way
		mocks.tick(60) // Past duration (110 total)

		ok(progressValues.includes(1), 'progress should include 1')
		strictEqual(progressValues[progressValues.length - 1], 1, 'last progress should be 1')

		dispose[Symbol.dispose]()
	} finally {
		mocks.cleanup()
	}
})

test('makeTransition - transition stops after reaching progress 1', () => {
	const mocks = setupRAFMocks()
	try {
		const progressValues: number[] = []

		const dispose = makeTransition(progress => {
			progressValues.push(progress)
		}, 100)

		mocks.tick(0) // Start
		mocks.tick(100) // Reach duration
		mocks.tick(50) // After duration
		mocks.tick(50) // After duration

		const lastProgress = progressValues[progressValues.length - 1]
		strictEqual(lastProgress, 1, 'last progress should be 1')

		// Count how many times we got progress 1
		const onesCount = progressValues.filter(p => p === 1).length
		strictEqual(onesCount, 1, 'progress 1 should appear exactly once')

		dispose[Symbol.dispose]()
	} finally {
		mocks.cleanup()
	}
})

test('makeTransition - progress calculation is accurate', () => {
	const mocks = setupRAFMocks()
	try {
		const progressValues: number[] = []
		const duration = 200

		const dispose = makeTransition(progress => {
			progressValues.push(progress)
		}, duration)

		mocks.tick(0) // 0ms - progress should be 0
		mocks.tick(50) // 50ms - progress should be 0.25
		mocks.tick(50) // 100ms - progress should be 0.5
		mocks.tick(50) // 150ms - progress should be 0.75
		mocks.tick(50) // 200ms - progress should be 1

		strictEqual(progressValues[0], 0, 'progress at 0ms should be 0')
		ok(Math.abs(progressValues[1] - 0.25) < 0.01, `progress at 50ms should be ~0.25, got ${progressValues[1]}`)
		ok(Math.abs(progressValues[2] - 0.5) < 0.01, `progress at 100ms should be ~0.5, got ${progressValues[2]}`)
		ok(Math.abs(progressValues[3] - 0.75) < 0.01, `progress at 150ms should be ~0.75, got ${progressValues[3]}`)
		strictEqual(progressValues[4], 1, 'progress at 200ms should be 1')

		dispose[Symbol.dispose]()
	} finally {
		mocks.cleanup()
	}
})

test('makeTransition - disposer stops the transition', () => {
	const mocks = setupRAFMocks()
	try {
		let callCount = 0

		const dispose = makeTransition(() => {
			callCount++
		}, 1000)

		mocks.tick(0)
		mocks.tick(50)
		dispose[Symbol.dispose]()

		const countAfterDispose = callCount
		mocks.tick(50)
		mocks.tick(50)

		strictEqual(callCount, countAfterDispose, 'callback should not be called after disposal')
	} finally {
		mocks.cleanup()
	}
})

test('makeTransition - callback can return a Disposable cleanup', () => {
	const mocks = setupRAFMocks()
	try {
		let cleanupCount = 0

		const dispose = makeTransition(() => {
			return {
				[Symbol.dispose]() {
					cleanupCount++
				},
			}
		}, 100)

		mocks.tick(0) // First frame: start = 0, progress = 0
		strictEqual(cleanupCount, 0, 'cleanup should not be called after first frame')

		mocks.tick(50) // Second frame: progress = 0.5
		strictEqual(cleanupCount, 1, 'cleanup should be called before second frame')

		mocks.tick(50) // Third frame: progress = 1.0 (completes)
		strictEqual(cleanupCount, 2, 'cleanup should be called before third frame')

		dispose[Symbol.dispose]()
		// Transition is complete, so no additional cleanup on disposal
	} finally {
		mocks.cleanup()
	}
})

test('makeTransition - cleanup is called before each callback execution', () => {
	const mocks = setupRAFMocks()
	try {
		const events: string[] = []

		const dispose = makeTransition(() => {
			events.push('callback')
			return {
				[Symbol.dispose]() {
					events.push('cleanup')
				},
			}
		}, 100)

		mocks.tick(0)
		mocks.tick(50)
		mocks.tick(60)

		// Pattern: callback, cleanup, callback, cleanup, callback
		deepStrictEqual(
			events,
			['callback', 'cleanup', 'callback', 'cleanup', 'callback'],
			'cleanup should be called before each callback except the first',
		)

		dispose[Symbol.dispose]()
	} finally {
		mocks.cleanup()
	}
})

test('makeTransition - disposer calls cleanup', () => {
	const mocks = setupRAFMocks()
	try {
		let cleanupCalled = false

		const dispose = makeTransition(() => {
			return {
				[Symbol.dispose]() {
					cleanupCalled = true
				},
			}
		}, 1000)

		mocks.tick(0)
		dispose[Symbol.dispose]()

		strictEqual(cleanupCalled, true, 'cleanup should be called when disposed')
	} finally {
		mocks.cleanup()
	}
})

test('makeTransition - multiple disposals are safe', () => {
	const mocks = setupRAFMocks()
	try {
		const dispose = makeTransition(() => {}, 1000)

		mocks.tick(0)

		doesNotThrow(() => {
			dispose[Symbol.dispose]()
			dispose[Symbol.dispose]()
			dispose[Symbol.dispose]()
		}, 'multiple disposal calls should be safe')
	} finally {
		mocks.cleanup()
	}
})

test('makeTransition - callback returning undefined is handled', () => {
	const mocks = setupRAFMocks()
	try {
		let callCount = 0

		const dispose = makeTransition(() => {
			callCount++
			return undefined
		}, 100)

		mocks.tick(0)
		mocks.tick(50)
		mocks.tick(60)

		ok(callCount >= 3, 'callback should be called multiple times')
		dispose[Symbol.dispose]()
	} finally {
		mocks.cleanup()
	}
})

test('makeTransition - zero duration works', () => {
	const mocks = setupRAFMocks()
	try {
		const progressValues: number[] = []

		const dispose = makeTransition(progress => {
			progressValues.push(progress)
		}, 0)

		mocks.tick(0) // First frame: start = 0, progress = 0
		mocks.tick(1) // Second frame: progress = 1

		ok(progressValues.includes(0), 'should have progress 0')
		ok(progressValues.includes(1), 'should have progress 1')
		ok(progressValues.length >= 2, 'should be called at least twice')

		dispose[Symbol.dispose]()
	} finally {
		mocks.cleanup()
	}
})

test('makeTransition - very short duration works', () => {
	const mocks = setupRAFMocks()
	try {
		const progressValues: number[] = []

		const dispose = makeTransition(progress => {
			progressValues.push(progress)
		}, 10)

		mocks.tick(0)
		mocks.tick(5)
		mocks.tick(10)

		strictEqual(progressValues[0], 0)
		ok(progressValues[1] >= 0.4 && progressValues[1] <= 0.6, 'middle progress should be around 0.5')
		strictEqual(progressValues[progressValues.length - 1], 1)

		dispose[Symbol.dispose]()
	} finally {
		mocks.cleanup()
	}
})

test('makeTransition - very long duration works', () => {
	const mocks = setupRAFMocks()
	try {
		const progressValues: number[] = []

		const dispose = makeTransition(progress => {
			progressValues.push(progress)
		}, 10000)

		mocks.tick(0)
		mocks.tick(1000)
		mocks.tick(1000)

		strictEqual(progressValues[0], 0)
		ok(progressValues[1] < 0.15, 'progress should be small for long duration')

		dispose[Symbol.dispose]()
	} finally {
		mocks.cleanup()
	}
})

test('makeTransition - callback without errors works', () => {
	const mocks = setupRAFMocks()
	try {
		let callCount = 0

		const dispose = makeTransition(() => {
			callCount++
			// Note: errors in callbacks are NOT caught
		}, 1000)

		mocks.tick(0)
		mocks.tick(50)
		mocks.tick(50)

		ok(callCount >= 2, 'should be called multiple times')
		dispose[Symbol.dispose]()
	} finally {
		mocks.cleanup()
	}
})

test('makeTransition - cleanup without errors works', () => {
	const mocks = setupRAFMocks()
	try {
		let callCount = 0
		let cleanupCount = 0

		const dispose = makeTransition(() => {
			callCount++
			return {
				[Symbol.dispose]() {
					cleanupCount++
					// Note: errors in cleanup are NOT caught
				},
			}
		}, 1000)

		mocks.tick(0)
		mocks.tick(50)
		mocks.tick(50)

		strictEqual(callCount, 3, 'should be called multiple times')
		ok(cleanupCount >= 2, 'cleanup should be called')
		dispose[Symbol.dispose]()
	} finally {
		mocks.cleanup()
	}
})

test('makeTransition - state is maintained across frames', () => {
	const mocks = setupRAFMocks()
	try {
		let counter = 0
		const values: number[] = []

		const dispose = makeTransition(() => {
			counter++
			values.push(counter)
		}, 100)

		mocks.tick(0)
		mocks.tick(50)
		mocks.tick(60)

		deepStrictEqual(values, [1, 2, 3], 'state should be maintained across frames')
		dispose[Symbol.dispose]()
	} finally {
		mocks.cleanup()
	}
})

test('makeTransition - multiple transitions work independently', () => {
	const mocks = setupRAFMocks()
	try {
		const progress1: number[] = []
		const progress2: number[] = []

		const dispose1 = makeTransition(p => {
			progress1.push(p)
		}, 100)
		const dispose2 = makeTransition(p => {
			progress2.push(p)
		}, 200)

		mocks.tick(0) // both at 0
		mocks.tick(50) // progress1 at 0.5, progress2 at 0.25
		mocks.tick(50) // progress1 at 1.0, progress2 at 0.5
		mocks.tick(50) // progress1 done, progress2 at 0.75

		ok(progress1.length >= 3, 'first transition should have multiple calls')
		ok(progress2.length >= 3, 'second transition should have multiple calls')

		strictEqual(progress1[progress1.length - 1], 1, 'first transition should complete')
		ok(progress2[progress2.length - 1] < 1, 'second transition should not complete yet')

		dispose1[Symbol.dispose]()
		dispose2[Symbol.dispose]()
	} finally {
		mocks.cleanup()
	}
})

test('makeTransition - dispose stops further frames', () => {
	const mocks = setupRAFMocks()
	try {
		let callCount = 0

		const dispose = makeTransition(() => {
			callCount++
		}, 1000)

		mocks.tick(0)
		mocks.tick(50)
		strictEqual(callCount, 2, 'callback should be called twice')

		dispose[Symbol.dispose]()
		mocks.tick(50)
		mocks.tick(50)

		strictEqual(callCount, 2, 'callback should not be called after disposal')
	} finally {
		mocks.cleanup()
	}
})

test('makeTransition - progress never exceeds 1', () => {
	const mocks = setupRAFMocks()
	try {
		const progressValues: number[] = []

		const dispose = makeTransition(progress => {
			progressValues.push(progress)
		}, 100)

		mocks.tick(0)
		mocks.tick(100)
		mocks.tick(100) // Way past duration
		mocks.tick(100) // Way past duration

		for (const progress of progressValues) {
			ok(progress <= 1, `progress should not exceed 1, got ${progress}`)
		}

		dispose[Symbol.dispose]()
	} finally {
		mocks.cleanup()
	}
})

test('makeTransition - progress is always non-negative', () => {
	const mocks = setupRAFMocks()
	try {
		const progressValues: number[] = []

		const dispose = makeTransition(progress => {
			progressValues.push(progress)
		}, 100)

		mocks.tick(0)
		mocks.tick(50)
		mocks.tick(60)

		for (const progress of progressValues) {
			ok(progress >= 0, `progress should be non-negative, got ${progress}`)
		}

		dispose[Symbol.dispose]()
	} finally {
		mocks.cleanup()
	}
})
