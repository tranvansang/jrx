import {type Disposer, makeDisposer, makeReset} from 'jdisposer'

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

// region addEvtListener
type IEventHandler<Target extends {
	addEventListener(event: string, handler: any, option?: any): any
}, EventName> = Target['addEventListener'] extends (event: EventName, handler: infer Handler, ...args: any[]) => any
	? Handler extends (...params: any[]) => any
		? Handler : never
	: never

type IEventOption<Target extends {
	addEventListener(event: string, handler: any, option?: any): any
}, EventName, Handler> =
	Target['addEventListener'] extends (event: EventName, handler: Handler, option: infer Option) => any ? Option : never

export function addEvtListener<
	Target extends {
		addEventListener(event: string, handler: any, option?: any): any
		removeEventListener(event: string, handler: any, option?: any): any
	},
	EventName extends Parameters<Target['addEventListener']>[0],
	Handler extends IEventHandler<Target, EventName>
>(
	target: Target,
	event: EventName,
	handler: Handler,
	option?: IEventOption<Target, EventName, Handler>
): () => void

export function addEvtListener<
	Target extends {
		addEventListener(event: string, handler: any, option?: any): any
		removeEventListener(event: string, handler: any, option?: any): any
	},
	EventName extends Parameters<Target['addEventListener']>[0]
>(
	target: Target,
	event: EventName,
	handler: (...args: any[]) => any,
	option?: IEventOption<Target, EventName, IEventHandler<Target, EventName>>
): () => void

export function addEvtListener(
	target: any,
	event: string,
	handler: any,
	option?: any
) {
	target.addEventListener(event, handler, option)
	return function removeEvtListener() {
		return target.removeEventListener(event, handler, option)
	}
}
// endregion
