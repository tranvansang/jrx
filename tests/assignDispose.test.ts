import {test} from 'node:test'
import {deepStrictEqual, ok, strictEqual} from 'node:assert'
import {assignDispose, assignDisposeAsync} from '../index.js'

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

test('assignDispose - disposes value when value is itself a Disposable', () => {
	let valueDisposed = false
	let outerDisposed = false

	const value = {
		foo: 'bar',
		[Symbol.dispose]() { valueDisposed = true },
	}
	const outer = {
		[Symbol.dispose]() { outerDisposed = true },
	}

	const result = assignDispose(value, outer)
	result[Symbol.dispose]()
	strictEqual(valueDisposed, true, 'value\'s own dispose should run')
	strictEqual(outerDisposed, true, 'outer disposable should also run')
})

test('assignDispose - disposes value first, then the disposable', () => {
	const order: string[] = []

	const value = {
		[Symbol.dispose]() { order.push('value') },
	}
	const outer = {
		[Symbol.dispose]() { order.push('outer') },
	}

	const result = assignDispose(value, outer)
	result[Symbol.dispose]()
	deepStrictEqual(order, ['value', 'outer'], 'value must be disposed before the disposable')
})

test('assignDispose - disposes a DisposableStack value before the outer disposable', () => {
	const order: string[] = []

	const inner = new DisposableStack()
	inner.defer(() => order.push('inner-stack'))

	const outer = new DisposableStack()
	outer.defer(() => order.push('outer-stack'))

	const result = assignDispose(inner, outer)
	result[Symbol.dispose]()
	deepStrictEqual(order, ['inner-stack', 'outer-stack'])
	strictEqual(inner.disposed, true)
	strictEqual(outer.disposed, true)
})

test('assignDispose - value\'s dispose is invoked with value as `this`', () => {
	let capturedThis: unknown
	const value = {
		marker: 'value',
		[Symbol.dispose](this: unknown) { capturedThis = this },
	}
	const outer = {
		[Symbol.dispose]() {},
	}

	const result = assignDispose(value, outer)
	result[Symbol.dispose]()
	strictEqual(capturedThis, value, 'value\'s dispose should run with value as this')
})

test('assignDispose - outer still disposes if value has no Symbol.dispose', () => {
	const obj = {foo: 'bar'} as {foo: string; [Symbol.dispose]?: () => void}
	let disposed = false
	const outer = {
		[Symbol.dispose]() { disposed = true },
	}

	const result = assignDispose(obj, outer)
	result[Symbol.dispose]()
	strictEqual(disposed, true)
})

test('assignDisposeAsync - returns the original value with Symbol.asyncDispose', () => {
	const obj = {foo: 'bar'}
	const stack = new AsyncDisposableStack()
	const result = assignDisposeAsync(obj, stack)
	strictEqual(result, obj, 'should return the same object reference')
	ok(typeof result[Symbol.asyncDispose] === 'function', 'value should have Symbol.asyncDispose')
})

test('assignDisposeAsync - awaits the underlying async disposable', async () => {
	let disposed = false
	const disposable = {
		async [Symbol.asyncDispose]() {
			await new Promise(resolve => setTimeout(resolve, 10))
			disposed = true
		},
	}

	const result = assignDisposeAsync({foo: 'bar'}, disposable)
	await result[Symbol.asyncDispose]()
	strictEqual(disposed, true, 'should wait for the async disposable to settle')
})

test('assignDisposeAsync - disposes value before the disposable, awaiting each', async () => {
	const order: string[] = []

	const value = {
		async [Symbol.asyncDispose]() {
			await new Promise(resolve => setTimeout(resolve, 10))
			order.push('value')
		},
	}
	const outer = {
		async [Symbol.asyncDispose]() {
			await new Promise(resolve => setTimeout(resolve, 10))
			order.push('outer')
		},
	}

	const result = assignDisposeAsync(value, outer)
	await result[Symbol.asyncDispose]()
	deepStrictEqual(order, ['value', 'outer'], 'value must be fully disposed before the disposable')
})

test('assignDisposeAsync - disposes value via its own Symbol.asyncDispose', async () => {
	let valueDisposed = false
	const value = {
		async [Symbol.asyncDispose]() { valueDisposed = true },
	}
	const outer = {
		async [Symbol.asyncDispose]() {},
	}

	const result = assignDisposeAsync(value, outer)
	await result[Symbol.asyncDispose]()
	strictEqual(valueDisposed, true, 'value\'s async dispose should run')
})

test('assignDisposeAsync - ignores a value\'s sync Symbol.dispose', async () => {
	let valueDisposed = false
	const value = {
		[Symbol.dispose]() { valueDisposed = true },
	}
	let outerDisposed = false
	const outer = {
		async [Symbol.asyncDispose]() { outerDisposed = true },
	}

	const result = assignDisposeAsync(value, outer)
	await result[Symbol.asyncDispose]()
	strictEqual(valueDisposed, false, 'value\'s sync dispose is not called by assignDisposeAsync')
	strictEqual(outerDisposed, true, 'disposable is still disposed')
})

test('assignDisposeAsync - outer still disposes if value has no dispose', async () => {
	const obj = {foo: 'bar'}
	let disposed = false
	const outer = {
		async [Symbol.asyncDispose]() { disposed = true },
	}

	const result = assignDisposeAsync(obj, outer)
	await result[Symbol.asyncDispose]()
	strictEqual(disposed, true)
})

test('assignDisposeAsync - works with `await using` declaration', async () => {
	let disposed = false

	function makeThing() {
		const stack = new AsyncDisposableStack()
		stack.defer(() => { disposed = true })
		return assignDisposeAsync({value: 42}, stack)
	}

	{
		await using thing = makeThing()
		strictEqual(thing.value, 42)
	}
	strictEqual(disposed, true, 'should dispose when leaving the await using scope')
})

