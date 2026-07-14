export {};

declare global {
  interface Date {
    getDate(): number;
    getDay(): number;
    getFullYear(): number;
    getHours(): number;
    getMilliseconds(): number;
    getMinutes(): number;
    getMonth(): number;
    getSeconds(): number;
    getTime(): number;
    getTimezoneOffset(): number;
    getUTCDate(): number;
    getUTCDay(): number;
    getUTCFullYear(): number;
    getUTCHours(): number;
    getUTCMilliseconds(): number;
    getUTCMinutes(): number;
    getUTCMonth(): number;
    getUTCSeconds(): number;
    toDateString(): string;
    toISOString(): string;
    toJSON(): string;
    toString(): string;
    toTimeString(): string;
    toUTCString(): string;
    valueOf(): number;
  }

  interface DateConstructor {
    new(): Date;
    new(value: number | string | Date): Date;
    new(
      year: number,
      month: number,
      day?: number,
      hour?: number,
      minute?: number,
      second?: number,
      millisecond?: number
    ): Date;

    now(): number;
    parse(value: string): number;
    UTC(
      year: number,
      month: number,
      day?: number,
      hour?: number,
      minute?: number,
      second?: number,
      millisecond?: number
    ): number;
  }

  const Date: DateConstructor;

  interface Performance {
    now(): number;
  }

  const performance: Performance;
}
