export interface Document {
  [key: string]: unknown;
}

export type Filter<TSchema extends Document> = Partial<TSchema>;
export type UpdateFilter<TSchema extends Document> = Document;

export interface MongoClientOptions {
  readonly appName?: string;
  readonly maxPoolSize?: number;
  readonly serverSelectionTimeoutMS?: number;
}

export interface InsertOneResult<TSchema extends Document = Document> {
  readonly acknowledged: boolean;
  readonly insertedId: unknown;
}

export interface InsertManyResult<TSchema extends Document = Document> {
  readonly acknowledged: boolean;
  readonly insertedCount: number;
  readonly insertedIds: Document;
}

export interface UpdateResult<TSchema extends Document = Document> {
  readonly acknowledged: boolean;
  readonly matchedCount: number;
  readonly modifiedCount: number;
  readonly upsertedCount: number;
  readonly upsertedId: unknown;
}

export interface DeleteResult {
  readonly acknowledged: boolean;
  readonly deletedCount: number;
}

export class MongoClient {
  constructor(uri: string, options?: MongoClientOptions);

  static connect(uri: string, options?: MongoClientOptions): Promise<MongoClient>;

  connect(): Promise<MongoClient>;
  db(): Db;
  db(name: string): Db;
  close(): Promise<void>;
}

export class Db {
  collection<TSchema extends Document = Document>(name: string): Collection<TSchema>;
}

export class Collection<TSchema extends Document = Document> {
  findOne(filter?: Filter<TSchema>): Promise<TSchema | null>;
  findOneAndUpdate(filter: Filter<TSchema>, update: UpdateFilter<TSchema>): Promise<TSchema | null>;
  insertOne(document: TSchema): Promise<InsertOneResult<TSchema>>;
  insertMany(documents: TSchema[]): Promise<InsertManyResult<TSchema>>;
  updateOne(filter: Filter<TSchema>, update: UpdateFilter<TSchema>): Promise<UpdateResult<TSchema>>;
  updateMany(filter: Filter<TSchema>, update: UpdateFilter<TSchema>): Promise<UpdateResult<TSchema>>;
  deleteOne(filter: Filter<TSchema>): Promise<DeleteResult>;
  deleteMany(filter: Filter<TSchema>): Promise<DeleteResult>;
}

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
