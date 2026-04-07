import {test} from 'node:test'
import {ok, strictEqual, doesNotThrow, deepStrictEqual} from 'node:assert'
import {makeTimeout} from '../index.js'

test('makeTimeout - returns a disposer function', () => {
	const dispose = makeTimeout(() => {}, 100)
	ok(typeof dispose === 'function', 'makeTimeout should return a disposer function')
	dispose()
})

test('makeTimeout - callback is called after the specified delay', async () => {
	let called = false
	const startTime = Date.now()

	const dispose = makeTimeout(() => {
		called = true
	}, 50)

	strictEqual(called, false, 'callback should not be called immediately')

	await new Promise(resolve => setTimeout(resolve, 60))

	strictEqual(called, true, 'callback should be called after delay')

	const elapsed = Date.now() - startTime
	ok(elapsed >= 50, `elapsed time should be at least 50ms, got ${elapsed}ms`)

	dispose()
})

test('makeTimeout - callback timing is approximately correct', async () => {
	const delay = 100
	const startTime = Date.now()
	let callTime: number | undefined

	const dispose = makeTimeout(() => {
		callTime = Date.now()
	}, delay)

	await new Promise(resolve => setTimeout(resolve, delay + 20))

	ok(callTime !== undefined, 'callback should have been called')

	const elapsed = callTime! - startTime
	// Allow some tolerance (±30ms)
	ok(elapsed >= delay - 30 && elapsed <= delay + 30, `elapsed time should be around ${delay}ms, got ${elapsed}ms`)

	dispose()
})

test('makeTimeout - disposer cancels the timeout', async () => {
	let called = false

	const dispose = makeTimeout(() => {
		called = true
	}, 50)

	dispose()

	await new Promise(resolve => setTimeout(resolve, 70))

	strictEqual(called, false, 'callback should not be called after disposal')
})

test('makeTimeout - disposer can be called before timeout fires', async () => {
	let called = false

	const dispose = makeTimeout(() => {
		called = true
	}, 100)

	await new Promise(resolve => setTimeout(resolve, 30))
	dispose()

	await new Promise(resolve => setTimeout(resolve, 100))

	strictEqual(called, false, 'callback should not be called after early disposal')
})

test('makeTimeout - multiple disposals are safe', async () => {
	const dispose = makeTimeout(() => {}, 100)

	doesNotThrow(() => {
		dispose()
		dispose()
		dispose()
	}, 'multiple disposal calls should be safe')

	await new Promise(resolve => setTimeout(resolve, 120))
})

test('makeTimeout - disposer after timeout has fired is safe', async () => {
	let called = false

	const dispose = makeTimeout(() => {
		called = true
	}, 50)

	await new Promise(resolve => setTimeout(resolve, 70))

	strictEqual(called, true, 'callback should be called')

	doesNotThrow(() => {
		dispose()
	}, 'disposal after timeout fired should be safe')
})

test('makeTimeout - zero delay works', async () => {
	let called = false

	const dispose = makeTimeout(() => {
		called = true
	}, 0)

	strictEqual(called, false, 'callback should not be called synchronously')

	await new Promise(resolve => setTimeout(resolve, 10))

	strictEqual(called, true, 'callback should be called with zero delay')
	dispose()
})

test('makeTimeout - large delay works', async () => {
	let called = false

	const dispose = makeTimeout(() => {
		called = true
	}, 10000)

	await new Promise(resolve => setTimeout(resolve, 50))

	strictEqual(called, false, 'callback should not be called before delay')
	dispose()
})

test('makeTimeout - callback is called only once', async () => {
	let callCount = 0

	const dispose = makeTimeout(() => {
		callCount++
	}, 50)

	await new Promise(resolve => setTimeout(resolve, 70))
	await new Promise(resolve => setTimeout(resolve, 70))

	strictEqual(callCount, 1, 'callback should be called exactly once')
	dispose()
})

test('makeTimeout - callback with no return value works', async () => {
	let called = false

	const dispose = makeTimeout(() => {
		called = true
		// No return value
	}, 50)

	await new Promise(resolve => setTimeout(resolve, 70))

	strictEqual(called, true, 'callback should be called')
	dispose()
})

