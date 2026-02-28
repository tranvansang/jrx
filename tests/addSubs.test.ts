import {test} from 'node:test'
import assert from 'node:assert'
import {addSubs} from '../index.js'

// Helper to create a mock subscription
function createMockSub() {
	let callback: (() => void) | undefined
	return {
		sub: (cb: () => void) => {
			callback = cb
			return () => {
				callback = undefined
			}
		},
		trigger: () => {
			callback?.()
		},
		isActive: () => callback !== undefined,
	}
}

test('addSubs - returns a disposer function', () => {
	const dispose = addSubs([], () => {})
	assert.ok(typeof dispose === 'function', 'addSubs should return a disposer function')
	dispose()
})

test('addSubs - callback is called when subscription triggers', () => {
	const mock = createMockSub()
	let called = false

	const dispose = addSubs([mock.sub], () => {
		called = true
	})

	mock.trigger()
	assert.strictEqual(called, true, 'callback should be called when subscription triggers')
	dispose()
})

test('addSubs - callback is called for multiple subscriptions', () => {
	const mock1 = createMockSub()
	const mock2 = createMockSub()
	const calls: number[] = []

	const dispose = addSubs([mock1.sub, mock2.sub], () => {
		calls.push(Date.now())
	})

	mock1.trigger()
	mock2.trigger()
	mock1.trigger()

	assert.strictEqual(calls.length, 3, 'callback should be called 3 times')
	dispose()
})

test('addSubs - callback with now:true is called immediately', () => {
	const mock = createMockSub()
	let callCount = 0

	const dispose = addSubs([mock.sub], () => {
		callCount++
	}, {now: true})

	assert.strictEqual(callCount, 1, 'callback should be called immediately with now:true')
	dispose()
})

test('addSubs - callback with now:false is not called immediately', () => {
	const mock = createMockSub()
	let callCount = 0

	const dispose = addSubs([mock.sub], () => {
		callCount++
	}, {now: false})

	assert.strictEqual(callCount, 0, 'callback should not be called immediately with now:false')
	dispose()
})

test('addSubs - callback without now option is not called immediately', () => {
	const mock = createMockSub()
	let callCount = 0

	const dispose = addSubs([mock.sub], () => {
		callCount++
	})

	assert.strictEqual(callCount, 0, 'callback should not be called immediately without now option')
	dispose()
})

test('addSubs - callback can return a cleanup function', () => {
	const mock = createMockSub()
	let cleanupCount = 0

	const dispose = addSubs([mock.sub], () => {
		return () => {
			cleanupCount++
		}
	})

	mock.trigger()
	assert.strictEqual(cleanupCount, 0, 'cleanup should not be called after first trigger')

	mock.trigger()
	assert.strictEqual(cleanupCount, 1, 'cleanup should be called before second trigger')

	dispose()
	assert.strictEqual(cleanupCount, 2, 'cleanup should be called on disposal')
})

test('addSubs - cleanup is called before each callback execution', () => {
	const mock = createMockSub()
	const events: string[] = []

	const dispose = addSubs([mock.sub], () => {
		events.push('callback')
		return () => {
			events.push('cleanup')
		}
	})

	mock.trigger()
	mock.trigger()
	mock.trigger()
	dispose()

	assert.deepStrictEqual(
		events,
		['callback', 'cleanup', 'callback', 'cleanup', 'callback', 'cleanup'],
		'cleanup should be called before each callback except the first'
	)
})

test('addSubs - disposer unsubscribes from all subscriptions', () => {
	const mock1 = createMockSub()
	const mock2 = createMockSub()
	let callCount = 0

	const dispose = addSubs([mock1.sub, mock2.sub], () => {
		callCount++
	})

	assert.ok(mock1.isActive(), 'first subscription should be active')
	assert.ok(mock2.isActive(), 'second subscription should be active')

	dispose()

	assert.strictEqual(mock1.isActive(), false, 'first subscription should be inactive after disposal')
	assert.strictEqual(mock2.isActive(), false, 'second subscription should be inactive after disposal')

	mock1.trigger()
	mock2.trigger()

	assert.strictEqual(callCount, 0, 'callback should not be called after disposal')
})

test('addSubs - multiple disposals are safe', () => {
	const mock = createMockSub()
	const dispose = addSubs([mock.sub], () => {})

	assert.doesNotThrow(() => {
		dispose()
		dispose()
		dispose()
	}, 'multiple disposal calls should be safe')
})

test('addSubs - empty subscriptions array works', () => {
	let callCount = 0

	const dispose = addSubs([], () => {
		callCount++
	})

	assert.strictEqual(callCount, 0, 'callback should not be called with empty subscriptions')
	dispose()
})

test('addSubs - empty subscriptions array with now:true calls callback', () => {
	let callCount = 0

	const dispose = addSubs([], () => {
		callCount++
	}, {now: true})

	assert.strictEqual(callCount, 1, 'callback should be called once with now:true even with empty subscriptions')
	dispose()
})

test('addSubs - callback returning undefined is handled', () => {
	const mock = createMockSub()
	let callCount = 0

	const dispose = addSubs([mock.sub], () => {
		callCount++
		return undefined
	})

	mock.trigger()
	mock.trigger()

	assert.strictEqual(callCount, 2, 'callback should be called multiple times')
	dispose()
})

