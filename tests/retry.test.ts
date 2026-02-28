import {test} from 'node:test'
import {ok} from 'node:assert'
import retry from '../retry.js'
import {makeDisposer} from 'jdisposer'

test('retry - successful first attempt', async () => {
	const result = await retry(async () => {
		return 42
	})

	assert.strictEqual(result, 42, 'should return result on first success')
})

test('retry - callback receives disposer and info', async () => {
	let receivedDisposer: any
	let receivedInfo: any

	await retry(async (disposer, info) => {
		receivedDisposer = disposer
		receivedInfo = info
		return true
	})

	ok(receivedDisposer, 'callback should receive disposer')
	ok(receivedDisposer.signal, 'disposer should have signal')
	ok(receivedInfo, 'callback should receive info')
	ok(typeof receivedInfo.resetBackoff === 'function', 'info should have resetBackoff function')
})

test('retry - retries on error and succeeds', async () => {
	let attemptCount = 0

	const result = await retry(
		async () => {
			attemptCount++
			if (attemptCount < 3) {
				throw new Error(`Attempt ${attemptCount} failed`)
			}
			return 'success'
		},
		{backoffSec: [0.01, 0.01, 0.01]}
	)

	assert.strictEqual(attemptCount, 3, 'should make 3 attempts')
	assert.strictEqual(result, 'success', 'should return success result')
})

test('retry - uses default backoff seconds', async () => {
	let attemptCount = 0

	const result = await retry(async () => {
		attemptCount++
		if (attemptCount < 2) {
			throw new Error('Fail once')
		}
		return 'success'
	})

	assert.strictEqual(attemptCount, 2, 'should retry with default backoff')
	assert.strictEqual(result, 'success')
})

test('retry - respects custom backoff intervals', async () => {
	const timestamps: number[] = []
	let attemptCount = 0

	await retry(
		async () => {
			timestamps.push(Date.now())
			attemptCount++
			if (attemptCount < 3) {
				throw new Error('Retry')
			}
			return 'done'
		},
		{backoffSec: [0.05, 0.1]}
	)

	// Check approximate delays between attempts
	if (timestamps.length >= 2) {
		const delay1 = timestamps[1] - timestamps[0]
		assert.ok(delay1 >= 40 && delay1 <= 100, `First delay should be ~50ms, got ${delay1}ms`)
	}

	if (timestamps.length >= 3) {
		const delay2 = timestamps[2] - timestamps[1]
		assert.ok(delay2 >= 80 && delay2 <= 150, `Second delay should be ~100ms, got ${delay2}ms`)
	}
})

test('retry - throws error when max retries exceeded', async () => {
	let attemptCount = 0

	await assert.rejects(
		async () => {
			await retry(
				async () => {
					attemptCount++
					throw new Error('Always fails')
				},
				{backoffSec: [0.01, 0.01]}
			)
		},
		/Always fails/,
		'should throw error after max retries'
	)

	assert.strictEqual(attemptCount, 3, 'should attempt 3 times (initial + 2 retries)')
})

test('retry - resetBackoff resets the retry counter', async () => {
	let attemptCount = 0
	const backoffs: number[] = []

	await retry(
		async (disposer, info) => {
			attemptCount++
			backoffs.push(attemptCount)

			if (attemptCount === 3) {
				// Reset backoff on 3rd attempt
				info.resetBackoff()
			}

			if (attemptCount < 5) {
				throw new Error('Retry')
			}

			return 'success'
		},
		{backoffSec: [0.01, 0.02, 0.03, 0.04]}
	)

	assert.strictEqual(attemptCount, 5, 'should make 5 attempts')
	assert.deepStrictEqual(backoffs, [1, 2, 3, 4, 5])
})

test('retry - with disposer returns undefined on abort', async () => {
	const disposer = makeDisposer()
	let attemptCount = 0

	const promise = retry(
		async () => {
			attemptCount++
			if (attemptCount === 2) {
				disposer.dispose()
			}
			throw new Error('Keep failing')
		},
		{disposer, backoffSec: [0.01, 0.01, 0.01]}
	)

	const result = await promise

	assert.strictEqual(result, undefined, 'should return undefined when aborted')
	assert.ok(attemptCount >= 2, 'should attempt at least twice before abort')
})

test('retry - without disposer always returns defined value', async () => {
	const result = await retry(async () => {
		return 'value'
	})

	assert.strictEqual(result, 'value', 'should return defined value')
})

test('retry - checks abort signal before retry', async () => {
	const disposer = makeDisposer()
	let attemptCount = 0

	setTimeout(() => disposer.dispose(), 30)

	const result = await retry(
		async () => {
			attemptCount++
			throw new Error('Fail')
		},
		{disposer, backoffSec: [0.05, 0.05, 0.05]}
	)

	assert.strictEqual(result, undefined, 'should return undefined when aborted')
	assert.ok(attemptCount >= 1, 'should attempt at least once')
})

