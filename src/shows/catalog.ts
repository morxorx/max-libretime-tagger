import { normalizeShowName, showKey } from "../domain/text";
import { newProfile, type ShowProfile } from "./profile";
import type { ProfileRepository } from "./repository";

export class ShowNameError extends Error {}

export class ShowCatalog {
  private profiles = new Map<string, ShowProfile>();

  constructor(private readonly repository: ProfileRepository) {}

  async load(): Promise<void> {
    const stored = await this.repository.loadAll();
    this.profiles = new Map(stored.map((profile) => [showKey(profile.name), profile]));
  }

  all(): ShowProfile[] {
    return [...this.profiles.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  find(name: string): ShowProfile | undefined {
    return this.profiles.get(showKey(name));
  }

  async create(rawName: string): Promise<ShowProfile> {
    const name = this.requireAvailableName(rawName);
    const profile = newProfile(name);
    await this.store(profile);
    return profile;
  }

  async rename(currentName: string, rawName: string): Promise<ShowProfile> {
    const current = this.requireShow(currentName);
    const name = this.requireAvailableName(rawName, current.name);
    if (name === current.name) return current;
    await this.remove(current.name);
    const renamed = { ...current, name };
    await this.store(renamed);
    return renamed;
  }

  async update(profile: ShowProfile): Promise<void> {
    this.requireShow(profile.name);
    await this.store(profile);
  }

  async remove(name: string): Promise<void> {
    const profile = this.requireShow(name);
    await this.repository.remove(profile.name);
    this.profiles.delete(showKey(profile.name));
  }

  async upsertAll(imported: ShowProfile[]): Promise<void> {
    for (const profile of imported) await this.store({ ...profile, name: normalizeShowName(profile.name) });
  }

  private async store(profile: ShowProfile): Promise<void> {
    await this.repository.save(profile);
    this.profiles.set(showKey(profile.name), profile);
  }

  private requireShow(name: string): ShowProfile {
    const profile = this.find(name);
    if (!profile) throw new ShowNameError(`There is no show named "${name}".`);
    return profile;
  }

  private requireAvailableName(rawName: string, ownName?: string): string {
    const name = normalizeShowName(rawName);
    if (name === "") throw new ShowNameError("Enter a show name.");
    const existing = this.find(name);
    if (existing && existing.name !== ownName) {
      throw new ShowNameError(`"${existing.name}" already exists. Pick it from the list instead.`);
    }
    return name;
  }
}
