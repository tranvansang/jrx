import {test} from 'node:test'
import {ok, strictEqual, doesNotThrow, deepStrictEqual} from 'node:assert'
import {addTimeout} from '../index.js'

test('addTimeout - returns a disposer function', () => {
	const dispose = addTimeout(() => {}, 100)
	ok(typeof dispose === 'function', 'addTimeout should return a disposer function')
	dispose()
})

test('addTimeout - callback is called after the specified delay', async () => {
	let called = false
	const startTime = Date.now()

	const dispose = addTimeout(() => {
		called = true
	}, 50)

	strictEqual(called, false, 'callback should not be called immediately')

	await new Promise((resolve) => setTimeout(resolve, 60))

	strictEqual(called, true, 'callback should be called after delay')

	const elapsed = Date.now() - startTime
	ok(elapsed >= 50, `elapsed time should be at least 50ms, got ${elapsed}ms`)

	dispose()
})

test('addTimeout - callback timing is approximately correct', async () => {
	const delay = 100
	const startTime = Date.now()
	let callTime: number | undefined

	const dispose = addTimeout(() => {
		callTime = Date.now()
	}, delay)

	await new Promise((resolve) => setTimeout(resolve, delay + 20))

	ok(callTime !== undefined, 'callback should have been called')

	const elapsed = callTime! - startTime
	// Allow some tolerance (±30ms)
	ok(
		elapsed >= delay - 30 && elapsed <= delay + 30,
		`elapsed time should be around ${delay}ms, got ${elapsed}ms`
	)

	dispose()
})

test('addTimeout - disposer cancels the timeout', async () => {
	let called = false

	const dispose = addTimeout(() => {
		called = true
	}, 50)

	dispose()

	await new Promise((resolve) => setTimeout(resolve, 70))

	strictEqual(called, false, 'callback should not be called after disposal')
})

test('addTimeout - disposer can be called before timeout fires', async () => {
	let called = false

	const dispose = addTimeout(() => {
		called = true
	}, 100)

	await new Promise((resolve) => setTimeout(resolve, 30))
	dispose()

	await new Promise((resolve) => setTimeout(resolve, 100))

	strictEqual(called, false, 'callback should not be called after early disposal')
})

test('addTimeout - multiple disposals are safe', async () => {
	const dispose = addTimeout(() => {}, 100)

	doesNotThrow(() => {
		dispose()
		dispose()
		dispose()
	}, 'multiple disposal calls should be safe')

	await new Promise((resolve) => setTimeout(resolve, 120))
})

test('addTimeout - disposer after timeout has fired is safe', async () => {
	let called = false

	const dispose = addTimeout(() => {
		called = true
	}, 50)

	await new Promise((resolve) => setTimeout(resolve, 70))

	strictEqual(called, true, 'callback should be called')

	doesNotThrow(() => {
		dispose()
	}, 'disposal after timeout fired should be safe')
})

test('addTimeout - zero delay works', async () => {
	let called = false

	const dispose = addTimeout(() => {
		called = true
	}, 0)

	strictEqual(called, false, 'callback should not be called synchronously')

	await new Promise((resolve) => setTimeout(resolve, 10))

	strictEqual(called, true, 'callback should be called with zero delay')
	dispose()
})

test('addTimeout - large delay works', async () => {
	let called = false

	const dispose = addTimeout(() => {
		called = true
	}, 10000)

	await new Promise((resolve) => setTimeout(resolve, 50))

	strictEqual(called, false, 'callback should not be called before delay')
	dispose()
})

test('addTimeout - callback is called only once', async () => {
	let callCount = 0

	const dispose = addTimeout(() => {
		callCount++
	}, 50)

	await new Promise((resolve) => setTimeout(resolve, 70))
	await new Promise((resolve) => setTimeout(resolve, 70))

	strictEqual(callCount, 1, 'callback should be called exactly once')
	dispose()
})

test('addTimeout - callback with no return value works', async () => {
	let called = false

	const dispose = addTimeout(() => {
		called = true
		// No return value
	}, 50)

	await new Promise((resolve) => setTimeout(resolve, 70))

	strictEqual(called, true, 'callback should be called')
	dispose()
})

