import {test} from 'node:test'
import {ok, strictEqual, doesNotThrow, deepStrictEqual} from 'node:assert'
import {makeInterval} from '../index.js'

test('makeInterval - returns a disposable object', () => {
	const dispose = makeInterval(() => {}, 100)
	ok(Symbol.dispose in dispose, 'makeInterval should return a disposable object')
	dispose[Symbol.dispose]()
})

test('makeInterval - callback is called immediately', () => {
	let called = false
	const dispose = makeInterval(() => {
		called = true
	}, 100)

	strictEqual(called, true, 'callback should be called immediately')
	dispose[Symbol.dispose]()
})

test('makeInterval - callback is called repeatedly', async () => {
	const calls: number[] = []
	const dispose = makeInterval(() => {
		calls.push(Date.now())
	}, 50)

	await new Promise(resolve => setTimeout(resolve, 150))
	dispose[Symbol.dispose]()

	// Should be called at least 3 times (immediately, then after 50ms, then after 100ms)
	ok(calls.length >= 3, `callback should be called at least 3 times, got ${calls.length}`)
})

test('makeInterval - callback timing is approximately correct', async () => {
	const calls: number[] = []
	const interval = 50
	const dispose = makeInterval(() => {
		calls.push(Date.now())
	}, interval)

	await new Promise(resolve => setTimeout(resolve, 150))
	dispose[Symbol.dispose]()

	// Check intervals between calls (skip first since it's immediate)
	for (let i = 1; i < calls.length; i++) {
		const diff = calls[i] - calls[i - 1]
		// Allow some tolerance (30ms-70ms range)
		ok(
			diff >= interval - 20 && diff <= interval + 20,
			`interval between calls should be around ${interval}ms, got ${diff}ms`,
		)
	}
})

test('makeInterval - disposer stops the interval', async () => {
	let callCount = 0
	const dispose = makeInterval(() => {
		callCount++
	}, 50)

	await new Promise(resolve => setTimeout(resolve, 30))
	dispose[Symbol.dispose]()

	const countAfterDispose = callCount
	await new Promise(resolve => setTimeout(resolve, 100))

	strictEqual(callCount, countAfterDispose, 'callback should not be called after disposal')
})

test('makeInterval - callback can return a cleanup disposable', async () => {
	let cleanupCount = 0
	const dispose = makeInterval(() => {
		return {
			[Symbol.dispose]() {
				cleanupCount++
			},
		}
	}, 50)

	await new Promise(resolve => setTimeout(resolve, 120))
	dispose[Symbol.dispose]()

	// Cleanup should be called before each subsequent callback (not for the last one until dispose)
	// If called 3 times, cleanup should be called 3 times (2 before next callbacks + 1 on dispose)
	ok(cleanupCount >= 2, `cleanup should be called at least 2 times, got ${cleanupCount}`)
})

test('makeInterval - cleanup is called before each callback execution', async () => {
	const events: string[] = []

	const dispose = makeInterval(() => {
		events.push('callback')
		return {
			[Symbol.dispose]() {
				events.push('cleanup')
			},
		}
	}, 50)

	await new Promise(resolve => setTimeout(resolve, 120))
	dispose[Symbol.dispose]()

	// Pattern should be: callback, cleanup, callback, cleanup, callback, cleanup
	for (let i = 0; i < events.length; i++) {
		if (i % 2 === 0) {
			strictEqual(events[i], 'callback', `event at index ${i} should be callback`)
		} else {
			strictEqual(events[i], 'cleanup', `event at index ${i} should be cleanup`)
		}
	}
})

test('makeInterval - disposer calls cleanup', () => {
	let cleanupCalled = false
	const dispose = makeInterval(() => {
		return {
			[Symbol.dispose]() {
				cleanupCalled = true
			},
		}
	}, 100)

	dispose[Symbol.dispose]()
	strictEqual(cleanupCalled, true, 'cleanup should be called when disposed')
})

test('makeInterval - multiple disposals are safe', () => {
	const dispose = makeInterval(() => {}, 100)

	doesNotThrow(() => {
		dispose[Symbol.dispose]()
		dispose[Symbol.dispose]()
		dispose[Symbol.dispose]()
	}, 'multiple disposal calls should be safe')
})

test('makeInterval - callback returning undefined is handled', async () => {
	let callCount = 0
	const dispose = makeInterval(() => {
		callCount++
		return undefined
	}, 50)

	await new Promise(resolve => setTimeout(resolve, 120))
	dispose[Symbol.dispose]()

	ok(callCount >= 3, 'callback should be called multiple times even when returning undefined')
})

test('makeInterval - callback can return various values', async () => {
	let callCount = 0
	const dispose = makeInterval(() => {
		callCount++
		// Return undefined or a cleanup disposable - both are valid
		if (callCount % 2 === 0) {
			return {[Symbol.dispose]() {}} // cleanup disposable
		}
		return undefined // no cleanup
	}, 50)

	await new Promise(resolve => setTimeout(resolve, 120))
	dispose[Symbol.dispose]()

	ok(callCount >= 2, 'callback should be called multiple times')
})

test('makeInterval - zero interval works', async () => {
	let callCount = 0
	const dispose = makeInterval(() => {
		callCount++
	}, 0)

	await new Promise(resolve => setTimeout(resolve, 50))
	dispose[Symbol.dispose]()

	ok(callCount >= 3, 'callback should be called multiple times even with 0 interval')
})

test('makeInterval - large interval works', () => {
	let callCount = 0
	const dispose = makeInterval(() => {
		callCount++
	}, 10000)

	strictEqual(callCount, 1, 'callback should be called once immediately')
	dispose[Symbol.dispose]()
})

test('makeInterval - callback not throwing error works', async () => {
	let callCount = 0
	const dispose = makeInterval(() => {
		callCount++
		// Note: errors in callbacks are NOT caught by makeInterval
		// This test verifies normal operation without errors
	}, 50)

	await new Promise(resolve => setTimeout(resolve, 120))
	dispose[Symbol.dispose]()

	ok(callCount >= 2, 'callback should be called multiple times')
})

test('makeInterval - cleanup without errors works', async () => {
	let callCount = 0
	let cleanupCount = 0
	const dispose = makeInterval(() => {
		callCount++
		return {
			[Symbol.dispose]() {
				cleanupCount++
				// Note: errors in cleanup are NOT caught by makeInterval
				// This test verifies normal cleanup operation
			},
		}
	}, 50)

	await new Promise(resolve => setTimeout(resolve, 120))
	dispose[Symbol.dispose]()

	ok(callCount >= 2, 'callback should be called multiple times')
	ok(cleanupCount >= 1, 'cleanup should be called')
})

test('makeInterval - dispose after callback execution', async () => {
	let callCount = 0

	const dispose = makeInterval(() => {
		callCount++
	}, 50)

	await new Promise(resolve => setTimeout(resolve, 80))
	dispose[Symbol.dispose]()

	const countAfterDispose = callCount
	await new Promise(resolve => setTimeout(resolve, 100))

	strictEqual(callCount, countAfterDispose, 'callback should not be called after disposal')
	ok(callCount >= 2, 'callback should have been called at least twice before disposal')
})

test('makeInterval - state is maintained across calls', async () => {
	const values: number[] = []
	let counter = 0

	const dispose = makeInterval(() => {
		counter++
		values.push(counter)
	}, 50)

	await new Promise(resolve => setTimeout(resolve, 120))
	dispose[Symbol.dispose]()

	deepStrictEqual(values, [1, 2, 3], 'state should be maintained across calls')
})
