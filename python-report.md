# Python Current Stable Version Report

## Version

Python 3.15

## Release Date

2026-10-09

## Top 3 New Features

1. **Explicit Lazy Imports (PEP 810)** — Python 3.15 introduces a new `lazy` soft keyword that defers module loading until the imported name is first used. This reduces application startup time without requiring code restructuring, since all imports can still be declared at the top of the file.

2. **`frozendict` Built-in Type (PEP 814)** — A new immutable mapping type `frozendict` is added directly to the builtins module. It behaves like a dictionary but cannot be modified after creation, and is hashable as long as all its keys and values are hashable.

3. **`sentinel` Built-in Type (PEP 661)** — Python 3.15 adds a built-in `sentinel` type for creating unique sentinel objects, which are commonly used as default parameter values or placeholder markers to distinguish between "no value passed" and `None`.
