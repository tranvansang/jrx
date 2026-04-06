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
	let loop_: ((time: DOMHighResTimeStamp) => undefined | (() => void)) | undefined
	const reset = makeReset()

	return {
		loop(this: void, time: DOMHighResTimeStamp) {
			reset().defer(loop_?.(time))
		},
		setLoop(this: void, loop: (time: DOMHighResTimeStamp) => undefined | (() => void)) {
			loop_ = loop
			return () => {
				reset()
				loop_ = undefined
			}
		},
	}
}

export function addInterval(cb: () => undefined | (() => any), ms: number) {
	const reset = makeReset()
	let timeout: ReturnType<typeof setTimeout>
	wrapper()
	return () => {
		reset()
		clearTimeout(timeout)
	}

	function wrapper() {
		reset().defer(cb)
		timeout = setTimeout(wrapper, ms)
	}
}

export function addIntervalAsync(
	cb: () => (void | Disposable) & (void | (() => any) | Promise<void> | Promise<() => any>),
	ms: number,
) {
	const reset = makeReset()
	let timeout: ReturnType<typeof setTimeout>
	void wrapper()
	return () => {
		reset()
		clearTimeout(timeout)
	}

	async function wrapper() {
		const stack = reset()
		await stack.adopt(cb(), v => v?.[Symbol.dispose]?.())
		if (!stack.disposed) timeout = setTimeout(wrapper, ms)
	}
}

export function addRequestAnimationFrame(cb: (now: DOMHighResTimeStamp) => undefined | (() => any)) {
	const stack = new DisposableStack()
	const raf = requestAnimationFrame(now => {
		if (stack.disposed) return
		stack.defer(cb(now))
	})
	return () => {
		stack.dispose()
		cancelAnimationFrame(raf)
	}
}

export function addRequestAnimationFrameLoop(cb: (now: DOMHighResTimeStamp) => undefined | (() => any)) {
	const reset = makeReset()
	let raf = requestAnimationFrame(wrapper)
	return () => {
		reset()
		cancelAnimationFrame(raf)
	}

	function wrapper(now: DOMHighResTimeStamp) {
		reset().defer(cb(now))
		raf = requestAnimationFrame(wrapper)
	}
}

export function addTimeout(cb: () => void, ms: number) {
	const timeout = setTimeout(cb, ms)
	return () => clearTimeout(timeout)
}

export function addTransition(cb: (progress: number) => undefined | (() => void), durationMs: number) {
	const reset = makeReset()
	let start: DOMHighResTimeStamp | undefined
	let raf = requestAnimationFrame(wrapper)
	return () => {
		reset()
		cancelAnimationFrame(raf)
	}

	function wrapper(now: DOMHighResTimeStamp) {
		if (start === undefined) {
			start = now
			reset().defer(cb(0))
			raf = requestAnimationFrame(wrapper)
		} else {
			const progress = (now - start) / durationMs
			if (progress >= 1) reset().defer(cb(1))
			else {
				reset().defer(cb(progress))
				raf = requestAnimationFrame(wrapper)
			}
		}
	}
}
