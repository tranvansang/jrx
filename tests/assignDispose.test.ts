import {test} from 'node:test'
import {ok, strictEqual} from 'node:assert'
import {assignDispose} from '../index.js'

test('assignDispose - returns the original value', () => {
	const obj = {foo: 'bar'}
	const stack = new DisposableStack()
	const result = assignDispose(obj, stack)
	strictEqual(result, obj, 'should return the same object reference')
})

test('assignDispose - attaches Symbol.dispose to the value', () => {
	const obj = {foo: 'bar'}
	const stack = new DisposableStack()
	const result = assignDispose(obj, stack)
	ok(typeof result[Symbol.dispose] === 'function', 'value should have Symbol.dispose')
})

test('assignDispose - disposing the value disposes the underlying disposable', () => {
	const obj = {foo: 'bar'}
	const stack = new DisposableStack()

	let disposed = false
	stack.defer(() => { disposed = true })

	const result = assignDispose(obj, stack)
	result[Symbol.dispose]()
	strictEqual(disposed, true, 'underlying disposable should run on value dispose')
	strictEqual(stack.disposed, true, 'underlying stack should be marked disposed')
})

test('assignDispose - preserves existing properties', () => {
	const obj = {a: 1, b: 'two', c: true}
	const stack = new DisposableStack()
	const result = assignDispose(obj, stack)
	strictEqual(result.a, 1)
	strictEqual(result.b, 'two')
	strictEqual(result.c, true)
})

test('assignDispose - works with function values', () => {
	const fn = function update(x: number) { return x * 2 }
	const stack = new DisposableStack()

	let disposed = false
	stack.defer(() => { disposed = true })

	const result = assignDispose(fn, stack)
	strictEqual(result(5), 10, 'function should still be callable')
	result[Symbol.dispose]()
	strictEqual(disposed, true)
})

test('assignDispose - works with arrays', () => {
	const arr = [1, 2, 3]
	const stack = new DisposableStack()

	let disposed = false
	stack.defer(() => { disposed = true })

	const result = assignDispose(arr, stack)
	strictEqual(result[0], 1)
	strictEqual(result.length, 3)
	result[Symbol.dispose]()
	strictEqual(disposed, true)
})

test('assignDispose - works with a plain Disposable (non-stack)', () => {
	const obj = {foo: 'bar'}
	let disposed = false
	const disposable = {
		[Symbol.dispose]() { disposed = true },
	}

	const result = assignDispose(obj, disposable)
	result[Symbol.dispose]()
	strictEqual(disposed, true)
})

test('assignDispose - dispose method is bound to the disposable', () => {
	const obj = {foo: 'bar'}
	let capturedThis: unknown
	const disposable = {
		marker: 'underlying',
		[Symbol.dispose](this: unknown) { capturedThis = this },
	}

	const result = assignDispose(obj, disposable)
	const dispose = result[Symbol.dispose]
	dispose()
	strictEqual(capturedThis, disposable, 'this should be bound to the original disposable, not the value')
})

test('assignDispose - works with `using` declaration', () => {
	let disposed = false

	function makeThing() {
		const stack = new DisposableStack()
		stack.defer(() => { disposed = true })
		return assignDispose({value: 42}, stack)
	}

	{
		using thing = makeThing()
		strictEqual(thing.value, 42)
	}
	strictEqual(disposed, true, 'should dispose when leaving the using scope')
})

test('assignDispose - DisposableStack.use() disposes the value', () => {
	let disposed = false

	const outer = new DisposableStack()
	const inner = new DisposableStack()
	inner.defer(() => { disposed = true })

	outer.use(assignDispose({foo: 'bar'}, inner))
	outer.dispose()
	strictEqual(disposed, true)
})

test('assignDispose - works with a Promise as the value', async () => {
	const stack = new DisposableStack()
	let disposed = false
	stack.defer(() => { disposed = true })

	const promise = Promise.resolve('done')
	const result = assignDispose(promise, stack)

	const value = await result
	strictEqual(value, 'done', 'promise should still resolve normally')
	result[Symbol.dispose]()
	strictEqual(disposed, true)
})
