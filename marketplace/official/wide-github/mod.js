export function apply(ctx) {
  const style = document.createElement("style");
  style.className = ctx.scope;
  style.textContent = `
    .container-xl, .container-lg {
      max-width: 100% !important;
      padding-left: 32px !important;
      padding-right: 32px !important;
    }
  `;
  document.head.appendChild(style);
  ctx.onCleanup(() => style.remove());
}

export function cleanup() {}
