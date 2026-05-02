import retry from './retry.js'
import computed from './computed.js'

export {retry, computed}

export function makeReset() {
	let stack = new DisposableStack()
	return () => {
		stack.dispose()
		return (stack = new DisposableStack())
	}
}

export function makeAsyncReset() {
	let stack = new AsyncDisposableStack()
	return async () => {
		await stack.disposeAsync()
		return (stack = new AsyncDisposableStack())
	}
}

export function makeRenderLoop() {
	let loop_: ((time: DOMHighResTimeStamp) => undefined | Disposable) | undefined
	const reset = makeReset()

	return {
		loop(this: void, time: DOMHighResTimeStamp) {
			reset().use(loop_?.(time))
		},
		setLoop(this: void, loop: (time: DOMHighResTimeStamp) => undefined | Disposable) {
			loop_ = loop
			return {
				[Symbol.dispose]() {
					reset()
					loop_ = undefined
				},
			}
		},
	}
}

export function createInterval(cb: () => undefined | Disposable, ms: number) {
	const reset = makeReset()
	let timeout: ReturnType<typeof setTimeout>
	wrapper()
	return {
		[Symbol.dispose]() {
			reset()
			clearTimeout(timeout)
		},
	}

	function wrapper() {
		reset().use(cb())
		timeout = setTimeout(wrapper, ms)
	}
}

export function createIntervalAsync(cb: () => void | Disposable | Promise<void>, ms: number) {
	const reset = makeReset()
	let timeout: ReturnType<typeof setTimeout>
	void wrapper()
	return {
		[Symbol.dispose]() {
			reset()
			clearTimeout(timeout)
		},
	}

	async function wrapper() {
		const stack = reset()
		await stack.adopt(cb(), (v: any) => v?.[Symbol.dispose]?.())
		if (!stack.disposed) timeout = setTimeout(wrapper, ms)
	}
}

export function createAnimationFrame(cb: (now: DOMHighResTimeStamp) => undefined | Disposable) {
	const stack = new DisposableStack()
	const raf = requestAnimationFrame(now => {
		if (stack.disposed) return
		stack.use(cb(now))
	})
	return {
		[Symbol.dispose]() {
			stack.dispose()
			cancelAnimationFrame(raf)
		},
	}
}

export function createAnimationFrameLoop(cb: (now: DOMHighResTimeStamp) => undefined | Disposable) {
	const reset = makeReset()
	let raf = requestAnimationFrame(wrapper)
	return {
		[Symbol.dispose]() {
			reset()
			cancelAnimationFrame(raf)
		},
	}

	function wrapper(now: DOMHighResTimeStamp) {
		reset().use(cb(now))
		raf = requestAnimationFrame(wrapper)
	}
}

export function createTimeout(cb: () => void, ms: number) {
	const timeout = setTimeout(cb, ms)
	return {
		[Symbol.dispose]() {
			clearTimeout(timeout)
		},
	}
}

export function createTransition(cb: (progress: number) => undefined | Disposable, durationMs: number) {
	const reset = makeReset()
	let start: DOMHighResTimeStamp | undefined
	let raf = requestAnimationFrame(wrapper)
	return {
		[Symbol.dispose]() {
			reset()
			cancelAnimationFrame(raf)
		},
	}

	function wrapper(now: DOMHighResTimeStamp) {
		if (start === undefined) {
			start = now
			reset().use(cb(0))
			raf = requestAnimationFrame(wrapper)
		} else {
			const progress = (now - start) / durationMs
			if (progress >= 1) reset().use(cb(1))
			else {
				reset().use(cb(progress))
				raf = requestAnimationFrame(wrapper)
			}
		}
	}
}
