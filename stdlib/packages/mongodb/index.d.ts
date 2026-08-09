export interface Document {
  [key: string]: unknown;
}

export type Filter<TSchema extends Document> = Partial<TSchema>;
export type UpdateFilter<TSchema extends Document> = Document;

export class ObjectId {
  constructor(input?: string);

  static createFromTime(time: number): ObjectId;
  static isValid(input: string | ObjectId): boolean;

  equals(otherId: string | ObjectId): boolean;
  toString(): string;
}

export interface BSONApi {
  serialize(value: Document): Uint8Array;
  deserialize(value: Uint8Array): Document;
}

export const BSON: BSONApi;
