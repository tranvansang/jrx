export default function computed<T, Deps extends any[] = unknown[]>(fn: () => T, getDeps?: () => Deps) {
	let cached: T
	let lastDeps: any[]
	let first = true

	return {
		get value() {
			if (!getDeps) return fn()
			const deps = getDeps()
			if (!first && deps.length === lastDeps.length && deps.every((dep, idx) => Object.is(dep, lastDeps[idx])))
				return cached
			first = false
			lastDeps = deps
			return (cached = fn())
		},
	}
}
