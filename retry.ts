import {makeReset} from './index.js'

export default function retry<T>(
	cb: (info: {resetBackoff(): void}) => (Disposable | undefined) & (T | Promise<T>),
	backoffSec = [5, 5, 10, 10, 20, 20, 40, 40, 60, -1], // -1: retry forever with the last backoff . first element must not be -1
): Disposable & Promise<T | undefined> {
	const stack = new DisposableStack()

	const reset = makeReset()
	stack.defer(reset)

	let count = 0
	let loopStack = reset()

	return Object.assign(
		(async () => {
			while (true) {
				if (backoffSec[count] !== -1) count++
				try {
					if (loopStack.disposed) return
					const value = cb({
						resetBackoff() {
							count = 1
						},
					})
					return value?.[Symbol.dispose] ? loopStack.use(value) : value
				} catch (e) {
					if (stack.disposed) return
					if (count > backoffSec.length) {
						console.error('max retries reached:', e)
						throw e
					}
					console.warn('Retrying due to error:', e)
					loopStack = reset()
					await new Promise(resolve => setTimeout(resolve, backoffSec[count - 1] * 1000))
				}
			}
		})(),
		{[Symbol.dispose]: stack[Symbol.dispose].bind(stack)},
	)
}
