// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const page = new DOMParser().parseFromString(readFileSync("index.html", "utf8"), "text/html").body.innerHTML;
const SEEN_KEY = "sphere-tagger-welcome-seen";

const dialog = (id: string) => document.getElementById(id) as HTMLDialogElement;
const click = (id: string) => document.getElementById(id)!.click();

async function startWith(showWelcome = true) {
  vi.resetModules();
  vi.doMock("../src/config", () => ({ SHOW_WELCOME_ON_FIRST_VISIT: showWelcome }));
  const { setUpInfoDialogs } = await import("../src/ui/infoDialogs");
  setUpInfoDialogs();
}

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = page;
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});

afterEach(() => vi.restoreAllMocks());

describe("welcome dialog", () => {
  it("opens on the first visit and stays closed afterwards", async () => {
    await startWith();
    expect(dialog("welcomeDialog").open).toBe(true);
    dialog("welcomeDialog").close();

    document.body.innerHTML = page;
    await startWith();
    expect(dialog("welcomeDialog").open).toBe(false);
  });

  it("does not open when switched off in the config", async () => {
    await startWith(false);
    expect(dialog("welcomeDialog").open).toBe(false);
  });

  it("can be reopened with the Help button", async () => {
    await startWith(false);
    click("openHelp");
    expect(dialog("welcomeDialog").open).toBe(true);
  });

  it("keeps working when browser storage is blocked", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    await startWith();
    expect(dialog("welcomeDialog").open).toBe(true);
    expect(() => dialog("welcomeDialog").close()).not.toThrow();
  });

  it("remembers the visit under a stable key", async () => {
    await startWith();
    dialog("welcomeDialog").close();
    expect(localStorage.getItem(SEEN_KEY)).not.toBeNull();
  });
});

describe("footer", () => {
  it.each([["openAbout", "aboutDialog"]])("%s opens %s", async (button, target) => {
    await startWith(false);
    click(button);
    expect(dialog(target).open).toBe(true);
  });
});
