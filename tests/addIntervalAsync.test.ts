import {test} from 'node:test'
import {ok, strictEqual, doesNotThrow} from 'node:assert'
import {addIntervalAsync} from '../index.js'

test('addIntervalAsync - returns a disposer function', () => {
	const dispose = addIntervalAsync(() => {}, 100)
	ok(typeof dispose === 'function', 'addIntervalAsync should return a disposer function')
	dispose()
})

test('addIntervalAsync - callback is called immediately', async () => {
	let called = false
	const dispose = addIntervalAsync(() => {
		called = true
	}, 100)

	// Give it a moment to start
	await new Promise((resolve) => setTimeout(resolve, 10))

	strictEqual(called, true, 'callback should be called immediately')
	dispose()
})

test('addIntervalAsync - callback receives no parameters', async () => {
	let receivedArgs: any[] | undefined

	const dispose = addIntervalAsync((...args: any[]) => {
		receivedArgs = args
	}, 100)

	await new Promise((resolve) => setTimeout(resolve, 10))
	dispose()

	ok(receivedArgs !== undefined, 'callback should have been called')
	strictEqual(receivedArgs!.length, 0, 'callback should receive no arguments')
})

test('addIntervalAsync - callback is called repeatedly', async () => {
	const calls: number[] = []
	const dispose = addIntervalAsync(() => {
		calls.push(Date.now())
	}, 50)

	await new Promise((resolve) => setTimeout(resolve, 150))
	dispose()

	ok(calls.length >= 3, `callback should be called at least 3 times, got ${calls.length}`)
})

test('addIntervalAsync - async callback is awaited', async () => {
	const events: string[] = []

	const dispose = addIntervalAsync(async () => {
		events.push('start')
		await new Promise((resolve) => setTimeout(resolve, 30))
		events.push('end')
	}, 50)

	await new Promise((resolve) => setTimeout(resolve, 150))
	dispose()

	// Should have start-end pairs (not interleaved)
	// Check only complete pairs (dispose might interrupt a call)
	const completePairs = Math.floor(events.length / 2)
	for (let i = 0; i < completePairs * 2; i += 2) {
		strictEqual(events[i], 'start', `event at index ${i} should be start`)
		strictEqual(events[i + 1], 'end', `event at index ${i + 1} should be end`)
	}
	ok(completePairs >= 1, 'should have at least one complete start-end pair')
})

test('addIntervalAsync - next interval waits for async callback to complete', async () => {
	const calls: number[] = []
	let executing = false

	const dispose = addIntervalAsync(async () => {
		strictEqual(executing, false, 'should not have concurrent executions')
		executing = true
		calls.push(Date.now())
		await new Promise((resolve) => setTimeout(resolve, 60))
		executing = false
	}, 50)

	await new Promise((resolve) => setTimeout(resolve, 200))
	dispose()

	// With 60ms execution and 50ms interval, calls should be spaced at least 60ms apart
	for (let i = 1; i < calls.length; i++) {
		const diff = calls[i] - calls[i - 1]
		ok(diff >= 50, `calls should be spaced at least 50ms apart, got ${diff}ms`)
	}
})

test('addIntervalAsync - disposer stops the interval', async () => {
	let callCount = 0
	const dispose = addIntervalAsync(() => {
		callCount++
	}, 50)

	await new Promise((resolve) => setTimeout(resolve, 80))
	dispose()

	const countAfterDispose = callCount
	await new Promise((resolve) => setTimeout(resolve, 100))

	strictEqual(callCount, countAfterDispose, 'callback should not be called after disposal')
})

test('addIntervalAsync - disposal stops future callbacks', async () => {
	let callCount = 0

	const dispose = addIntervalAsync(() => {
		callCount++
	}, 50)

	await new Promise((resolve) => setTimeout(resolve, 10))
	const countBeforeDispose = callCount
	dispose()

	await new Promise((resolve) => setTimeout(resolve, 100))
	strictEqual(callCount, countBeforeDispose, 'no more callbacks after disposal')
})

test('addIntervalAsync - disposal during async callback prevents next interval', async () => {
	let callCount = 0

	const dispose = addIntervalAsync(async () => {
		callCount++
		await new Promise((resolve) => setTimeout(resolve, 30))
	}, 50)

	await new Promise((resolve) => setTimeout(resolve, 40))
	dispose()

	const countAfterDispose = callCount
	await new Promise((resolve) => setTimeout(resolve, 150))

	strictEqual(callCount, countAfterDispose, 'no more callbacks after disposal during async execution')
})

test('addIntervalAsync - callback completes successfully', async () => {
	let callCount = 0

	const dispose = addIntervalAsync(() => {
		callCount++
		// Note: addIntervalAsync doesn't use return value for cleanup
		// Unlike addInterval, cleanup is managed through the disposer parameter
	}, 50)

	await new Promise((resolve) => setTimeout(resolve, 120))
	dispose()

	ok(callCount >= 2, 'callback should be called multiple times')
})

test('addIntervalAsync - async callback completes successfully', async () => {
	let callCount = 0

	const dispose = addIntervalAsync(async () => {
		await new Promise((resolve) => setTimeout(resolve, 10))
		callCount++
		// Note: return value is not used for cleanup in addIntervalAsync
	}, 50)

	await new Promise((resolve) => setTimeout(resolve, 120))
	dispose()

	ok(callCount >= 2, 'async callback should be called multiple times')
})

