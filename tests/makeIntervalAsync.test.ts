import {test} from 'node:test'
import {ok, strictEqual, doesNotThrow} from 'node:assert'
import {createIntervalAsync} from '../index.js'

test('createIntervalAsync - returns a Disposable', () => {
	const dispose = createIntervalAsync(() => {}, 100)
	ok(Symbol.dispose in dispose, 'createIntervalAsync should return a Disposable')
	dispose[Symbol.dispose]()
})

test('createIntervalAsync - callback is called immediately', async () => {
	let called = false
	const dispose = createIntervalAsync(() => {
		called = true
	}, 100)

	// Give it a moment to start
	await new Promise(resolve => setTimeout(resolve, 10))

	strictEqual(called, true, 'callback should be called immediately')
	dispose[Symbol.dispose]()
})

test('createIntervalAsync - callback receives no parameters', async () => {
	let receivedArgs: any[] | undefined

	const dispose = createIntervalAsync((...args: any[]) => {
		receivedArgs = args
	}, 100)

	await new Promise(resolve => setTimeout(resolve, 10))
	dispose[Symbol.dispose]()

	ok(receivedArgs !== undefined, 'callback should have been called')
	strictEqual(receivedArgs!.length, 0, 'callback should receive no arguments')
})

test('createIntervalAsync - callback is called repeatedly', async () => {
	const calls: number[] = []
	const dispose = createIntervalAsync(() => {
		calls.push(Date.now())
	}, 50)

	await new Promise(resolve => setTimeout(resolve, 150))
	dispose[Symbol.dispose]()

	ok(calls.length >= 3, `callback should be called at least 3 times, got ${calls.length}`)
})

test('createIntervalAsync - async callback is awaited', async () => {
	const events: string[] = []

	const dispose = createIntervalAsync(async () => {
		events.push('start')
		await new Promise(resolve => setTimeout(resolve, 30))
		events.push('end')
	}, 50)

	await new Promise(resolve => setTimeout(resolve, 150))
	dispose[Symbol.dispose]()

	// Should have start-end pairs (not interleaved)
	// Check only complete pairs (dispose might interrupt a call)
	const completePairs = Math.floor(events.length / 2)
	for (let i = 0; i < completePairs * 2; i += 2) {
		strictEqual(events[i], 'start', `event at index ${i} should be start`)
		strictEqual(events[i + 1], 'end', `event at index ${i + 1} should be end`)
	}
	ok(completePairs >= 1, 'should have at least one complete start-end pair')
})

test('createIntervalAsync - next interval waits for async callback to complete', async () => {
	const calls: number[] = []
	let executing = false

	const dispose = createIntervalAsync(async () => {
		strictEqual(executing, false, 'should not have concurrent executions')
		executing = true
		calls.push(Date.now())
		await new Promise(resolve => setTimeout(resolve, 60))
		executing = false
	}, 50)

	await new Promise(resolve => setTimeout(resolve, 200))
	dispose[Symbol.dispose]()

	// With 60ms execution and 50ms interval, calls should be spaced at least 60ms apart
	for (let i = 1; i < calls.length; i++) {
		const diff = calls[i] - calls[i - 1]
		ok(diff >= 50, `calls should be spaced at least 50ms apart, got ${diff}ms`)
	}
})

test('createIntervalAsync - disposer stops the interval', async () => {
	let callCount = 0
	const dispose = createIntervalAsync(() => {
		callCount++
	}, 50)

	await new Promise(resolve => setTimeout(resolve, 80))
	dispose[Symbol.dispose]()

	const countAfterDispose = callCount
	await new Promise(resolve => setTimeout(resolve, 100))

	strictEqual(callCount, countAfterDispose, 'callback should not be called after disposal')
})

test('createIntervalAsync - disposal stops future callbacks', async () => {
	let callCount = 0

	const dispose = createIntervalAsync(() => {
		callCount++
	}, 50)

	await new Promise(resolve => setTimeout(resolve, 10))
	const countBeforeDispose = callCount
	dispose[Symbol.dispose]()

	await new Promise(resolve => setTimeout(resolve, 100))
	strictEqual(callCount, countBeforeDispose, 'no more callbacks after disposal')
})

test('createIntervalAsync - disposal during async callback prevents next interval', async () => {
	let callCount = 0

	const dispose = createIntervalAsync(async () => {
		callCount++
		await new Promise(resolve => setTimeout(resolve, 30))
	}, 50)

	await new Promise(resolve => setTimeout(resolve, 40))
	dispose[Symbol.dispose]()

	const countAfterDispose = callCount
	await new Promise(resolve => setTimeout(resolve, 150))

	strictEqual(callCount, countAfterDispose, 'no more callbacks after disposal during async execution')
})

test('createIntervalAsync - callback completes successfully', async () => {
	let callCount = 0

	const dispose = createIntervalAsync(() => {
		callCount++
		// Note: createIntervalAsync doesn't use return value for cleanup
		// Unlike createInterval, cleanup is managed through the disposer parameter
	}, 50)

	await new Promise(resolve => setTimeout(resolve, 120))
	dispose[Symbol.dispose]()

	ok(callCount >= 2, 'callback should be called multiple times')
})

test('createIntervalAsync - async callback completes successfully', async () => {
	let callCount = 0

	const dispose = createIntervalAsync(async () => {
		await new Promise(resolve => setTimeout(resolve, 10))
		callCount++
		// Note: return value is not used for cleanup in createIntervalAsync
	}, 50)

	await new Promise(resolve => setTimeout(resolve, 120))
	dispose[Symbol.dispose]()

	ok(callCount >= 2, 'async callback should be called multiple times')
})