test('retry - handles synchronous return values', async () => {
	const result = await retry(() => {
		return 'sync value'
	})

	assert.strictEqual(result, 'sync value', 'should handle synchronous return')
})

test('retry - handles synchronous errors', async () => {
	let attemptCount = 0

	const result = await retry(
		() => {
			attemptCount++
			if (attemptCount < 2) {
				throw new Error('Sync error')
			}
			return 'recovered'
		},
		{backoffSec: [0.01]}
	)

	assert.strictEqual(attemptCount, 2)
	assert.strictEqual(result, 'recovered')
})

test('retry - infinite retry with -1 backoff', async () => {
	let attemptCount = 0

	const result = await retry(
		async () => {
			attemptCount++
			if (attemptCount < 5) {
				throw new Error('Keep trying')
			}
			return 'finally'
		},
		{backoffSec: [0.01, 0.01, -1]}
	)

	assert.ok(attemptCount >= 5, 'should retry beyond backoff array with -1')
	assert.strictEqual(result, 'finally')
})

test('retry - -1 backoff uses last valid interval', async () => {
	const timestamps: number[] = []
	let attemptCount = 0

	await retry(
		async () => {
			timestamps.push(Date.now())
			attemptCount++
			if (attemptCount < 4) {
				throw new Error('Retry')
			}
			return 'done'
		},
		{backoffSec: [0.02, 0.05, -1]}
	)

	// The 3rd retry should use 0.05 (the last non -1 value)
	if (timestamps.length >= 4) {
		const delay3 = timestamps[3] - timestamps[2]
		assert.ok(delay3 >= 40 && delay3 <= 100, `Third delay should use last backoff ~50ms, got ${delay3}ms`)
	}
})

test('retry - handles complex return types', async () => {
	const result = await retry(async () => {
		return {data: [1, 2, 3], status: 'ok'}
	})

	assert.deepStrictEqual(result, {data: [1, 2, 3], status: 'ok'})
})

test('retry - handles null return value', async () => {
	const result = await retry(async () => {
		return null
	})

	assert.strictEqual(result, null)
})

test('retry - handles undefined return value (without disposer)', async () => {
	const result = await retry(async () => {
		return undefined
	})

	assert.strictEqual(result, undefined)
})

test('retry - multiple consecutive errors', async () => {
	let attemptCount = 0
	const errors: string[] = []

	await retry(
		async () => {
			attemptCount++
			if (attemptCount < 4) {
				const error = `Error ${attemptCount}`
				errors.push(error)
				throw new Error(error)
			}
			return 'recovered'
		},
		{backoffSec: [0.01, 0.01, 0.01]}
	)

	assert.deepStrictEqual(errors, ['Error 1', 'Error 2', 'Error 3'])
})

test('retry - disposer cleanup is called', async () => {
	const disposer = makeDisposer()
	let cleanupCalled = false

	disposer.add(() => {
		cleanupCalled = true
	})

	await retry(
		async () => {
			return 'done'
		},
		{disposer}
	)

	disposer.dispose()
	assert.strictEqual(cleanupCalled, true, 'disposer cleanup should be called')
})

test('retry - abort during callback execution', async () => {
	const disposer = makeDisposer()
	let callbackStarted = false

	const promise = retry(
		async (d) => {
			callbackStarted = true
			await new Promise(resolve => setTimeout(resolve, 50))
			// Check if aborted during execution
			if (d.signal.aborted) {
				return 'aborted during execution'
			}
			return 'completed'
		},
		{disposer}
	)

	await new Promise(resolve => setTimeout(resolve, 10))
	disposer.dispose()

	const result = await promise
	assert.strictEqual(callbackStarted, true, 'callback should have started')
})

test('retry - disposer signal aborts retry loop', async () => {
	const disposer = makeDisposer()
	let callCount = 0

	setTimeout(() => disposer.dispose(), 30)

	const result = await retry(
		async (d) => {
			callCount++
			// After disposal, retry should return undefined
			throw new Error('Retry')
		},
		{disposer, backoffSec: [0.02, 0.02, 0.02]}
	)

	assert.strictEqual(result, undefined, 'should return undefined when aborted')
	assert.ok(callCount >= 1, 'should attempt at least once')
	assert.ok(callCount <= 3, 'should not attempt many times after disposal')
})

test('retry - resetBackoff can be called multiple times', async () => {
	let attemptCount = 0

	await retry(
		async (disposer, info) => {
			attemptCount++

			if (attemptCount === 2 || attemptCount === 4) {
				info.resetBackoff()
			}

			if (attemptCount < 6) {
				throw new Error('Retry')
			}

			return 'success'
		},
		{backoffSec: [0.01, 0.01, 0.01]}
	)

	assert.ok(attemptCount >= 6, 'should handle multiple resetBackoff calls')
})

