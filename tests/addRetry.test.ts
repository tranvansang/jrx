import {test} from 'node:test'
import {ok, strictEqual, doesNotThrow} from 'node:assert'
import {addRetry} from '../retry.js'

test('addRetry - returns a dispose function', () => {
	const dispose = addRetry(async () => 'value')
	ok(typeof dispose === 'function', 'addRetry should return a dispose function')
	dispose()
})

test('addRetry - callback is invoked', async () => {
	let called = false

	const dispose = addRetry(async () => {
		called = true
	})

	await new Promise(resolve => setTimeout(resolve, 10))

	strictEqual(called, true, 'callback should be called')
	dispose()
})

test('addRetry - callback receives disposer and info', async () => {
	let receivedDisposer: any
	let receivedInfo: any

	const dispose = addRetry(async (disposer, info) => {
		receivedDisposer = disposer
		receivedInfo = info
	})

	await new Promise(resolve => setTimeout(resolve, 10))

	ok(receivedDisposer, 'callback should receive disposer')
	ok(receivedDisposer.signal, 'disposer should have signal')
	ok(receivedInfo, 'callback should receive info')
	ok(typeof receivedInfo.resetBackoff === 'function', 'info should have resetBackoff function')
	dispose()
})

test('addRetry - dispose stops retries', async () => {
	let attemptCount = 0

	const dispose = addRetry(
		async () => {
			attemptCount++
			throw new Error('Always fails')
		},
		{backoffSec: [0.01, 0.01, 0.01]},
	)

	await new Promise(resolve => setTimeout(resolve, 30))
	dispose()
	const countAfterDispose = attemptCount

	await new Promise(resolve => setTimeout(resolve, 50))

	strictEqual(attemptCount, countAfterDispose, 'should not retry after disposal')
})

test('addRetry - dispose can be called multiple times safely', () => {
	const dispose = addRetry(async () => 'value')

	doesNotThrow(() => {
		dispose()
		dispose()
		dispose()
	}, 'multiple disposal calls should be safe')
})

test('addRetry - retries on error until disposed', async () => {
	let attemptCount = 0

	const dispose = addRetry(
		async () => {
			attemptCount++
			throw new Error('Fail')
		},
		{backoffSec: [0.01, -1]},
	)

	await new Promise(resolve => setTimeout(resolve, 80))
	dispose()

	ok(attemptCount >= 2, `should retry multiple times, got ${attemptCount}`)
})

test('addRetry - passes custom backoffSec to retry', async () => {
	const timestamps: number[] = []
	let attemptCount = 0

	const dispose = addRetry(
		async () => {
			timestamps.push(Date.now())
			attemptCount++
			if (attemptCount < 3) {
				throw new Error('Retry')
			}
		},
		{backoffSec: [0.05, 0.05]},
	)

	await new Promise(resolve => setTimeout(resolve, 200))

	ok(attemptCount >= 3, 'should retry with custom backoff')
	if (timestamps.length >= 2) {
		const delay = timestamps[1] - timestamps[0]
		ok(delay >= 30 && delay <= 100, `delay should be ~50ms, got ${delay}ms`)
	}
	dispose()
})

test('addRetry - successful callback does not retry', async () => {
	let attemptCount = 0

	const dispose = addRetry(async () => {
		attemptCount++
		return 'success'
	})

	await new Promise(resolve => setTimeout(resolve, 50))

	strictEqual(attemptCount, 1, 'should only be called once on success')
	dispose()
})

test('addRetry - dispose before callback runs is safe', () => {
	const dispose = addRetry(async () => {
		await new Promise(resolve => setTimeout(resolve, 100))
	})

	doesNotThrow(() => {
		dispose()
	}, 'immediate disposal should be safe')
})

test('addRetry - loop disposer is aborted after dispose', async () => {
	let signalAborted = false

	const dispose = addRetry(async (disposer) => {
		await new Promise(resolve => setTimeout(resolve, 30))
		signalAborted = disposer.signal.aborted
		throw new Error('Fail')
	})

	await new Promise(resolve => setTimeout(resolve, 10))
	dispose()

	await new Promise(resolve => setTimeout(resolve, 40))

	strictEqual(signalAborted, true, 'loop disposer signal should be aborted after dispose')
})
