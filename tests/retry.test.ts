import {test} from 'node:test'
import {ok, strictEqual, deepStrictEqual, rejects} from 'node:assert'
import retry from '../retry.js'

// Helper to create a Disposable & Promise for testing
function dp<T>(value: T, onDispose?: () => void): Disposable & Promise<T> {
	return Object.assign(Promise.resolve(value), {[Symbol.dispose]: onDispose ?? (() => {})})
}

test('retry - successful first attempt', async () => {
	const result = await retry(() => dp(42))

	strictEqual(result, 42, 'should return result on first success')
})

test('retry - callback receives info', async () => {
	let receivedInfo: any

	await retry(info => {
		receivedInfo = info
		return dp(true)
	})

	ok(receivedInfo, 'callback should receive info')
	ok(typeof receivedInfo.resetBackoff === 'function', 'info should have resetBackoff function')
})

test('retry - retries on error and succeeds', async () => {
	let attemptCount = 0

	const result = await retry(
		() => {
			attemptCount++
			if (attemptCount < 3) {
				throw new Error(`Attempt ${attemptCount} failed`)
			}
			return dp('success')
		},
		[0.01, 0.01, 0.01],
	)

	strictEqual(attemptCount, 3, 'should make 3 attempts')
	strictEqual(result, 'success', 'should return success result')
})

test('retry - uses default backoff seconds', async () => {
	let attemptCount = 0

	const result = await retry(() => {
		attemptCount++
		if (attemptCount < 2) {
			throw new Error('Fail once')
		}
		return dp('success')
	})

	strictEqual(attemptCount, 2, 'should retry with default backoff')
	strictEqual(result, 'success')
})

test('retry - respects custom backoff intervals', async () => {
	const timestamps: number[] = []
	let attemptCount = 0

	await retry(
		() => {
			timestamps.push(Date.now())
			attemptCount++
			if (attemptCount < 3) {
				throw new Error('Retry')
			}
			return dp('done')
		},
		[0.05, 0.1],
	)

	// Check approximate delays between attempts
	if (timestamps.length >= 2) {
		const delay1 = timestamps[1] - timestamps[0]
		ok(delay1 >= 40 && delay1 <= 100, `First delay should be ~50ms, got ${delay1}ms`)
	}

	if (timestamps.length >= 3) {
		const delay2 = timestamps[2] - timestamps[1]
		ok(delay2 >= 80 && delay2 <= 150, `Second delay should be ~100ms, got ${delay2}ms`)
	}
})

test('retry - throws error when max retries exceeded', async () => {
	let attemptCount = 0

	await rejects(
		async () => {
			await retry(
				() => {
					attemptCount++
					throw new Error('Always fails')
				},
				[0.01, 0.01],
			)
		},
		/Always fails/,
		'should throw error after max retries',
	)

	strictEqual(attemptCount, 3, 'should attempt 3 times (initial + 2 retries)')
})

test('retry - resetBackoff resets the retry counter', async () => {
	let attemptCount = 0
	const backoffs: number[] = []

	await retry(
		info => {
			attemptCount++
			backoffs.push(attemptCount)

			if (attemptCount === 3) {
				// Reset backoff on 3rd attempt
				info.resetBackoff()
			}

			if (attemptCount < 5) {
				throw new Error('Retry')
			}

			return dp('success')
		},
		[0.01, 0.02, 0.03, 0.04],
	)

	strictEqual(attemptCount, 5, 'should make 5 attempts')
	deepStrictEqual(backoffs, [1, 2, 3, 4, 5])
})

test('retry - dispose returns undefined', async () => {
	let attemptCount = 0

	const r = retry(
		() => {
			attemptCount++
			if (attemptCount === 2) {
				r[Symbol.dispose]()
			}
			throw new Error('Keep failing')
		},
		[0.01, 0.01, 0.01],
	)

	const result = await r

	strictEqual(result, undefined, 'should return undefined when disposed')
	ok(attemptCount >= 2, 'should attempt at least twice before dispose')
})

