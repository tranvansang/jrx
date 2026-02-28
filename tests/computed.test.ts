import {test} from 'node:test'
import {ok, strictEqual, deepStrictEqual, throws} from 'node:assert'
import computed from '../computed.js'

test('computed - returns an object with value getter', () => {
	const c = computed(() => 42)
	ok(c, 'computed should return an object')
	ok('value' in c, 'computed should have value property')
})

test('computed - value getter returns computed value', () => {
	const c = computed(() => 42)
	strictEqual(c.value, 42, 'value should return computed result')
})

test('computed - without getDeps, always recomputes', () => {
	let callCount = 0
	const c = computed(() => {
		callCount++
		return 42
	})

	c.value
	c.value
	c.value

	strictEqual(callCount, 3, 'fn should be called every time without getDeps')
})

test('computed - with getDeps, caches value when deps are same', () => {
	let callCount = 0
	let dep = 1

	const c = computed(
		() => {
			callCount++
			return dep * 2
		},
		() => [dep]
	)

	const v1 = c.value
	const v2 = c.value
	const v3 = c.value

	strictEqual(callCount, 1, 'fn should be called once when deps are same')
	strictEqual(v1, 2)
	strictEqual(v2, 2)
	strictEqual(v3, 2)
})

test('computed - recomputes when deps change', () => {
	let callCount = 0
	let dep = 1

	const c = computed(
		() => {
			callCount++
			return dep * 2
		},
		() => [dep]
	)

	const v1 = c.value
	strictEqual(v1, 2)
	strictEqual(callCount, 1)

	dep = 2
	const v2 = c.value
	strictEqual(v2, 4)
	strictEqual(callCount, 2, 'fn should be called again when deps change')

	dep = 3
	const v3 = c.value
	strictEqual(v3, 6)
	strictEqual(callCount, 3)
})

test('computed - deps are compared using Object.is', () => {
	let callCount = 0
	const obj1 = {a: 1}
	const obj2 = {a: 1}
	let dep = obj1

	const c = computed(
		() => {
			callCount++
			return dep.a
		},
		() => [dep]
	)

	c.value
	strictEqual(callCount, 1)

	// Same object reference
	c.value
	strictEqual(callCount, 1, 'should not recompute for same object reference')

	// Different object reference (even with same content)
	dep = obj2
	c.value
	strictEqual(callCount, 2, 'should recompute for different object reference')
})

test('computed - multiple dependencies are tracked', () => {
	let callCount = 0
	let dep1 = 1
	let dep2 = 2

	const c = computed(
		() => {
			callCount++
			return dep1 + dep2
		},
		() => [dep1, dep2]
	)

	const v1 = c.value
	strictEqual(v1, 3)
	strictEqual(callCount, 1)

	// Change first dep
	dep1 = 5
	const v2 = c.value
	strictEqual(v2, 7)
	strictEqual(callCount, 2)

	// Change second dep
	dep2 = 10
	const v3 = c.value
	strictEqual(v3, 15)
	strictEqual(callCount, 3)

	// No change
	const v4 = c.value
	strictEqual(v4, 15)
	strictEqual(callCount, 3, 'should not recompute when deps are unchanged')
})

test('computed - empty dependencies array caches forever', () => {
	let callCount = 0

	const c = computed(
		() => {
			callCount++
			return Math.random()
		},
		() => []
	)

	const v1 = c.value
	const v2 = c.value
	const v3 = c.value

	strictEqual(callCount, 1, 'fn should be called once with empty deps')
	strictEqual(v1, v2)
	strictEqual(v2, v3)
})

test('computed - changing number of dependencies triggers recomputation', () => {
	let callCount = 0
	let deps = [1, 2]

	const c = computed(
		() => {
			callCount++
			return deps.reduce((a, b) => a + b, 0)
		},
		() => deps
	)

	c.value
	strictEqual(callCount, 1)

	// Same deps
	c.value
	strictEqual(callCount, 1)

	// Different number of deps
	deps = [1, 2, 3]
	c.value
	strictEqual(callCount, 2, 'should recompute when deps length changes')
})

