import {type Disposer, makeDisposer, makeReset} from 'jdisposer'

import retry, {addRetry} from './retry.js'
import computed from './computed.js'
import addEvtListener from './addEvtListener.js'

export {retry, computed, addEvtListener, addRetry}

export function makeRenderLoop() {
	let loop_: ((time: DOMHighResTimeStamp) => void | (() => void)) | undefined
	const reset = makeReset()

	return {
		loop(this: void, time: DOMHighResTimeStamp) {
			reset().add(loop_?.(time))
		},
		setLoop(this: void, loop: (time: DOMHighResTimeStamp) => void | (() => void)) {
			loop_ = loop
			return () => {
				reset()
				loop_ = undefined
			}
		},
	}
}

export function addInterval(cb: () => void | (() => any), ms: number) {
	const reset = makeReset()
	let timeout: ReturnType<typeof setTimeout>
	wrapper()
	return () => {
		reset()
		clearTimeout(timeout)
	}

	function wrapper() {
		reset().add(cb())
		timeout = setTimeout(wrapper, ms)
	}
}

export function addIntervalAsync(
	cb: (disposer: Disposer) => void | (() => any) | Promise<void> | Promise<() => any>,
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
		const disposer = reset()
		await cb(disposer)
		if (!disposer.signal.aborted) timeout = setTimeout(wrapper, ms)
	}
}

export function addRequestAnimationFrame(cb: (now: DOMHighResTimeStamp) => void | (() => any)) {
	const disposer = makeDisposer()
	const raf = requestAnimationFrame(now => disposer.add(cb(now)))
	return () => {
		disposer.dispose()
		cancelAnimationFrame(raf)
	}
}

export function addRequestAnimationFrameLoop(cb: (now: DOMHighResTimeStamp) => void | (() => any)) {
	const reset = makeReset()
	let raf = requestAnimationFrame(wrapper)
	return () => {
		reset()
		cancelAnimationFrame(raf)
	}

	function wrapper(now: DOMHighResTimeStamp) {
		reset().add(cb(now))
		raf = requestAnimationFrame(wrapper)
	}
}

export function addSubs<Subs extends any[]>(subs: Subs, cb: () => void | (() => void), {now}: {now?: boolean} = {}) {
	const disposer = makeDisposer()

	const reset = makeReset()
	disposer.add(reset)

	for (const sub of subs) disposer.add(sub(() => reset().add(cb())))
	if (now) reset().add(cb())

	return disposer.dispose
}

export function addTimeout(cb: () => void, ms: number) {
	const timeout = setTimeout(cb, ms)
	return () => clearTimeout(timeout)
}

export function addTransition(cb: (progress: number) => void | (() => void), durationMs: number) {
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
			reset().add(cb(0))
			raf = requestAnimationFrame(wrapper)
		} else {
			const progress = (now - start) / durationMs
			if (progress >= 1) reset().add(cb(1))
			else {
				reset().add(cb(progress))
				raf = requestAnimationFrame(wrapper)
			}
		}
	}
}
