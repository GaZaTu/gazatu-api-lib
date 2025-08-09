export class ChainableAsyncIterable<T> {
  constructor(
    private _underlying: AsyncIterable<T>,
  ) {}

  [Symbol.asyncIterator]() {
    return this._underlying[Symbol.asyncIterator]()
  }

  filter(predicate: (value: T) => unknown): ChainableAsyncIterable<T> {
    return new ChainableAsyncIterable<T>({
      [Symbol.asyncIterator]: (): AsyncIterator<T> => {
        const iterator = this[Symbol.asyncIterator]()
        return {
          next: async () => {
            while (true) {
              const { done, value } = await iterator.next()
              if (!predicate(value)) {
                if (done) {
                  return { done, value: null }
                }
                continue
              }
              return { done, value }
            }
          },
          return: iterator.return ? () => {
            return iterator.return!() as any
          } : undefined,
          throw: iterator.throw ? (error: any) => {
            return iterator.throw!(error) as any
          } : undefined,
        }
      },
    })
  }

  map<R>(mapper: (value: T) => R): ChainableAsyncIterable<R> {
    return new ChainableAsyncIterable<R>({
      [Symbol.asyncIterator]: (): AsyncIterator<R> => {
        const iterator = this[Symbol.asyncIterator]()
        return {
          next: async () => {
            while (true) {
              const { done, value } = await iterator.next()
              return { done, value: mapper(value) }
            }
          },
          return: iterator.return ? () => {
            return iterator.return!() as any
          } : undefined,
          throw: iterator.throw ? (error: any) => {
            return iterator.throw!(error) as any
          } : undefined,
        }
      },
    })
  }
}

export const chainAsyncIterable = <T>(underlying: AsyncIterable<T>) => {
  return new ChainableAsyncIterable(underlying)
}