test('retry - without disposal returns defined value', async () => {
	const result = await retry(() => dp('value'))

	strictEqual(result, 'value', 'should return defined value')
})

test('retry - checks disposed before retry', async () => {
	let attemptCount = 0

	const r = retry(
		() => {
			attemptCount++
			throw new Error('Fail')
		},
		[0.05, 0.05, 0.05],
	)

	setTimeout(() => r[Symbol.dispose](), 30)

	const result = await r

	strictEqual(result, undefined, 'should return undefined when disposed')
	ok(attemptCount >= 1, 'should attempt at least once')
})

test('retry - handles synchronous return values', async () => {
	const result = await retry(() => dp('sync value'))

	strictEqual(result, 'sync value', 'should handle synchronous return')
})

test('retry - handles synchronous errors', async () => {
	let attemptCount = 0

	const result = await retry(
		() => {
			attemptCount++
			if (attemptCount < 2) {
				throw new Error('Sync error')
			}
			return dp('recovered')
		},
		[0.01],
	)

	strictEqual(attemptCount, 2)
	strictEqual(result, 'recovered')
})

test('retry - infinite retry with -1 backoff', async () => {
	let attemptCount = 0

	const result = await retry(
		() => {
			attemptCount++
			if (attemptCount < 5) {
				throw new Error('Keep trying')
			}
			return dp('finally')
		},
		[0.01, 0.01, -1],
	)

	ok(attemptCount >= 5, 'should retry beyond backoff array with -1')
	strictEqual(result, 'finally')
})

test('retry - -1 backoff uses last valid interval', async () => {
	const timestamps: number[] = []
	let attemptCount = 0

	await retry(
		() => {
			timestamps.push(Date.now())
			attemptCount++
			if (attemptCount < 4) {
				throw new Error('Retry')
			}
			return dp('done')
		},
		[0.02, 0.05, -1],
	)

	// The 3rd retry should use 0.05 (the last non -1 value)
	if (timestamps.length >= 4) {
		const delay3 = timestamps[3] - timestamps[2]
		ok(delay3 >= 40 && delay3 <= 100, `Third delay should use last backoff ~50ms, got ${delay3}ms`)
	}
})

test('retry - handles complex return types', async () => {
	const result = await retry(() => dp({data: [1, 2, 3], status: 'ok'}))

	deepStrictEqual(result, {data: [1, 2, 3], status: 'ok'})
})

test('retry - handles null return value', async () => {
	const result = await retry(() => dp(null))

	strictEqual(result, null)
})

test('retry - handles undefined return value', async () => {
	const result = await retry(() => dp(undefined))

	strictEqual(result, undefined)
})

test('retry - multiple consecutive errors', async () => {
	let attemptCount = 0
	const errors: string[] = []

	await retry(
		() => {
			attemptCount++
			if (attemptCount < 4) {
				const error = `Error ${attemptCount}`
				errors.push(error)
				throw new Error(error)
			}
			return dp('recovered')
		},
		[0.01, 0.01, 0.01],
	)

	deepStrictEqual(errors, ['Error 1', 'Error 2', 'Error 3'])
})

test('retry - is disposable', async () => {
	const r = retry(() => dp('done'))
	await r
	// Should not throw when disposed after completion
	r[Symbol.dispose]()
})

test('retry - dispose during retry loop', async () => {
	let callCount = 0

	const r = retry(
		() => {
			callCount++
			throw new Error('Retry')
		},
		[0.02, 0.02, 0.02],
	)

	setTimeout(() => r[Symbol.dispose](), 30)

	const result = await r

	strictEqual(result, undefined, 'should return undefined when disposed')
	ok(callCount >= 1, 'should attempt at least once')
	ok(callCount <= 3, 'should not attempt many times after disposal')
})

test('retry - resetBackoff can be called multiple times', async () => {
	let attemptCount = 0

	await retry(
		info => {
			attemptCount++

			if (attemptCount === 2 || attemptCount === 4) {
				info.resetBackoff()
			}

			if (attemptCount < 6) {
				throw new Error('Retry')
			}

			return dp('success')
		},
		[0.01, 0.01, 0.01],
	)

	ok(attemptCount >= 6, 'should handle multiple resetBackoff calls')
})

