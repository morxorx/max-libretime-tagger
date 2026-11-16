import { collapseWhitespace } from "../domain/text";
import { byId, h } from "./dom";

interface Chip {
  name: string;
  primary: boolean;
}

export class ContributorsInput {
  private chips: Chip[] = [];
  private readonly list = byId<HTMLUListElement>("chipList");
  private readonly input = byId<HTMLInputElement>("contributorInput");

  constructor(private readonly onChange: () => void) {
    this.input.addEventListener("keydown", (event) => this.handleKey(event));
    this.input.addEventListener("blur", () => this.commitPending());
    this.input.addEventListener("input", () => this.onChange());
  }

  set(names: string[], primary: boolean): void {
    this.chips = names.map((name) => ({ name, primary }));
    this.input.value = "";
    this.render();
  }

  values(): string[] {
    this.commitPending();
    return this.chips.map((chip) => chip.name);
  }

  primaryNames(): string[] {
    return this.chips.filter((chip) => chip.primary).map((chip) => chip.name);
  }

  previewValues(): string[] {
    const pending = collapseWhitespace(this.input.value);
    return pending ? [...this.chips.map((chip) => chip.name), pending] : this.chips.map((chip) => chip.name);
  }

  private handleKey(event: KeyboardEvent): void {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      this.commitPending();
    } else if (event.key === "Backspace" && this.input.value === "" && this.chips.length > 0) {
      this.chips.pop();
      this.render();
    }
  }

  private commitPending(): void {
    const names = this.input.value.split(",").map(collapseWhitespace).filter(Boolean);
    this.input.value = "";
    for (const name of names) this.add(name);
    if (names.length > 0) this.render();
  }

  private add(name: string): void {
    const exists = this.chips.some((chip) => chip.name.toLowerCase() === name.toLowerCase());
    if (!exists) this.chips.push({ name, primary: false });
  }

  private render(): void {
    this.list.replaceChildren(...this.chips.map((chip) => this.renderChip(chip)));
    this.onChange();
  }

  private renderChip(chip: Chip): HTMLLIElement {
    const star = h("button", {
      type: "button",
      class: "chip-star",
      ariaPressed: String(chip.primary),
      ariaLabel: `${chip.name}: primary contributor`,
      textContent: chip.primary ? "★" : "☆",
    });
    star.addEventListener("click", () => {
      chip.primary = !chip.primary;
      this.render();
      this.list.querySelectorAll<HTMLButtonElement>(".chip-star")[this.chips.indexOf(chip)]?.focus();
    });

    const remove = h("button", { type: "button", class: "chip-remove", ariaLabel: `Remove ${chip.name}`, textContent: "×" });
    remove.addEventListener("click", () => {
      this.chips = this.chips.filter((other) => other !== chip);
      this.render();
      this.input.focus();
    });

    const badge = chip.primary ? h("span", { class: "chip-badge", textContent: "primary" }) : "";
    return h("li", { class: chip.primary ? "chip is-primary" : "chip" }, star, h("span", { textContent: chip.name }), badge, remove);
  }
}
