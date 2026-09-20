/** A very small element builder. The app has no framework and does not need one. */

export type Child = Node | string | number | null | undefined | false;

export interface ElProps {
  class?: string;
  text?: string;
  onClick?: (event: MouseEvent) => void;
  attrs?: Record<string, string | number | boolean>;
  children?: Child[];
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: ElProps = {},
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);

  if (props.class) node.className = props.class;
  if (props.text !== undefined) node.textContent = props.text;

  for (const [name, value] of Object.entries(props.attrs ?? {})) {
    if (value === false) continue;
    node.setAttribute(name, value === true ? '' : String(value));
  }

  if (props.onClick) {
    const handler = props.onClick;
    node.addEventListener('click', (event) => handler(event as MouseEvent));
  }

  for (const child of props.children ?? []) {
    if (child === null || child === undefined || child === false) continue;
    node.append(typeof child === 'object' ? child : String(child));
  }

  return node;
}

/** A screen owns its DOM and anything it started, such as a countdown. */
export interface Screen {
  readonly element: HTMLElement;
  destroy?(): void;
}

export function screen(className: string, children: Child[]): HTMLElement {
  return el('div', { class: className, children });
}