test('makeTimeout - callback returning a value works', async () => {
	let called = false

	const dispose = makeTimeout(() => {
		called = true
		return 'some value'
	}, 50)

	await new Promise(resolve => setTimeout(resolve, 70))

	strictEqual(called, true, 'callback should be called')
	dispose()
})

test('makeTimeout - callback without errors works', async () => {
	let called = false

	const dispose = makeTimeout(() => {
		called = true
		// Note: errors in callbacks are NOT caught
	}, 50)

	await new Promise(resolve => setTimeout(resolve, 70))

	strictEqual(called, true, 'callback should have been called')
	dispose()
})

test('makeTimeout - multiple independent timeouts work correctly', async () => {
	let count1 = 0
	let count2 = 0
	let count3 = 0

	const dispose1 = makeTimeout(() => {
		count1++
	}, 30)

	const dispose2 = makeTimeout(() => {
		count2++
	}, 60)

	const dispose3 = makeTimeout(() => {
		count3++
	}, 90)

	await new Promise(resolve => setTimeout(resolve, 45))
	strictEqual(count1, 1, 'first timeout should have fired')
	strictEqual(count2, 0, 'second timeout should not have fired yet')
	strictEqual(count3, 0, 'third timeout should not have fired yet')

	await new Promise(resolve => setTimeout(resolve, 35))
	strictEqual(count2, 1, 'second timeout should have fired')
	strictEqual(count3, 0, 'third timeout should not have fired yet')

	await new Promise(resolve => setTimeout(resolve, 35))
	strictEqual(count3, 1, 'third timeout should have fired')

	dispose1()
	dispose2()
	dispose3()
})

test('makeTimeout - canceling one timeout does not affect others', async () => {
	let count1 = 0
	let count2 = 0

	const dispose1 = makeTimeout(() => {
		count1++
	}, 50)

	const dispose2 = makeTimeout(() => {
		count2++
	}, 50)

	dispose1()

	await new Promise(resolve => setTimeout(resolve, 70))

	strictEqual(count1, 0, 'first timeout should not have fired')
	strictEqual(count2, 1, 'second timeout should have fired')

	dispose2()
})

test('makeTimeout - callback captures closure correctly', async () => {
	const results: number[] = []

	for (let i = 0; i < 3; i++) {
		makeTimeout(() => {
			results.push(i)
		}, 50)
	}

	await new Promise(resolve => setTimeout(resolve, 70))

	deepStrictEqual(results, [0, 1, 2], 'closures should be captured correctly')
})

test('makeTimeout - state from outer scope is accessible', async () => {
	let externalState = 'initial'
	let capturedState: string | undefined

	const dispose = makeTimeout(() => {
		capturedState = externalState
	}, 50)

	externalState = 'modified'

	await new Promise(resolve => setTimeout(resolve, 70))

	strictEqual(capturedState, 'modified', 'callback should access modified external state')
	dispose()
})

test('makeTimeout - very short delays work correctly', async () => {
	const calls: number[] = []

	makeTimeout(() => calls.push(1), 1)
	makeTimeout(() => calls.push(2), 2)
	makeTimeout(() => calls.push(3), 3)

	await new Promise(resolve => setTimeout(resolve, 20))

	deepStrictEqual(calls, [1, 2, 3], 'timeouts with very short delays should fire in order')
})

test('makeTimeout - disposal immediately after creation works', () => {
	let called = false

	const dispose = makeTimeout(() => {
		called = true
	}, 50)

	dispose()

	doesNotThrow(() => dispose(), 'immediate disposal should work')
})

test('makeTimeout - callback receives no parameters', async () => {
	let receivedArgs: any[] | undefined

	const dispose = makeTimeout((...args: any[]) => {
		receivedArgs = args
	}, 50)

	await new Promise(resolve => setTimeout(resolve, 70))

	ok(receivedArgs !== undefined, 'callback should have been called')
	strictEqual(receivedArgs!.length, 0, 'callback should receive no arguments')
	dispose()
})

test('makeTimeout - works with async callback', async () => {
	let called = false

	const dispose = makeTimeout(async () => {
		await new Promise(resolve => setTimeout(resolve, 10))
		called = true
	}, 50)

	await new Promise(resolve => setTimeout(resolve, 80))

	strictEqual(called, true, 'async callback should be called')
	dispose()
})