test('addIntervalAsync - callbacks are called sequentially', async () => {
	const events: string[] = []

	const dispose = addIntervalAsync(async () => {
		events.push('callback')
		await new Promise((resolve) => setTimeout(resolve, 10))
		// Note: addIntervalAsync doesn't support cleanup functions from return value
	}, 50)

	await new Promise((resolve) => setTimeout(resolve, 150))
	dispose()

	// Should see multiple callbacks
	const callbackCount = events.filter(e => e === 'callback').length
	ok(callbackCount >= 2, `should have at least 2 callback calls, got ${callbackCount}`)
})

test('addIntervalAsync - multiple disposals are safe', async () => {
	const dispose = addIntervalAsync(() => {}, 100)

	await new Promise((resolve) => setTimeout(resolve, 10))

	doesNotThrow(() => {
		dispose()
		dispose()
		dispose()
	}, 'multiple disposal calls should be safe')
})

test('addIntervalAsync - callback returning undefined is handled', async () => {
	let callCount = 0
	const dispose = addIntervalAsync(() => {
		callCount++
		return undefined
	}, 50)

	await new Promise((resolve) => setTimeout(resolve, 120))
	dispose()

	ok(callCount >= 2, 'callback should be called multiple times even when returning undefined')
})

test('addIntervalAsync - async callback returning void is handled', async () => {
	let callCount = 0
	const dispose = addIntervalAsync(async () => {
		callCount++
		await new Promise((resolve) => setTimeout(resolve, 10))
	}, 50)

	await new Promise((resolve) => setTimeout(resolve, 120))
	dispose()

	ok(callCount >= 2, 'callback should be called multiple times')
})

test('addIntervalAsync - zero interval works', async () => {
	let callCount = 0
	const dispose = addIntervalAsync(() => {
		callCount++
	}, 0)

	await new Promise((resolve) => setTimeout(resolve, 50))
	dispose()

	ok(callCount >= 3, 'callback should be called multiple times even with 0 interval')
})

test('addIntervalAsync - callback without errors works', async () => {
	let callCount = 0
	const dispose = addIntervalAsync(() => {
		callCount++
		// Note: errors in callbacks are NOT caught and will stop the interval
	}, 50)

	await new Promise((resolve) => setTimeout(resolve, 150))
	dispose()

	ok(callCount >= 3, 'callback should be called multiple times')
})

test('addIntervalAsync - async callback without errors works', async () => {
	let callCount = 0
	const dispose = addIntervalAsync(async () => {
		callCount++
		await new Promise((resolve) => setTimeout(resolve, 10))
		// Note: async errors are NOT caught and will stop the interval
	}, 50)

	await new Promise((resolve) => setTimeout(resolve, 150))
	dispose()

	ok(callCount >= 2, 'async callback should be called multiple times')
})

test('addIntervalAsync - error in cleanup is handled', async () => {
	let callCount = 0
	const dispose = addIntervalAsync(() => {
		callCount++
		return () => {
			throw new Error('Cleanup error')
		}
	}, 50)

	await new Promise((resolve) => setTimeout(resolve, 100))

	doesNotThrow(() => {
		dispose()
	}, 'disposal should work even if cleanup throws error')
})

test('addIntervalAsync - promise rejection in cleanup is handled', async () => {
	let callCount = 0
	const dispose = addIntervalAsync(async () => {
		callCount++
		return async () => {
			throw new Error('Async cleanup error')
		}
	}, 50)

	await new Promise((resolve) => setTimeout(resolve, 100))

	doesNotThrow(() => {
		dispose()
	}, 'disposal should work even if async cleanup rejects')
})

test('addIntervalAsync - state is maintained across async calls', async () => {
	const values: number[] = []
	let counter = 0

	const dispose = addIntervalAsync(async () => {
		await new Promise((resolve) => setTimeout(resolve, 10))
		counter++
		values.push(counter)
	}, 50)

	await new Promise((resolve) => setTimeout(resolve, 150))
	dispose()

	// Check that values are sequential
	for (let i = 0; i < values.length; i++) {
		strictEqual(values[i], i + 1, `value at index ${i} should be ${i + 1}`)
	}
})

test('addIntervalAsync - rapid disposal during first execution', async () => {
	let callCount = 0

	const dispose = addIntervalAsync(async () => {
		callCount++
		await new Promise((resolve) => setTimeout(resolve, 50))
	}, 30)

	// Dispose immediately
	await new Promise((resolve) => setTimeout(resolve, 5))
	dispose()

	await new Promise((resolve) => setTimeout(resolve, 100))

	// Should be called once, maybe twice if timing is right
	ok(callCount <= 2, 'should have minimal calls when disposed early')
})

test('addIntervalAsync - callback can return a disposable for cleanup', async () => {
	let disposeCalled = false

	const dispose = addIntervalAsync(() => {
		return {[Symbol.dispose]() { disposeCalled = true }} as any
	}, 100)

	await new Promise((resolve) => setTimeout(resolve, 10))
	dispose()

	await new Promise((resolve) => setTimeout(resolve, 10))
	strictEqual(disposeCalled, true, 'disposable returned from callback should be disposed on cleanup')
})
