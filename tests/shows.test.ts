import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { parseBackup, serializeBackup, BackupFormatError } from "../src/shows/backup";
import { ShowCatalog, ShowNameError } from "../src/shows/catalog";
import { IndexedDbRepository } from "../src/shows/indexedDbRepository";
import { newProfile, suggestedEpisode } from "../src/shows/profile";
import { MemoryRepository, type ProfileRepository } from "../src/shows/repository";

const repositories: [string, () => ProfileRepository][] = [
  ["memory", () => new MemoryRepository()],
  ["indexedDB", () => new IndexedDbRepository(`test-${Math.random()}`)],
];

describe.each(repositories)("ShowCatalog on %s repository", (_, makeRepository) => {
  const makeCatalog = async () => {
    const catalog = new ShowCatalog(makeRepository());
    await catalog.load();
    return catalog;
  };

  it("creates shows with normalized names, sorted", async () => {
    const catalog = await makeCatalog();
    await catalog.create("  zeta   show ");
    await catalog.create("Alpha’s Hour");
    expect(catalog.all().map((show) => show.name)).toEqual(["Alpha's Hour", "zeta show"]);
  });

  it("rejects duplicates that only differ in case or quotes", async () => {
    const catalog = await makeCatalog();
    await catalog.create("Mike's Hour");
    await expect(catalog.create("MIKE’S  hour")).rejects.toThrow(ShowNameError);
  });

  it("rejects empty names", async () => {
    await expect((await makeCatalog()).create("   ")).rejects.toThrow(ShowNameError);
  });

  it("renames and keeps stored data", async () => {
    const catalog = await makeCatalog();
    const show = await catalog.create("Old");
    await catalog.update({ ...show, lastEpisode: 36 });
    await catalog.rename("Old", "New");
    expect(catalog.find("Old")).toBeUndefined();
    expect(catalog.find("New")?.lastEpisode).toBe(36);
  });

  it("allows changing only the capitalization of a show", async () => {
    const catalog = await makeCatalog();
    await catalog.create("quick");
    await expect(catalog.rename("quick", "Quick")).resolves.toMatchObject({ name: "Quick" });
  });

  it("persists across catalog instances", async () => {
    const repository = makeRepository();
    const first = new ShowCatalog(repository);
    await first.load();
    await first.create("Persistent");
    const second = new ShowCatalog(repository);
    await second.load();
    expect(second.find("persistent")?.name).toBe("Persistent");
  });

  it("removes shows", async () => {
    const catalog = await makeCatalog();
    await catalog.create("Gone");
    await catalog.remove("Gone");
    expect(catalog.all()).toEqual([]);
  });
});

describe("suggestedEpisode", () => {
  it("is empty until an episode was saved, then last plus one", () => {
    expect(suggestedEpisode(newProfile("A"))).toBeNull();
    expect(suggestedEpisode({ ...newProfile("A"), lastEpisode: 37 })).toBe(38);
  });
});

describe("backup", () => {
  it("round-trips profiles including cover images", async () => {
    const cover = new Blob([new Uint8Array([1, 2, 3, 250])], { type: "image/jpeg" });
    const original = { ...newProfile("Quick"), lastEpisode: 7, primaryContributors: ["DJ B"], primaryCover: cover };
    const [restored] = await parseBackup(await serializeBackup([original]));
    expect(restored).toMatchObject({ name: "Quick", lastEpisode: 7, primaryContributors: ["DJ B"] });
    expect([...new Uint8Array(await restored!.primaryCover!.arrayBuffer())]).toEqual([1, 2, 3, 250]);
  });

  it.each(["not json", "{}", '{"version":1,"shows":[{"name":""}]}'])("rejects %s", async (text) => {
    await expect(parseBackup(text)).rejects.toThrow(BackupFormatError);
  });
});
