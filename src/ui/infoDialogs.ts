import { SHOW_WELCOME_ON_FIRST_VISIT } from "../config";
import { byId } from "./dom";

export const WELCOME_SEEN_KEY = "sphere-tagger-welcome-seen";

export function setUpInfoDialogs(): void {
  openOnClick("openAbout", "aboutDialog");
  openOnClick("openImprint", "imprintDialog");
  const welcome = openOnClick("openHelp", "welcomeDialog");
  if (SHOW_WELCOME_ON_FIRST_VISIT && !hasSeenWelcome()) showFirstVisit(welcome);
}

function openOnClick(buttonId: string, dialogId: string): HTMLDialogElement {
  const dialog = byId<HTMLDialogElement>(dialogId);
  byId(buttonId).addEventListener("click", () => dialog.showModal());
  return dialog;
}

function showFirstVisit(welcome: HTMLDialogElement): void {
  welcome.addEventListener("close", rememberWelcomeSeen, { once: true });
  welcome.showModal();
}

function hasSeenWelcome(): boolean {
  try {
    return localStorage.getItem(WELCOME_SEEN_KEY) !== null;
  } catch {
    return false;
  }
}

function rememberWelcomeSeen(): void {
  try {
    localStorage.setItem(WELCOME_SEEN_KEY, "1");
  } catch {
    // Blocked storage is not an error: the welcome simply shows again next visit.
  }
}
