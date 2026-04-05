import {test} from 'node:test'
import {ok, strictEqual, doesNotThrow, deepStrictEqual} from 'node:assert'
import {makeAsyncReset} from '../index.js'

test('makeAsyncReset - returns a function', () => {
	const reset = makeAsyncReset()
	ok(typeof reset === 'function', 'makeAsyncReset should return a function')
})

test('makeAsyncReset - calling reset returns a promise that resolves to AsyncDisposableStack', async () => {
	const reset = makeAsyncReset()
	const stack = await reset()
	ok(stack instanceof AsyncDisposableStack, 'reset() should resolve to an AsyncDisposableStack')
})

test('makeAsyncReset - returned stack is not disposed', async () => {
	const reset = makeAsyncReset()
	const stack = await reset()
	strictEqual(stack.disposed, false, 'returned stack should not be disposed')
})

test('makeAsyncReset - calling reset disposes the previous stack', async () => {
	const reset = makeAsyncReset()
	const stack1 = await reset()
	strictEqual(stack1.disposed, false, 'first stack should not be disposed')

	const stack2 = await reset()
	strictEqual(stack1.disposed, true, 'first stack should be disposed after reset')
	strictEqual(stack2.disposed, false, 'second stack should not be disposed')
})

test('makeAsyncReset - dispose callbacks are called on reset', async () => {
	const reset = makeAsyncReset()
	const stack = await reset()

	let disposed = false
	stack.defer(() => { disposed = true })

	await reset()
	strictEqual(disposed, true, 'deferred callback should be called on reset')
})

test('makeAsyncReset - async dispose callbacks are awaited on reset', async () => {
	const reset = makeAsyncReset()
	const stack = await reset()

	let disposed = false
	stack.defer(async () => {
		await new Promise((resolve) => setTimeout(resolve, 10))
		disposed = true
	})

	await reset()
	strictEqual(disposed, true, 'async deferred callback should be awaited on reset')
})

test('makeAsyncReset - use() resources are disposed on reset', async () => {
	const reset = makeAsyncReset()
	const stack = await reset()

	let disposed = false
	stack.use({ [Symbol.asyncDispose]: async () => { disposed = true } } as any)

	await reset()
	strictEqual(disposed, true, 'used resource should be disposed on reset')
})

test('makeAsyncReset - adopt() values are cleaned up on reset', async () => {
	const reset = makeAsyncReset()
	const stack = await reset()

	let cleanedUp = false
	stack.adopt('value', () => { cleanedUp = true })

	await reset()
	strictEqual(cleanedUp, true, 'adopted value should be cleaned up on reset')
})

test('makeAsyncReset - multiple resets work correctly', async () => {
	const reset = makeAsyncReset()
	const stacks: AsyncDisposableStack[] = []

	for (let i = 0; i < 5; i++) {
		stacks.push(await reset())
	}

	for (let i = 0; i < 4; i++) {
		strictEqual(stacks[i].disposed, true, `stack ${i} should be disposed`)
	}
	strictEqual(stacks[4].disposed, false, 'last stack should not be disposed')
})

test('makeAsyncReset - each reset returns a fresh stack', async () => {
	const reset = makeAsyncReset()
	const stack1 = await reset()
	const stack2 = await reset()
	const stack3 = await reset()

	ok(stack1 !== stack2, 'stacks should be different objects')
	ok(stack2 !== stack3, 'stacks should be different objects')
})

test('makeAsyncReset - multiple dispose callbacks are called in order', async () => {
	const reset = makeAsyncReset()
	const stack = await reset()

	const events: string[] = []
	stack.defer(() => events.push('first'))
	stack.defer(() => events.push('second'))
	stack.defer(() => events.push('third'))

	await reset()

	// AsyncDisposableStack disposes in reverse order (LIFO)
	deepStrictEqual(events, ['third', 'second', 'first'], 'callbacks should be called in LIFO order')
})

test('makeAsyncReset - independent instances do not interfere', async () => {
	const reset1 = makeAsyncReset()
	const reset2 = makeAsyncReset()

	const stack1 = await reset1()
	const stack2 = await reset2()

	let disposed1 = false
	let disposed2 = false
	stack1.defer(() => { disposed1 = true })
	stack2.defer(() => { disposed2 = true })

	await reset1()
	strictEqual(disposed1, true, 'first instance should be disposed')
	strictEqual(disposed2, false, 'second instance should not be disposed')
})

test('makeAsyncReset - calling reset on already-empty stack is safe', async () => {
	const reset = makeAsyncReset()
	await reset()
	await reset()
	await reset()
	// Should not throw
})
