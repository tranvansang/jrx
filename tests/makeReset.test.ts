import {test} from 'node:test'
import {ok, strictEqual, doesNotThrow, deepStrictEqual} from 'node:assert'
import {makeReset} from '../index.js'

test('makeReset - returns a function', () => {
	const reset = makeReset()
	ok(typeof reset === 'function', 'makeReset should return a function')
})

test('makeReset - calling reset returns a DisposableStack', () => {
	const reset = makeReset()
	const stack = reset()
	ok(stack instanceof DisposableStack, 'reset() should return a DisposableStack')
})

test('makeReset - returned stack is not disposed', () => {
	const reset = makeReset()
	const stack = reset()
	strictEqual(stack.disposed, false, 'returned stack should not be disposed')
})

test('makeReset - calling reset disposes the previous stack', () => {
	const reset = makeReset()
	const stack1 = reset()
	strictEqual(stack1.disposed, false, 'first stack should not be disposed')

	const stack2 = reset()
	strictEqual(stack1.disposed, true, 'first stack should be disposed after reset')
	strictEqual(stack2.disposed, false, 'second stack should not be disposed')
})

test('makeReset - dispose callbacks are called on reset', () => {
	const reset = makeReset()
	const stack = reset()

	let disposed = false
	stack.defer(() => { disposed = true })

	reset()
	strictEqual(disposed, true, 'deferred callback should be called on reset')
})

test('makeReset - use() resources are disposed on reset', () => {
	const reset = makeReset()
	const stack = reset()

	let disposed = false
	stack.use({ [Symbol.dispose]() { disposed = true } })

	reset()
	strictEqual(disposed, true, 'used resource should be disposed on reset')
})

test('makeReset - adopt() values are cleaned up on reset', () => {
	const reset = makeReset()
	const stack = reset()

	let cleanedUp = false
	stack.adopt('value', () => { cleanedUp = true })

	reset()
	strictEqual(cleanedUp, true, 'adopted value should be cleaned up on reset')
})

test('makeReset - multiple resets work correctly', () => {
	const reset = makeReset()
	const stacks: DisposableStack[] = []

	for (let i = 0; i < 5; i++) {
		stacks.push(reset())
	}

	// All but the last should be disposed
	for (let i = 0; i < 4; i++) {
		strictEqual(stacks[i].disposed, true, `stack ${i} should be disposed`)
	}
	strictEqual(stacks[4].disposed, false, 'last stack should not be disposed')
})

test('makeReset - each reset returns a fresh stack', () => {
	const reset = makeReset()
	const stack1 = reset()
	const stack2 = reset()
	const stack3 = reset()

	ok(stack1 !== stack2, 'stacks should be different objects')
	ok(stack2 !== stack3, 'stacks should be different objects')
})

test('makeReset - multiple dispose callbacks are called in order', () => {
	const reset = makeReset()
	const stack = reset()

	const events: string[] = []
	stack.defer(() => events.push('first'))
	stack.defer(() => events.push('second'))
	stack.defer(() => events.push('third'))

	reset()

	// DisposableStack disposes in reverse order (LIFO)
	deepStrictEqual(events, ['third', 'second', 'first'], 'callbacks should be called in LIFO order')
})

test('makeReset - reset can be used as a dispose function', () => {
	const reset = makeReset()
	const stack = reset()

	let disposed = false
	stack.defer(() => { disposed = true })

	// Calling reset() without using the returned stack acts like dispose
	reset()
	strictEqual(disposed, true, 'reset() should dispose the previous stack')
})

test('makeReset - independent instances do not interfere', () => {
	const reset1 = makeReset()
	const reset2 = makeReset()

	const stack1 = reset1()
	const stack2 = reset2()

	let disposed1 = false
	let disposed2 = false
	stack1.defer(() => { disposed1 = true })
	stack2.defer(() => { disposed2 = true })

	reset1()
	strictEqual(disposed1, true, 'first instance should be disposed')
	strictEqual(disposed2, false, 'second instance should not be disposed')
})

test('makeReset - stack can be used with using declaration pattern', () => {
	const reset = makeReset()
	const stack = reset()

	let disposed = false
	const resource = { [Symbol.dispose]() { disposed = true } }
	stack.use(resource)

	reset()
	strictEqual(disposed, true, 'resource should be disposed')
})

test('makeReset - calling reset on already-empty stack is safe', () => {
	const reset = makeReset()
	doesNotThrow(() => {
		reset()
		reset()
		reset()
	}, 'multiple resets without adding to stacks should be safe')
})
