import { parseBackup, serializeBackup } from "../shows/backup";
import { ShowCatalog } from "../shows/catalog";
import type { ShowProfile } from "../shows/profile";
import { byId, h } from "./dom";

export interface ShowsChange {
  select?: string;
  renamed?: { from: string; to: string };
}

export class ShowsDialog {
  private readonly dialog = byId<HTMLDialogElement>("showsDialog");
  private readonly list = byId<HTMLUListElement>("showList");
  private readonly empty = byId("showsEmpty");
  private readonly error = byId("showsError");
  private readonly addInput = byId<HTMLInputElement>("newShowName");

  constructor(
    private readonly catalog: ShowCatalog,
    private readonly onChange: (change: ShowsChange) => void,
  ) {
    byId("addShowForm").addEventListener("submit", (event) => {
      event.preventDefault();
      void this.guarded(() => this.addShow());
    });
    byId("closeShows").addEventListener("click", () => this.dialog.close());
    byId("exportShows").addEventListener("click", () => void this.guarded(() => this.exportShows()));
    byId("importShows").addEventListener("click", () => byId<HTMLInputElement>("importInput").click());
    byId<HTMLInputElement>("importInput").addEventListener("change", (event) => void this.guarded(() => this.importShows(event)));
  }

  open(focusNewShow: boolean): void {
    this.error.textContent = "";
    this.render();
    this.dialog.showModal();
    if (focusNewShow) this.addInput.focus();
  }

  private async addShow(): Promise<void> {
    const profile = await this.catalog.create(this.addInput.value);
    this.addInput.value = "";
    this.render();
    this.onChange({ select: profile.name });
    this.addInput.focus();
  }

  private render(): void {
    const shows = this.catalog.all();
    this.empty.hidden = shows.length > 0;
    this.list.replaceChildren(...shows.map((show) => this.renderRow(show)));
  }

  private renderRow(show: ShowProfile): HTMLLIElement {
    const name = h("input", { value: show.name, ariaLabel: `Name of ${show.name}`, autocomplete: "off" });
    name.addEventListener("change", () => void this.guarded(() => this.rename(show.name, name.value)));

    const actions = h("div", { class: "row-actions" });
    if (show.primaryCover) actions.append(this.button(`Clear primary cover of ${show.name}`, "Clear cover", () => this.clearCover(show.name)));
    actions.append(this.button(`Delete ${show.name}`, "Delete", () => this.deleteShow(show.name)));

    return h(
      "li",
      { class: "show-row" },
      h("label", { class: "row-field" }, h("span", { textContent: "Name" }), name),
      actions,
    );
  }

  private button(label: string, text: string, action: () => Promise<void>): HTMLButtonElement {
    const button = h("button", { type: "button", class: "btn quiet", ariaLabel: label, textContent: text });
    button.addEventListener("click", () => void this.guarded(action));
    return button;
  }

  private async rename(from: string, to: string): Promise<void> {
    const renamed = await this.catalog.rename(from, to);
    this.render();
    this.onChange({ renamed: { from, to: renamed.name } });
  }

  private async clearCover(name: string): Promise<void> {
    const show = this.catalog.find(name);
    if (show) await this.catalog.update({ ...show, primaryCover: null });
    this.render();
    this.onChange({});
  }

  private async deleteShow(name: string): Promise<void> {
    if (!window.confirm(`Delete "${name}" from your list? Files you already tagged stay as they are.`)) return;
    await this.catalog.remove(name);
    this.render();
    this.onChange({});
  }

  private async exportShows(): Promise<void> {
    const json = await serializeBackup(this.catalog.all());
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    Object.assign(document.createElement("a"), { href: url, download: "libretime-tagger-shows.json" }).click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  private async importShows(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    await this.catalog.upsertAll(await parseBackup(await file.text()));
    this.render();
    this.onChange({});
  }

  private async guarded(action: () => Promise<void>): Promise<void> {
    this.error.textContent = "";
    try {
      await action();
    } catch (failure) {
      this.error.textContent = failure instanceof Error ? failure.message : "Something went wrong.";
      this.render();
    }
  }
}
