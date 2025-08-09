import type { ComplexityEstimator } from "npm:graphql-query-complexity@^1.1.0"
import complexity from "npm:graphql-query-complexity@^1.1.0/cjs"

export const Complexity = {
  MAXIMUM: 1024,
  DEFAULT: 1,
  VIRTUAL_FIELD: 16,
  COMPLEX_FIELD: 64,
  SIMPLE_QUERY: 32,
  COMPLEX_QUERY: 128,
  MUTATION: 128,
  PAGINATION: (({ args, childComplexity }) => {
    const limit = args?.args?.window?.limit ?? args?.window?.limit ?? 25
    if (!limit) {
      return Number.MAX_SAFE_INTEGER
    }

    const result = childComplexity * Math.ceil(limit / 3)
    return result
  }) as ComplexityEstimator,
}

export const COMPLEXITY_ESTIMATORS = [
  complexity.fieldExtensionsEstimator(),
  complexity.simpleEstimator({ defaultComplexity: Complexity.DEFAULT }),
]

export const getComplexity = complexity.getComplexity