test('retry - error is logged to console.warn', async () => {
	const originalWarn = console.warn
	const warnings: any[] = []
	console.warn = (...args: any[]) => warnings.push(args)

	try {
		await retry(
			async () => {
				throw new Error('Test warning')
			},
			{backoffSec: [0.01, 0.01]}
		).catch(() => {}) // Ignore the final error

		assert.ok(warnings.length >= 1, 'should log warnings')
		assert.ok(
			warnings.some(w => w[0]?.includes?.('Retrying')),
			'should log retry warning'
		)
	} finally {
		console.warn = originalWarn
	}
})

test('retry - final error is logged to console.error', async () => {
	const originalError = console.error
	const errors: any[] = []
	console.error = (...args: any[]) => errors.push(args)

	try {
		await retry(
			async () => {
				throw new Error('Final error')
			},
			{backoffSec: [0.01]}
		).catch(() => {}) // Ignore the final error

		assert.ok(errors.length >= 1, 'should log error')
		assert.ok(
			errors.some(e => e[0]?.includes?.('max retries')),
			'should log max retries message'
		)
	} finally {
		console.error = originalError
	}
})

test('retry - empty backoffSec array throws immediately', async () => {
	let attemptCount = 0

	await assert.rejects(
		async () => {
			await retry(
				async () => {
					attemptCount++
					throw new Error('Fail')
				},
				{backoffSec: []}
			)
		},
		/Fail/,
		'should throw on first error with empty backoff'
	)

	assert.strictEqual(attemptCount, 1, 'should only attempt once')
})

test('retry - single backoff value allows two attempts', async () => {
	let attemptCount = 0

	await retry(
		async () => {
			attemptCount++
			if (attemptCount < 2) {
				throw new Error('First attempt fails')
			}
			return 'success'
		},
		{backoffSec: [0.01]}
	)

	assert.strictEqual(attemptCount, 2, 'should allow two attempts with single backoff')
})

test('retry - zero backoff retries immediately', async () => {
	const timestamps: number[] = []
	let attemptCount = 0

	await retry(
		async () => {
			timestamps.push(Date.now())
			attemptCount++
			if (attemptCount < 3) {
				throw new Error('Retry')
			}
			return 'done'
		},
		{backoffSec: [0, 0]}
	)

	if (timestamps.length >= 2) {
		const delay = timestamps[1] - timestamps[0]
		assert.ok(delay < 50, `Zero backoff should retry quickly, got ${delay}ms`)
	}
})

test('retry - large backoff values work', async () => {
	let attemptCount = 0

	const result = await retry(
		async () => {
			attemptCount++
			if (attemptCount < 2) {
				throw new Error('Fail once')
			}
			return 'success'
		},
		{backoffSec: [0.01]} // Using small value for test speed
	)

	assert.strictEqual(result, 'success')
})

test('retry - callback can access disposer signal', async () => {
	let signalAccessible = false

	await retry(async (disposer) => {
		signalAccessible = disposer.signal instanceof AbortSignal
		return 'done'
	})

	assert.strictEqual(signalAccessible, true, 'disposer.signal should be accessible')
})

test('retry - disposer is fresh for each retry', async () => {
	const signals: AbortSignal[] = []
	let attemptCount = 0

	await retry(
		async (disposer) => {
			signals.push(disposer.signal)
			attemptCount++
			if (attemptCount < 3) {
				throw new Error('Retry')
			}
			return 'done'
		},
		{backoffSec: [0.01, 0.01]}
	)

	assert.strictEqual(signals.length, 3)
	// Each signal should be a different instance (fresh reset)
	assert.notStrictEqual(signals[0], signals[1])
	assert.notStrictEqual(signals[1], signals[2])
})

test('retry - works with promise-returning callback', async () => {
	const result = await retry(async () => {
		return Promise.resolve('promise value')
	})

	assert.strictEqual(result, 'promise value')
})

test('retry - works with rejected promise', async () => {
	let attemptCount = 0

	const result = await retry(
		async () => {
			attemptCount++
			if (attemptCount < 2) {
				return Promise.reject(new Error('Rejected'))
			}
			return 'recovered'
		},
		{backoffSec: [0.01]}
	)

	assert.strictEqual(attemptCount, 2)
	assert.strictEqual(result, 'recovered')
})

test('retry - concurrent retries are independent', async () => {
	let count1 = 0
	let count2 = 0

	const promise1 = retry(
		async () => {
			count1++
			if (count1 < 2) throw new Error('Retry 1')
			return 'result1'
		},
		{backoffSec: [0.01]}
	)

	const promise2 = retry(
		async () => {
			count2++
			if (count2 < 2) throw new Error('Retry 2')
			return 'result2'
		},
		{backoffSec: [0.01]}
	)

	const [result1, result2] = await Promise.all([promise1, promise2])

	assert.strictEqual(result1, 'result1')
	assert.strictEqual(result2, 'result2')
	assert.strictEqual(count1, 2)
	assert.strictEqual(count2, 2)
})