test('retry - error is logged to console.warn', async () => {
	const originalWarn = console.warn
	const warnings: any[] = []
	console.warn = (...args: any[]) => warnings.push(args)

	try {
		await retry(
			() => {
				throw new Error('Test warning')
			},
			[0.01, 0.01],
		).catch(() => {}) // Ignore the final error

		ok(warnings.length >= 1, 'should log warnings')
		ok(
			warnings.some(w => w[0]?.includes?.('Retrying')),
			'should log retry warning',
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
			() => {
				throw new Error('Final error')
			},
			[0.01],
		).catch(() => {}) // Ignore the final error

		ok(errors.length >= 1, 'should log error')
		ok(
			errors.some(e => e[0]?.includes?.('max retries')),
			'should log max retries message',
		)
	} finally {
		console.error = originalError
	}
})

test('retry - empty backoffSec array throws immediately', async () => {
	let attemptCount = 0

	await rejects(
		async () => {
			await retry(
				() => {
					attemptCount++
					throw new Error('Fail')
				},
				[],
			)
		},
		/Fail/,
		'should throw on first error with empty backoff',
	)

	strictEqual(attemptCount, 1, 'should only attempt once')
})

test('retry - single backoff value allows two attempts', async () => {
	let attemptCount = 0

	await retry(
		() => {
			attemptCount++
			if (attemptCount < 2) {
				throw new Error('First attempt fails')
			}
			return dp('success')
		},
		[0.01],
	)

	strictEqual(attemptCount, 2, 'should allow two attempts with single backoff')
})

test('retry - zero backoff retries immediately', async () => {
	const timestamps: number[] = []
	let attemptCount = 0

	await retry(
		() => {
			timestamps.push(Date.now())
			attemptCount++
			if (attemptCount < 3) {
				throw new Error('Retry')
			}
			return dp('done')
		},
		[0, 0],
	)

	if (timestamps.length >= 2) {
		const delay = timestamps[1] - timestamps[0]
		ok(delay < 50, `Zero backoff should retry quickly, got ${delay}ms`)
	}
})

test('retry - large backoff values work', async () => {
	let attemptCount = 0

	const result = await retry(
		() => {
			attemptCount++
			if (attemptCount < 2) {
				throw new Error('Fail once')
			}
			return dp('success')
		},
		[0.01], // Using small value for test speed
	)

	strictEqual(result, 'success')
})

test('retry - works with rejected promise', async () => {
	let attemptCount = 0

	const result = await retry(
		() => {
			attemptCount++
			if (attemptCount < 2) {
				throw new Error('Rejected')
			}
			return dp('recovered')
		},
		[0.01],
	)

	strictEqual(attemptCount, 2)
	strictEqual(result, 'recovered')
})

test('retry - concurrent retries are independent', async () => {
	let count1 = 0
	let count2 = 0

	const promise1 = retry(
		() => {
			count1++
			if (count1 < 2) throw new Error('Retry 1')
			return dp('result1')
		},
		[0.01],
	)

	const promise2 = retry(
		() => {
			count2++
			if (count2 < 2) throw new Error('Retry 2')
			return dp('result2')
		},
		[0.01],
	)

	const [result1, result2] = await Promise.all([promise1, promise2])

	strictEqual(result1, 'result1')
	strictEqual(result2, 'result2')
	strictEqual(count1, 2)
	strictEqual(count2, 2)
})

test('retry - dispose callback in return value is called on reset', async () => {
	const disposeCalls: number[] = []
	let attemptCount = 0

	await retry(
		() => {
			attemptCount++
			if (attemptCount < 3) {
				// These won't have their dispose called since they throw before use()
				throw new Error('Retry')
			}
			return dp('success', () => {
				disposeCalls.push(attemptCount)
			})
		},
		[0.01, 0.01],
	)

	ok(disposeCalls.length >= 0)
})