test('computed - handles null and undefined deps', () => {
	let callCount = 0
	let dep: any = null

	const c = computed(
		() => {
			callCount++
			return dep
		},
		() => [dep]
	)

	const v1 = c.value
	strictEqual(v1, null)

	dep = undefined
	const v2 = c.value
	strictEqual(v2, undefined)
	strictEqual(callCount, 2)

	dep = null
	const v3 = c.value
	strictEqual(v3, null)
	strictEqual(callCount, 3)
})

test('computed - handles NaN correctly with Object.is', () => {
	let callCount = 0
	let dep = NaN

	const c = computed(
		() => {
			callCount++
			return dep
		},
		() => [dep]
	)

	c.value
	strictEqual(callCount, 1)

	// NaN should equal NaN with Object.is
	c.value
	strictEqual(callCount, 1, 'should not recompute when dep is still NaN')

	dep = 42
	c.value
	strictEqual(callCount, 2)
})

test('computed - handles +0 and -0 correctly with Object.is', () => {
	let callCount = 0
	let dep = +0

	const c = computed(
		() => {
			callCount++
			return dep
		},
		() => [dep]
	)

	c.value
	strictEqual(callCount, 1)

	// +0 and -0 are different with Object.is
	dep = -0
	c.value
	strictEqual(callCount, 2, 'should recompute when +0 changes to -0')
})

test('computed - fn can access external state', () => {
	const state = {count: 0}

	const c = computed(() => {
		return state.count * 2
	})

	state.count = 5
	strictEqual(c.value, 10)

	state.count = 10
	strictEqual(c.value, 20)
})

test('computed - returns different types', () => {
	const c1 = computed(() => 'string')
	strictEqual(c1.value, 'string')

	const c2 = computed(() => [1, 2, 3])
	deepStrictEqual(c2.value, [1, 2, 3])

	const c3 = computed(() => ({a: 1}))
	deepStrictEqual(c3.value, {a: 1})

	const c4 = computed(() => null)
	strictEqual(c4.value, null)

	const c5 = computed(() => undefined)
	strictEqual(c5.value, undefined)
})

test('computed - fn returning arrays is handled correctly', () => {
	let callCount = 0
	let dep = 1

	const c = computed(
		() => {
			callCount++
			return [dep, dep * 2]
		},
		() => [dep]
	)

	const v1 = c.value
	const v2 = c.value

	strictEqual(callCount, 1)
	deepStrictEqual(v1, [1, 2])
	deepStrictEqual(v2, [1, 2])
	strictEqual(v1, v2, 'should return same array reference when cached')
})

test('computed - fn throwing error is propagated', () => {
	const c = computed(() => {
		throw new Error('Test error')
	})

	throws(
		() => c.value,
		/Test error/,
		'accessing value should throw the error'
	)
})

test('computed - error in fn with deps is handled', () => {
	let callCount = 0
	let shouldThrow = true
	let dep = 1

	const c = computed(
		() => {
			callCount++
			if (shouldThrow) {
				throw new Error('Test error')
			}
			return dep
		},
		() => [dep]
	)

	throws(() => c.value)
	strictEqual(callCount, 1)

	shouldThrow = false
	dep = 2 // Change dep to force recomputation
	const v = c.value
	strictEqual(v, 2)
	strictEqual(callCount, 2, 'should recompute after error when deps change')
})

test('computed - getDeps throwing error is propagated', () => {
	const c = computed(
		() => 42,
		() => {
			throw new Error('getDeps error')
		}
	)

	throws(
		() => c.value,
		/getDeps error/,
		'accessing value should throw getDeps error'
	)
})

