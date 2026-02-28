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

export default function addEvtListener<
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

export default function addEvtListener<
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

export default function addEvtListener(
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
