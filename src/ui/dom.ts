export function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id}`);
  return element as T;
}

type Child = Node | string;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  properties: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const { class: className, ...rest } = properties;
  const element = Object.assign(document.createElement(tag), rest);
  if (className) element.className = className;
  element.append(...children);
  return element;
}

export function onEscapeBlurTooltip(): void {
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.classList.contains("tip")) active.blur();
  });
}