test('computed - complex dependency object', () => {
	let callCount = 0
	const dep = {a: 1, b: {c: 2}}

	const c = computed(
		() => {
			callCount++
			return dep.a + dep.b.c
		},
		() => [dep]
	)

	c.value
	c.value
	strictEqual(callCount, 1, 'should cache when same object reference')

	// Mutating the object doesn't trigger recomputation (same reference)
	dep.a = 5
	c.value
	strictEqual(callCount, 1, 'mutation should not trigger recomputation')
})

test('computed - primitive dependencies work correctly', () => {
	let callCount = 0
	let str = 'hello'
	let num = 42
	let bool = true

	const c = computed(
		() => {
			callCount++
			return `${str}-${num}-${bool}`
		},
		() => [str, num, bool]
	)

	c.value
	c.value
	strictEqual(callCount, 1)

	str = 'world'
	c.value
	strictEqual(callCount, 2)

	num = 100
	c.value
	strictEqual(callCount, 3)

	bool = false
	c.value
	strictEqual(callCount, 4)
})

test('computed - first access always computes', () => {
	let callCount = 0
	let dep = 1

	const c = computed(
		() => {
			callCount++
			return dep
		},
		() => [dep]
	)

	c.value
	strictEqual(callCount, 1, 'first access should always compute')
})

test('computed - independent computed values', () => {
	let count1 = 0
	let count2 = 0
	let dep = 1

	const c1 = computed(
		() => {
			count1++
			return dep * 2
		},
		() => [dep]
	)

	const c2 = computed(
		() => {
			count2++
			return dep * 3
		},
		() => [dep]
	)

	c1.value
	c1.value
	strictEqual(count1, 1, 'first computed should cache independently')

	c2.value
	c2.value
	strictEqual(count2, 1, 'second computed should cache independently')

	dep = 2
	c1.value
	strictEqual(count1, 2, 'first computed should recompute')

	c2.value
	strictEqual(count2, 2, 'second computed should recompute')
})

test('computed - computed based on another computed', () => {
	let dep = 2

	const c1 = computed(
		() => dep * 2,
		() => [dep]
	)

	const c2 = computed(
		() => c1.value + 10,
		() => [c1.value]
	)

	strictEqual(c2.value, 14) // (2 * 2) + 10

	dep = 3
	strictEqual(c2.value, 16) // (3 * 2) + 10
})

test('computed - getDeps can access closure', () => {
	let callCount = 0
	const state = {x: 1, y: 2}

	const c = computed(
		() => {
			callCount++
			return state.x + state.y
		},
		() => [state.x, state.y]
	)

	c.value
	c.value
	strictEqual(callCount, 1)

	state.x = 5
	c.value
	strictEqual(callCount, 2, 'should recompute when state.x changes')
})

test('computed - large number of dependencies', () => {
	let callCount = 0
	let deps = Array.from({length: 100}, (_, i) => i)

	const c = computed(
		() => {
			callCount++
			return deps.reduce((a, b) => a + b, 0)
		},
		() => deps
	)

	c.value
	c.value
	strictEqual(callCount, 1, 'should cache with many deps')

	// Create new array with changed value to trigger recomputation
	deps = [...deps]
	deps[50] = 1000
	c.value
	strictEqual(callCount, 2, 'should recompute when one dep changes')
})

test('computed - value can be accessed multiple times in sequence', () => {
	let dep = 5
	const c = computed(
		() => dep * 2,
		() => [dep]
	)

	for (let i = 0; i < 10; i++) {
		strictEqual(c.value, 10)
	}
})

test('computed - works with symbol dependencies', () => {
	let callCount = 0
	const sym1 = Symbol('test')
	let dep = sym1

	const c = computed(
		() => {
			callCount++
			return dep
		},
		() => [dep]
	)

	c.value
	c.value
	strictEqual(callCount, 1)

	const sym2 = Symbol('test')
	dep = sym2
	c.value
	strictEqual(callCount, 2, 'should recompute for different symbol')
})
