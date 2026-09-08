# Global type operators

This package provides type-only operators for the default compiler profile.

## Supported API

- `ReturnType<T>` extracts the exact result `TypeRef` from a function type.

The package has no runtime bindings, native sources, or runtime requirements.
Removing it from a compiler profile removes the operator without changing the
compiler core.
