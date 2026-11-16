import type { ShowProfile } from "./profile";
import type { ProfileRepository } from "./repository";

const STORE = "shows";

export class IndexedDbRepository implements ProfileRepository {
  private readonly database: Promise<IDBDatabase>;

  constructor(databaseName = "libretime-tagger", factory: IDBFactory = indexedDB) {
    this.database = open(factory, databaseName);
  }

  loadAll(): Promise<ShowProfile[]> {
    return this.run("readonly", (store) => store.getAll());
  }

  async save(profile: ShowProfile): Promise<void> {
    await this.run("readwrite", (store) => store.put(profile));
  }

  async remove(name: string): Promise<void> {
    await this.run("readwrite", (store) => store.delete(name));
  }

  private async run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const database = await this.database;
    const transaction = database.transaction(STORE, mode);
    return settle(action(transaction.objectStore(STORE)), transaction);
  }
}

function open(factory: IDBFactory, name: string): Promise<IDBDatabase> {
  const request = factory.open(name, 1);
  request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "name" });
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function settle<T>(request: IDBRequest<T>, transaction: IDBTransaction): Promise<T> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
