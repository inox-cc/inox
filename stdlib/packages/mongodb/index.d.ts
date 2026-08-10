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

export interface BulkWriteOptions {
  readonly ordered?: boolean;
}

export interface BulkWriteResult {
  readonly acknowledged: boolean;
  readonly insertedCount: number;
  readonly matchedCount: number;
  readonly modifiedCount: number;
  readonly deletedCount: number;
  readonly upsertedCount: number;
}

export interface InsertOneModel<TSchema extends Document = Document> {
  readonly insertOne: {
    readonly document: TSchema;
  };
}

export interface UpdateOneModel<TSchema extends Document = Document> {
  readonly updateOne: {
    readonly filter: Filter<TSchema>;
    readonly update: UpdateFilter<TSchema>;
    readonly upsert?: boolean;
  };
}

export interface UpdateManyModel<TSchema extends Document = Document> {
  readonly updateMany: {
    readonly filter: Filter<TSchema>;
    readonly update: UpdateFilter<TSchema>;
    readonly upsert?: boolean;
  };
}

export interface ReplaceOneModel<TSchema extends Document = Document> {
  readonly replaceOne: {
    readonly filter: Filter<TSchema>;
    readonly replacement: TSchema;
    readonly upsert?: boolean;
  };
}

export interface DeleteOneModel<TSchema extends Document = Document> {
  readonly deleteOne: {
    readonly filter: Filter<TSchema>;
  };
}

export interface DeleteManyModel<TSchema extends Document = Document> {
  readonly deleteMany: {
    readonly filter: Filter<TSchema>;
  };
}

export type AnyBulkWriteOperation<TSchema extends Document = Document> =
  | InsertOneModel<TSchema>
  | UpdateOneModel<TSchema>
  | UpdateManyModel<TSchema>
  | ReplaceOneModel<TSchema>
  | DeleteOneModel<TSchema>
  | DeleteManyModel<TSchema>;

export interface ClientBulkWriteModel {
  readonly namespace: string;
  readonly name: string;
  readonly document?: Document;
  readonly filter?: Document;
  readonly update?: Document;
  readonly replacement?: Document;
  readonly upsert?: boolean;
}

export type IndexSpecification = Document;

export interface CreateIndexesOptions {
  readonly commitQuorum?: string | number;
}

export interface CreateIndexOptions {
  readonly name?: string;
  readonly unique?: boolean;
  readonly sparse?: boolean;
  readonly expireAfterSeconds?: number;
  readonly partialFilterExpression?: Document;
}

export interface IndexDescription extends CreateIndexOptions {
  readonly key: IndexSpecification;
}

export class MongoClient {
  constructor(uri: string, options?: MongoClientOptions);

  static connect(uri: string, options?: MongoClientOptions): Promise<MongoClient>;

  connect(): Promise<MongoClient>;
  db(): Db;
  db(name: string): Db;
  bulkWrite(models: ClientBulkWriteModel[], options?: BulkWriteOptions): Promise<BulkWriteResult>;
  close(): Promise<void>;
}

export class Db {
  collection<TSchema extends Document = Document>(name: string): Collection<TSchema>;
}

export class FindCursor<TSchema extends Document = Document> {
  sort(sort: Document): FindCursor<TSchema>;
  limit(limit: number): FindCursor<TSchema>;
  next(): Promise<TSchema | null>;
  toArray(): Promise<TSchema[]>;
}

export class AggregationCursor<TSchema extends Document = Document> {
  sort(sort: Document): AggregationCursor<TSchema>;
  limit(limit: number): AggregationCursor<TSchema>;
  next(): Promise<TSchema | null>;
  toArray(): Promise<TSchema[]>;
}

export class Collection<TSchema extends Document = Document> {
  find(filter?: Filter<TSchema>): FindCursor<TSchema>;
  findOne(filter?: Filter<TSchema>): Promise<TSchema | null>;
  findOneAndUpdate(filter: Filter<TSchema>, update: UpdateFilter<TSchema>): Promise<TSchema | null>;
  aggregate<TResult extends Document = Document>(pipeline?: Document[]): AggregationCursor<TResult>;
  distinct(key: string, filter?: Filter<TSchema>): Promise<unknown[]>;
  countDocuments(filter?: Filter<TSchema>): Promise<number>;
  estimatedDocumentCount(): Promise<number>;
  createIndex(indexSpec: IndexSpecification, options?: CreateIndexOptions): Promise<string>;
  createIndexes(indexSpecs: IndexDescription[], options?: CreateIndexesOptions): Promise<string[]>;
  bulkWrite(operations: AnyBulkWriteOperation<TSchema>[], options?: BulkWriteOptions): Promise<BulkWriteResult>;
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