test('addTimeout - callback returning a value works', async () => {
	let called = false

	const dispose = addTimeout(() => {
		called = true
		return 'some value'
	}, 50)

	await new Promise((resolve) => setTimeout(resolve, 70))

	strictEqual(called, true, 'callback should be called')
	dispose()
})

test('addTimeout - callback without errors works', async () => {
	let called = false

	const dispose = addTimeout(() => {
		called = true
		// Note: errors in callbacks are NOT caught
	}, 50)

	await new Promise((resolve) => setTimeout(resolve, 70))

	strictEqual(called, true, 'callback should have been called')
	dispose()
})

test('addTimeout - multiple independent timeouts work correctly', async () => {
	let count1 = 0
	let count2 = 0
	let count3 = 0

	const dispose1 = addTimeout(() => {
		count1++
	}, 30)

	const dispose2 = addTimeout(() => {
		count2++
	}, 60)

	const dispose3 = addTimeout(() => {
		count3++
	}, 90)

	await new Promise((resolve) => setTimeout(resolve, 45))
	strictEqual(count1, 1, 'first timeout should have fired')
	strictEqual(count2, 0, 'second timeout should not have fired yet')
	strictEqual(count3, 0, 'third timeout should not have fired yet')

	await new Promise((resolve) => setTimeout(resolve, 35))
	strictEqual(count2, 1, 'second timeout should have fired')
	strictEqual(count3, 0, 'third timeout should not have fired yet')

	await new Promise((resolve) => setTimeout(resolve, 35))
	strictEqual(count3, 1, 'third timeout should have fired')

	dispose1()
	dispose2()
	dispose3()
})

test('addTimeout - canceling one timeout does not affect others', async () => {
	let count1 = 0
	let count2 = 0

	const dispose1 = addTimeout(() => {
		count1++
	}, 50)

	const dispose2 = addTimeout(() => {
		count2++
	}, 50)

	dispose1()

	await new Promise((resolve) => setTimeout(resolve, 70))

	strictEqual(count1, 0, 'first timeout should not have fired')
	strictEqual(count2, 1, 'second timeout should have fired')

	dispose2()
})

test('addTimeout - callback captures closure correctly', async () => {
	const results: number[] = []

	for (let i = 0; i < 3; i++) {
		addTimeout(() => {
			results.push(i)
		}, 50)
	}

	await new Promise((resolve) => setTimeout(resolve, 70))

	deepStrictEqual(results, [0, 1, 2], 'closures should be captured correctly')
})

test('addTimeout - state from outer scope is accessible', async () => {
	let externalState = 'initial'
	let capturedState: string | undefined

	const dispose = addTimeout(() => {
		capturedState = externalState
	}, 50)

	externalState = 'modified'

	await new Promise((resolve) => setTimeout(resolve, 70))

	strictEqual(capturedState, 'modified', 'callback should access modified external state')
	dispose()
})

test('addTimeout - very short delays work correctly', async () => {
	const calls: number[] = []

	addTimeout(() => calls.push(1), 1)
	addTimeout(() => calls.push(2), 2)
	addTimeout(() => calls.push(3), 3)

	await new Promise((resolve) => setTimeout(resolve, 20))

	deepStrictEqual(calls, [1, 2, 3], 'timeouts with very short delays should fire in order')
})

test('addTimeout - disposal immediately after creation works', () => {
	let called = false

	const dispose = addTimeout(() => {
		called = true
	}, 50)

	dispose()

	doesNotThrow(() => dispose(), 'immediate disposal should work')
})

test('addTimeout - callback receives no parameters', async () => {
	let receivedArgs: any[] | undefined

	const dispose = addTimeout((...args: any[]) => {
		receivedArgs = args
	}, 50)

	await new Promise((resolve) => setTimeout(resolve, 70))

	ok(receivedArgs !== undefined, 'callback should have been called')
	strictEqual(receivedArgs!.length, 0, 'callback should receive no arguments')
	dispose()
})

test('addTimeout - works with async callback', async () => {
	let called = false

	const dispose = addTimeout(async () => {
		await new Promise((resolve) => setTimeout(resolve, 10))
		called = true
	}, 50)

	await new Promise((resolve) => setTimeout(resolve, 80))

	strictEqual(called, true, 'async callback should be called')
	dispose()
})
