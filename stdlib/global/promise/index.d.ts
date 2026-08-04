export {}

declare global {
  class Promise<T> {
    constructor(executor: (resolve: (value: T) => void, reject: (reason: unknown) => void) => void);

    static all<T>(values: Array<T | Promise<T>>): Promise<T[]>;
    static race<T>(values: Array<T | Promise<T>>): Promise<T>;
    static resolve<T>(value: T | Promise<T>): Promise<T>;
    static resolve(): Promise<void>;
    static reject<E>(reason: E): Promise<unknown>;
    static reject(): Promise<unknown>;

    then<U>(onFulfilled: (value: T) => U): Promise<U>;
    catch(onRejected: (reason: unknown) => T): Promise<T>;
    finally(onFinally?: () => void): Promise<T>;
  }
}
