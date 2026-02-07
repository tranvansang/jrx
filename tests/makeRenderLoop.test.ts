import {test} from 'node:test'
import assert from 'node:assert'
import {makeRenderLoop} from '../index.ts'

test('makeRenderLoop - basic functionality', () => {
	const renderLoop = makeRenderLoop()
	assert.ok(renderLoop, 'renderLoop should be created')
	assert.ok(typeof renderLoop.loop === 'function', 'renderLoop should have loop method')
	assert.ok(typeof renderLoop.setLoop === 'function', 'renderLoop should have setLoop method')
})

test('makeRenderLoop - setLoop returns a disposer function', () => {
	const renderLoop = makeRenderLoop()
	const dispose = renderLoop.setLoop(() => {})
	assert.ok(typeof dispose === 'function', 'setLoop should return a disposer function')
})

test('makeRenderLoop - loop calls the set loop function with time', () => {
	const renderLoop = makeRenderLoop()
	let called = false
	let receivedTime: DOMHighResTimeStamp | undefined

	renderLoop.setLoop((time) => {
		called = true
		receivedTime = time
	})

	const testTime = 1234.5
	renderLoop.loop(testTime)

	assert.strictEqual(called, true, 'loop function should be called')
	assert.strictEqual(receivedTime, testTime, 'loop function should receive the time parameter')
})

test('makeRenderLoop - loop function can return a cleanup function', () => {
	const renderLoop = makeRenderLoop()
	let cleanupCalled = false

	renderLoop.setLoop(() => {
		return () => {
			cleanupCalled = true
		}
	})

	renderLoop.loop(100)
	assert.strictEqual(cleanupCalled, false, 'cleanup should not be called immediately')

	renderLoop.loop(200)
	assert.strictEqual(cleanupCalled, true, 'cleanup should be called on next loop')
})

test('makeRenderLoop - cleanup is called before each loop execution', () => {
	const renderLoop = makeRenderLoop()
	const cleanupCalls: number[] = []
	const loopCalls: number[] = []

	renderLoop.setLoop((time) => {
		loopCalls.push(time)
		return () => {
			cleanupCalls.push(time)
		}
	})

	renderLoop.loop(100)
	renderLoop.loop(200)
	renderLoop.loop(300)

	assert.deepStrictEqual(loopCalls, [100, 200, 300], 'loop should be called 3 times')
	assert.deepStrictEqual(cleanupCalls, [100, 200], 'cleanup should be called for first 2 loops')
})

test('makeRenderLoop - disposer cleans up and unsets the loop', () => {
	const renderLoop = makeRenderLoop()
	let loopCallCount = 0
	let cleanupCalled = false

	const dispose = renderLoop.setLoop(() => {
		loopCallCount++
		return () => {
			cleanupCalled = true
		}
	})

	renderLoop.loop(100)
	assert.strictEqual(loopCallCount, 1, 'loop should be called once')

	dispose()
	assert.strictEqual(cleanupCalled, true, 'cleanup should be called when disposed')

	renderLoop.loop(200)
	assert.strictEqual(loopCallCount, 1, 'loop should not be called after disposal')
})

test('makeRenderLoop - changing loop function switches to new loop', () => {
	const renderLoop = makeRenderLoop()
	let cleanup1Called = false
	let cleanup2Called = false
	let loop1Calls = 0
	let loop2Calls = 0

	renderLoop.setLoop(() => {
		loop1Calls++
		return () => {
			cleanup1Called = true
		}
	})

	renderLoop.loop(100)
	assert.strictEqual(loop1Calls, 1)

	// Changing loop doesn't call cleanup immediately, but on next loop() call
	renderLoop.setLoop(() => {
		loop2Calls++
		return () => {
			cleanup2Called = true
		}
	})

	assert.strictEqual(cleanup1Called, false, 'first loop cleanup not called until next loop()')

	renderLoop.loop(200)
	assert.strictEqual(cleanup1Called, true, 'first loop cleanup should be called on next loop()')
	assert.strictEqual(loop1Calls, 1, 'first loop should not be called again')
	assert.strictEqual(loop2Calls, 1, 'second loop should be called')
})

test('makeRenderLoop - loop without setLoop does nothing', () => {
	const renderLoop = makeRenderLoop()
	// Should not throw
	assert.doesNotThrow(() => {
		renderLoop.loop(100)
	}, 'calling loop without setLoop should not throw')
})

test('makeRenderLoop - multiple consecutive disposals are safe', () => {
	const renderLoop = makeRenderLoop()
	const dispose = renderLoop.setLoop(() => {})

	assert.doesNotThrow(() => {
		dispose()
		dispose()
		dispose()
	}, 'multiple disposal calls should be safe')
})

test('makeRenderLoop - loop function returning undefined is handled', () => {
	const renderLoop = makeRenderLoop()
	let callCount = 0

	renderLoop.setLoop(() => {
		callCount++
		// Explicitly return undefined
		return undefined
	})

	renderLoop.loop(100)
	renderLoop.loop(200)

	assert.strictEqual(callCount, 2, 'loop should be called twice even when returning undefined')
})

test('makeRenderLoop - loop preserves this context', () => {
	const renderLoop = makeRenderLoop()
	let loopCalled = false

	renderLoop.setLoop(function (this: any) {
		loopCalled = true
		assert.strictEqual(this, undefined, 'this should be undefined in loop function')
	})

	renderLoop.loop(100)
	assert.strictEqual(loopCalled, true)
})

test('makeRenderLoop - setLoop preserves this context', () => {
	const renderLoop = makeRenderLoop()

	const dispose = renderLoop.setLoop(function (this: any) {
		assert.strictEqual(this, undefined, 'this should be undefined in loop function')
	})

	assert.ok(typeof dispose === 'function')
})

test('makeRenderLoop - complex scenario with multiple loops and cleanups', () => {
	const renderLoop = makeRenderLoop()
	const events: string[] = []

	const dispose1 = renderLoop.setLoop(() => {
		events.push('loop1')
		return () => events.push('cleanup1')
	})

	renderLoop.loop(100)
	renderLoop.loop(200)

	dispose1()

	const dispose2 = renderLoop.setLoop(() => {
		events.push('loop2')
		return () => events.push('cleanup2')
	})

	renderLoop.loop(300)

	dispose2()

	assert.deepStrictEqual(
		events,
		['loop1', 'cleanup1', 'loop1', 'cleanup1', 'loop2', 'cleanup2'],
		'events should occur in correct order'
	)
})
