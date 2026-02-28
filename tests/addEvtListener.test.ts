import {test} from 'node:test'
import {ok, strictEqual, doesNotThrow} from 'node:assert'
import addEvtListener from '../addEvtListener.js'

function createTarget() {
	const listeners: {event: string; handler: any; option?: any}[] = []
	return {
		listeners,
		addEventListener(event: string, handler: any, option?: any) {
			listeners.push({event, handler, option})
		},
		removeEventListener(event: string, handler: any, option?: any) {
			const idx = listeners.findIndex(l => l.event === event && l.handler === handler)
			if (idx !== -1) listeners.splice(idx, 1)
		},
	}
}

test('addEvtListener - returns a disposer function', () => {
	const target = createTarget()
	const dispose = addEvtListener(target, 'click', () => {})
	ok(typeof dispose === 'function', 'addEvtListener should return a disposer function')
	dispose()
})

test('addEvtListener - calls addEventListener on target', () => {
	const target = createTarget()
	const handler = () => {}
	addEvtListener(target, 'click', handler)

	strictEqual(target.listeners.length, 1, 'should have added one listener')
	strictEqual(target.listeners[0].event, 'click', 'event name should match')
	strictEqual(target.listeners[0].handler, handler, 'handler should match')
})

test('addEvtListener - passes option to addEventListener', () => {
	const target = createTarget()
	const handler = () => {}
	const option = {capture: true}
	addEvtListener(target, 'click', handler, option)

	strictEqual(target.listeners[0].option, option, 'option should be passed through')
})

test('addEvtListener - disposer calls removeEventListener', () => {
	const target = createTarget()
	const handler = () => {}
	const dispose = addEvtListener(target, 'click', handler)

	strictEqual(target.listeners.length, 1, 'listener should be registered')
	dispose()
	strictEqual(target.listeners.length, 0, 'listener should be removed after dispose')
})

test('addEvtListener - removeEventListener receives same arguments', () => {
	const removeCalls: {event: string; handler: any; option?: any}[] = []
	const target = {
		addEventListener() {},
		removeEventListener(event: string, handler: any, option?: any) {
			removeCalls.push({event, handler, option})
		},
	}
	const handler = () => {}
	const option = {capture: true}
	const dispose = addEvtListener(target, 'keydown' as any, handler, option)
	dispose()

	strictEqual(removeCalls.length, 1, 'removeEventListener should be called once')
	strictEqual(removeCalls[0].event, 'keydown', 'event name should match')
	strictEqual(removeCalls[0].handler, handler, 'handler should match')
	strictEqual(removeCalls[0].option, option, 'option should match')
})

test('addEvtListener - multiple disposals are safe', () => {
	const target = createTarget()
	const dispose = addEvtListener(target, 'click', () => {})

	doesNotThrow(() => {
		dispose()
		dispose()
		dispose()
	}, 'multiple disposal calls should be safe')
})

test('addEvtListener - multiple listeners on same target', () => {
	const target = createTarget()
	const handler1 = () => {}
	const handler2 = () => {}

	const dispose1 = addEvtListener(target, 'click', handler1)
	const dispose2 = addEvtListener(target, 'click', handler2)

	strictEqual(target.listeners.length, 2, 'should have two listeners')

	dispose1()
	strictEqual(target.listeners.length, 1, 'should have one listener after first dispose')
	strictEqual(target.listeners[0].handler, handler2, 'second handler should remain')

	dispose2()
	strictEqual(target.listeners.length, 0, 'should have no listeners after both disposed')
})

test('addEvtListener - different event types on same target', () => {
	const target = createTarget()
	const dispose1 = addEvtListener(target, 'click', () => {})
	const dispose2 = addEvtListener(target, 'keydown', () => {})

	strictEqual(target.listeners.length, 2, 'should have two listeners')
	strictEqual(target.listeners[0].event, 'click')
	strictEqual(target.listeners[1].event, 'keydown')

	dispose1()
	strictEqual(target.listeners.length, 1, 'should have one listener')
	strictEqual(target.listeners[0].event, 'keydown', 'keydown listener should remain')

	dispose2()
})

test('addEvtListener - option undefined when not provided', () => {
	const target = createTarget()
	addEvtListener(target, 'click', () => {})

	strictEqual(target.listeners[0].option, undefined, 'option should be undefined when not provided')
})

test('addEvtListener - works with DOM-like EventTarget', () => {
	const addCalls: any[] = []
	const removeCalls: any[] = []
	const target = {
		addEventListener(event: string, handler: any, option?: any) {
			addCalls.push({event, handler, option})
		},
		removeEventListener(event: string, handler: any, option?: any) {
			removeCalls.push({event, handler, option})
		},
	}

	const handler = () => {}
	const dispose = addEvtListener(target, 'resize', handler)

	strictEqual(addCalls.length, 1)
	strictEqual(addCalls[0].event, 'resize')

	dispose()

	strictEqual(removeCalls.length, 1)
	strictEqual(removeCalls[0].event, 'resize')
	strictEqual(removeCalls[0].handler, handler)
})