test('addSubs - callback returning various values works', () => {
	const mock = createMockSub()
	let callCount = 0

	const dispose = addSubs([mock.sub], () => {
		callCount++
		// Return undefined or cleanup function - both are valid
		if (callCount % 2 === 0) {
			return () => {} // cleanup
		}
		return undefined // no cleanup
	})

	mock.trigger()
	mock.trigger()

	assert.strictEqual(callCount, 2, 'callback should be called multiple times')
	dispose()
})

test('addSubs - callback without errors works', () => {
	const mock = createMockSub()
	let callCount = 0

	const dispose = addSubs([mock.sub], () => {
		callCount++
		// Note: errors in callbacks are NOT caught
	})

	mock.trigger()
	mock.trigger()
	mock.trigger()

	assert.strictEqual(callCount, 3, 'callback should be called multiple times')
	dispose()
})

test('addSubs - cleanup without errors works', () => {
	const mock = createMockSub()
	let callCount = 0
	let cleanupCount = 0

	const dispose = addSubs([mock.sub], () => {
		callCount++
		return () => {
			cleanupCount++
			// Note: errors in cleanup are NOT caught
		}
	})

	mock.trigger()
	mock.trigger()
	mock.trigger()

	assert.strictEqual(callCount, 3, 'callback should be called multiple times')
	assert.ok(cleanupCount >= 2, 'cleanup should be called')
	dispose()
})

test('addSubs - now:true with cleanup function', () => {
	const mock = createMockSub()
	let cleanupCount = 0

	const dispose = addSubs([mock.sub], () => {
		return () => {
			cleanupCount++
		}
	}, {now: true})

	assert.strictEqual(cleanupCount, 0, 'cleanup should not be called immediately')

	mock.trigger()
	assert.strictEqual(cleanupCount, 1, 'cleanup should be called before first trigger')

	dispose()
	assert.strictEqual(cleanupCount, 2, 'cleanup should be called on disposal')
})

test('addSubs - state is maintained across subscription triggers', () => {
	const mock = createMockSub()
	const values: number[] = []
	let counter = 0

	const dispose = addSubs([mock.sub], () => {
		counter++
		values.push(counter)
	})

	mock.trigger()
	mock.trigger()
	mock.trigger()

	assert.deepStrictEqual(values, [1, 2, 3], 'state should be maintained across triggers')
	dispose()
})

test('addSubs - multiple subscriptions trigger independently', () => {
	const mock1 = createMockSub()
	const mock2 = createMockSub()
	const mock3 = createMockSub()
	const triggers: number[] = []

	const dispose = addSubs([mock1.sub, mock2.sub, mock3.sub], () => {
		triggers.push(Date.now())
	})

	mock1.trigger()
	mock3.trigger()
	mock2.trigger()
	mock1.trigger()

	assert.strictEqual(triggers.length, 4, 'callback should be called for each trigger')
	dispose()
})

test('addSubs - subscription disposers are called on disposal', () => {
	let disposer1Called = false
	let disposer2Called = false

	const sub1 = (cb: () => void) => {
		return () => {
			disposer1Called = true
		}
	}

	const sub2 = (cb: () => void) => {
		return () => {
			disposer2Called = true
		}
	}

	const dispose = addSubs([sub1, sub2], () => {})

	dispose()

	assert.strictEqual(disposer1Called, true, 'first subscription disposer should be called')
	assert.strictEqual(disposer2Called, true, 'second subscription disposer should be called')
})

test('addSubs - complex scenario with multiple subs and cleanups', () => {
	const mock1 = createMockSub()
	const mock2 = createMockSub()
	const events: string[] = []

	const dispose = addSubs([mock1.sub, mock2.sub], () => {
		events.push('callback')
		return () => {
			events.push('cleanup')
		}
	}, {now: true})

	mock1.trigger()
	mock2.trigger()
	dispose()

	assert.deepStrictEqual(
		events,
		['callback', 'cleanup', 'callback', 'cleanup', 'callback', 'cleanup'],
		'events should occur in correct order'
	)
})

test('addSubs - dispose during callback execution', () => {
	const mock = createMockSub()
	let disposeFunc: (() => void) | undefined
	let callCount = 0

	disposeFunc = addSubs([mock.sub], () => {
		callCount++
		if (callCount === 2) {
			disposeFunc!()
		}
	})

	mock.trigger()
	mock.trigger()
	mock.trigger()

	assert.ok(callCount <= 2, 'callback should not be called after self-disposal')
})

test('addSubs - single subscription works correctly', () => {
	const mock = createMockSub()
	let callCount = 0

	const dispose = addSubs([mock.sub], () => {
		callCount++
	})

	mock.trigger()
	mock.trigger()

	assert.strictEqual(callCount, 2, 'callback should be called twice')
	dispose()
	assert.strictEqual(mock.isActive(), false, 'subscription should be inactive after disposal')
})

test('addSubs - many subscriptions work correctly', () => {
	const mocks = Array.from({length: 10}, () => createMockSub())
	const triggers: number[] = []

	const dispose = addSubs(
		mocks.map((m) => m.sub),
		() => {
			triggers.push(Date.now())
		}
	)

	mocks.forEach((m) => m.trigger())

	assert.strictEqual(triggers.length, 10, 'callback should be called for each subscription')
	dispose()

	mocks.forEach((m, i) => {
		assert.strictEqual(m.isActive(), false, `subscription ${i} should be inactive after disposal`)
	})
})