test('createIntervalAsync - callbacks are called sequentially', async () => {
	const events: string[] = []

	const dispose = createIntervalAsync(async () => {
		events.push('callback')
		await new Promise(resolve => setTimeout(resolve, 10))
		// Note: createIntervalAsync doesn't support cleanup functions from return value
	}, 50)

	await new Promise(resolve => setTimeout(resolve, 150))
	dispose[Symbol.dispose]()

	// Should see multiple callbacks
	const callbackCount = events.filter(e => e === 'callback').length
	ok(callbackCount >= 2, `should have at least 2 callback calls, got ${callbackCount}`)
})

test('createIntervalAsync - multiple disposals are safe', async () => {
	const dispose = createIntervalAsync(() => {}, 100)

	await new Promise(resolve => setTimeout(resolve, 10))

	doesNotThrow(() => {
		dispose[Symbol.dispose]()
		dispose[Symbol.dispose]()
		dispose[Symbol.dispose]()
	}, 'multiple disposal calls should be safe')
})

test('createIntervalAsync - callback returning undefined is handled', async () => {
	let callCount = 0
	const dispose = createIntervalAsync(() => {
		callCount++
		return undefined
	}, 50)

	await new Promise(resolve => setTimeout(resolve, 120))
	dispose[Symbol.dispose]()

	ok(callCount >= 2, 'callback should be called multiple times even when returning undefined')
})

test('createIntervalAsync - async callback returning void is handled', async () => {
	let callCount = 0
	const dispose = createIntervalAsync(async () => {
		callCount++
		await new Promise(resolve => setTimeout(resolve, 10))
	}, 50)

	await new Promise(resolve => setTimeout(resolve, 120))
	dispose[Symbol.dispose]()

	ok(callCount >= 2, 'callback should be called multiple times')
})

test('createIntervalAsync - zero interval works', async () => {
	let callCount = 0
	const dispose = createIntervalAsync(() => {
		callCount++
	}, 0)

	await new Promise(resolve => setTimeout(resolve, 50))
	dispose[Symbol.dispose]()

	ok(callCount >= 3, 'callback should be called multiple times even with 0 interval')
})

test('createIntervalAsync - callback without errors works', async () => {
	let callCount = 0
	const dispose = createIntervalAsync(() => {
		callCount++
		// Note: errors in callbacks are NOT caught and will stop the interval
	}, 50)

	await new Promise(resolve => setTimeout(resolve, 150))
	dispose[Symbol.dispose]()

	ok(callCount >= 3, 'callback should be called multiple times')
})

test('createIntervalAsync - async callback without errors works', async () => {
	let callCount = 0
	const dispose = createIntervalAsync(async () => {
		callCount++
		await new Promise(resolve => setTimeout(resolve, 10))
		// Note: async errors are NOT caught and will stop the interval
	}, 50)

	await new Promise(resolve => setTimeout(resolve, 150))
	dispose[Symbol.dispose]()

	ok(callCount >= 2, 'async callback should be called multiple times')
})

test('createIntervalAsync - cleanup disposable is disposed on reset', async () => {
	let disposeCount = 0
	const dispose = createIntervalAsync(() => {
		return {
			[Symbol.dispose]() {
				disposeCount++
			},
		}
	}, 50)

	await new Promise(resolve => setTimeout(resolve, 120))
	dispose[Symbol.dispose]()

	ok(disposeCount >= 2, 'cleanup disposable should be disposed on each reset')
})

test('createIntervalAsync - sync callback returning disposable is cleaned up', async () => {
	let disposeCount = 0
	const dispose = createIntervalAsync(() => {
		return {
			[Symbol.dispose]() {
				disposeCount++
			},
		}
	}, 50)

	await new Promise(resolve => setTimeout(resolve, 120))
	dispose[Symbol.dispose]()

	ok(disposeCount >= 2, 'sync cleanup disposable should be disposed on each reset')
})

test('createIntervalAsync - state is maintained across async calls', async () => {
	const values: number[] = []
	let counter = 0

	const dispose = createIntervalAsync(async () => {
		await new Promise(resolve => setTimeout(resolve, 10))
		counter++
		values.push(counter)
	}, 50)

	await new Promise(resolve => setTimeout(resolve, 150))
	dispose[Symbol.dispose]()

	// Check that values are sequential
	for (let i = 0; i < values.length; i++) {
		strictEqual(values[i], i + 1, `value at index ${i} should be ${i + 1}`)
	}
})

test('createIntervalAsync - rapid disposal during first execution', async () => {
	let callCount = 0

	const dispose = createIntervalAsync(async () => {
		callCount++
		await new Promise(resolve => setTimeout(resolve, 50))
	}, 30)

	// Dispose immediately
	await new Promise(resolve => setTimeout(resolve, 5))
	dispose[Symbol.dispose]()

	await new Promise(resolve => setTimeout(resolve, 100))

	// Should be called once, maybe twice if timing is right
	ok(callCount <= 2, 'should have minimal calls when disposed early')
})

test('createIntervalAsync - callback can return a disposable for cleanup', async () => {
	let disposeCalled = false

	const dispose = createIntervalAsync(() => {
		return {
			[Symbol.dispose]() {
				disposeCalled = true
			},
		}
	}, 100)

	await new Promise(resolve => setTimeout(resolve, 10))
	dispose[Symbol.dispose]()

	await new Promise(resolve => setTimeout(resolve, 10))
	strictEqual(disposeCalled, true, 'disposable returned from callback should be disposed on cleanup')
})
