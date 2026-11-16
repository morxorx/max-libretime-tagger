import type { ShowProfile } from "./profile";

export interface ProfileRepository {
  loadAll(): Promise<ShowProfile[]>;
  save(profile: ShowProfile): Promise<void>;
  remove(name: string): Promise<void>;
}

export class MemoryRepository implements ProfileRepository {
  private readonly profiles = new Map<string, ShowProfile>();

  async loadAll(): Promise<ShowProfile[]> {
    return [...this.profiles.values()];
  }

  async save(profile: ShowProfile): Promise<void> {
    this.profiles.set(profile.name, profile);
  }

  async remove(name: string): Promise<void> {
    this.profiles.delete(name);
  }
}
