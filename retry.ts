import {type Disposer, makeReset} from 'jdisposer'

// without passing disposer, result will always be defined
export default async function retry<T>(
	cb: (disposer: Disposer, info: {resetBackoff(): void}) => T | Promise<T>,
	options?: {
		backoffSec?: number[]
	},
): Promise<T>
export default async function retry<T>(
	cb: (disposer: Disposer, info: {resetBackoff(): void}) => T | Promise<T>,
	options?: {
		backoffSec?: number[]
		disposer: Disposer
	},
): Promise<T | undefined>
export default async function retry<T>(
	cb: (disposer: Disposer, info: {resetBackoff(): void}) => T | Promise<T>,
	{
		backoffSec = [5, 5, 10, 10, 20, 20, 40, 40, 60, -1], // -1: retry forever with the last backoff . first element must not be -1
		disposer,
	}: {
		disposer?: Disposer
		backoffSec?: number[]
	} = {},
): Promise<T | undefined> {
	const reset = makeReset()
	disposer?.add(reset)
	let count = 0
	let loopDisposer = reset()
	while (true) {
		if (backoffSec[count] !== -1) count++
		try {
			if (loopDisposer?.signal.aborted) return // only happen if disposer?.signal.aborted
			return await cb(loopDisposer, {
				resetBackoff() {
					count = 1
				},
			})
		} catch (e) {
			if (disposer?.signal.aborted) return
			if (count > backoffSec.length) {
				console.error('max retries reached:', e)
				throw e
			}
			console.warn('Retrying due to error:', e)
			loopDisposer = reset()
			await new Promise(resolve => setTimeout(resolve, backoffSec[count - 1] * 1000))
		}
	}
}
