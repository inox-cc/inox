export {}

declare global {
  class Object {
    static keys(value: unknown): Array<string>;
    static values(value: unknown): Array<unknown>;
    static entries(value: unknown): Array<Array<unknown>>;
  }
}
