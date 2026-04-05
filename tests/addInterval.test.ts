import {test} from 'node:test'
import {ok, strictEqual, doesNotThrow, deepStrictEqual} from 'node:assert'
import {addInterval} from '../index.js'

test('addInterval - returns a disposer function', () => {
	const dispose = addInterval(() => {}, 100)
	ok(typeof dispose === 'function', 'addInterval should return a disposer function')
	dispose()
})

test('addInterval - callback is called immediately', () => {
	let called = false
	const dispose = addInterval(() => {
		called = true
	}, 100)

	strictEqual(called, true, 'callback should be called immediately')
	dispose()
})

test('addInterval - callback is called repeatedly', async () => {
	const calls: number[] = []
	const dispose = addInterval(() => {
		calls.push(Date.now())
	}, 50)

	await new Promise((resolve) => setTimeout(resolve, 150))
	dispose()

	// Should be called at least 3 times (immediately, then after 50ms, then after 100ms)
	ok(calls.length >= 3, `callback should be called at least 3 times, got ${calls.length}`)
})

test('addInterval - callback timing is approximately correct', async () => {
	const calls: number[] = []
	const interval = 50
	const dispose = addInterval(() => {
		calls.push(Date.now())
	}, interval)

	await new Promise((resolve) => setTimeout(resolve, 150))
	dispose()

	// Check intervals between calls (skip first since it's immediate)
	for (let i = 1; i < calls.length; i++) {
		const diff = calls[i] - calls[i - 1]
		// Allow some tolerance (30ms-70ms range)
		ok(
			diff >= interval - 20 && diff <= interval + 20,
			`interval between calls should be around ${interval}ms, got ${diff}ms`
		)
	}
})

test('addInterval - disposer stops the interval', async () => {
	let callCount = 0
	const dispose = addInterval(() => {
		callCount++
	}, 50)

	await new Promise((resolve) => setTimeout(resolve, 30))
	dispose()

	const countAfterDispose = callCount
	await new Promise((resolve) => setTimeout(resolve, 100))

	strictEqual(callCount, countAfterDispose, 'callback should not be called after disposal')
})

test('addInterval - callback can return a cleanup function', async () => {
	let cleanupCount = 0
	const dispose = addInterval(() => {
		return () => {
			cleanupCount++
		}
	}, 50)

	await new Promise((resolve) => setTimeout(resolve, 120))
	dispose()

	// Cleanup should be called before each subsequent callback (not for the last one until dispose)
	// If called 3 times, cleanup should be called 3 times (2 before next callbacks + 1 on dispose)
	ok(cleanupCount >= 2, `cleanup should be called at least 2 times, got ${cleanupCount}`)
})

test('addInterval - cleanup is called before each callback execution', async () => {
	const events: string[] = []

	const dispose = addInterval(() => {
		events.push('callback')
		return () => {
			events.push('cleanup')
		}
	}, 50)

	await new Promise((resolve) => setTimeout(resolve, 120))
	dispose()

	// Pattern should be: callback, cleanup, callback, cleanup, callback, cleanup
	for (let i = 0; i < events.length; i++) {
		if (i % 2 === 0) {
			strictEqual(events[i], 'callback', `event at index ${i} should be callback`)
		} else {
			strictEqual(events[i], 'cleanup', `event at index ${i} should be cleanup`)
		}
	}
})

test('addInterval - disposer calls cleanup', () => {
	let cleanupCalled = false
	const dispose = addInterval(() => {
		return () => {
			cleanupCalled = true
		}
	}, 100)

	dispose()
	strictEqual(cleanupCalled, true, 'cleanup should be called when disposed')
})

test('addInterval - multiple disposals are safe', () => {
	const dispose = addInterval(() => {}, 100)

	doesNotThrow(() => {
		dispose()
		dispose()
		dispose()
	}, 'multiple disposal calls should be safe')
})

test('addInterval - callback returning undefined is handled', async () => {
	let callCount = 0
	const dispose = addInterval(() => {
		callCount++
		return undefined
	}, 50)

	await new Promise((resolve) => setTimeout(resolve, 120))
	dispose()

	ok(callCount >= 3, 'callback should be called multiple times even when returning undefined')
})

test('addInterval - callback can return various values', async () => {
	let callCount = 0
	const dispose = addInterval(() => {
		callCount++
		// Return undefined or a cleanup function - both are valid
		if (callCount % 2 === 0) {
			return () => {} // cleanup function
		}
		return undefined // no cleanup
	}, 50)

	await new Promise((resolve) => setTimeout(resolve, 120))
	dispose()

	ok(callCount >= 2, 'callback should be called multiple times')
})

test('addInterval - zero interval works', async () => {
	let callCount = 0
	const dispose = addInterval(() => {
		callCount++
	}, 0)

	await new Promise((resolve) => setTimeout(resolve, 50))
	dispose()

	ok(callCount >= 3, 'callback should be called multiple times even with 0 interval')
})

test('addInterval - large interval works', () => {
	let callCount = 0
	const dispose = addInterval(() => {
		callCount++
	}, 10000)

	strictEqual(callCount, 1, 'callback should be called once immediately')
	dispose()
})

test('addInterval - callback not throwing error works', async () => {
	let callCount = 0
	const dispose = addInterval(() => {
		callCount++
		// Note: errors in callbacks are NOT caught by addInterval
		// This test verifies normal operation without errors
	}, 50)

	await new Promise((resolve) => setTimeout(resolve, 120))
	dispose()

	ok(callCount >= 2, 'callback should be called multiple times')
})

test('addInterval - cleanup without errors works', async () => {
	let callCount = 0
	let cleanupCount = 0
	const dispose = addInterval(() => {
		callCount++
		return () => {
			cleanupCount++
			// Note: errors in cleanup are NOT caught by addInterval
			// This test verifies normal cleanup operation
		}
	}, 50)

	await new Promise((resolve) => setTimeout(resolve, 120))
	dispose()

	ok(callCount >= 2, 'callback should be called multiple times')
	ok(cleanupCount >= 1, 'cleanup should be called')
})

test('addInterval - dispose after callback execution', async () => {
	let callCount = 0

	const dispose = addInterval(() => {
		callCount++
	}, 50)

	await new Promise((resolve) => setTimeout(resolve, 80))
	dispose()

	const countAfterDispose = callCount
	await new Promise((resolve) => setTimeout(resolve, 100))

	strictEqual(callCount, countAfterDispose, 'callback should not be called after disposal')
	ok(callCount >= 2, 'callback should have been called at least twice before disposal')
})

test('addInterval - state is maintained across calls', async () => {
	const values: number[] = []
	let counter = 0

	const dispose = addInterval(() => {
		counter++
		values.push(counter)
	}, 50)

	await new Promise((resolve) => setTimeout(resolve, 120))
	dispose()

	deepStrictEqual(values, [1, 2, 3], 'state should be maintained across calls')
})
