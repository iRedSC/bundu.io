# Testing Philosophy

Tests define the public contract from a developer's point of view. They should consume functions, methods, and modules through their intended API shape without adapting expectations to the current implementation.

Every test should protect meaningful behavior: outputs, state transitions, invariants, boundaries, error semantics, and observable interactions. Tests that merely prove the language, framework, a constant, or superficial wiring add maintenance cost without protecting the product and should be removed.

Assertions must be strong enough to prevent false confidence. Avoid mocks that replace the behavior under test, assertions so broad that incorrect results pass, and fixtures chosen only because they fit the implementation. Include realistic inputs, edge cases, and negative cases where developers would reasonably depend on them.

Implementation details are not the contract. Refactoring internals should not break tests unless observable behavior changes. Conversely, a sound contract-level test failing is evidence that production code needs attention; the test should not be weakened merely to make the suite green.

Coverage is a diagnostic, not the goal. The goal is confidence that the code applies the right logic and presents a coherent, dependable API or SDK. Fewer high-value tests are better than many basic ones, but important branches and failure modes must not be left implicit.
