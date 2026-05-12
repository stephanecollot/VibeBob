export function apply(ctx) {
  const pres = document.querySelectorAll("pre");
  for (const pre of pres) {
    if (pre.querySelector(`.${ctx.scope}-copy`)) continue;
    pre.style.position = "relative";
    const btn = document.createElement("button");
    btn.className = `${ctx.scope}-copy`;
    btn.textContent = "Copy";
    Object.assign(btn.style, {
      position: "absolute",
      top: "6px",
      right: "6px",
      padding: "2px 8px",
      fontSize: "12px",
      borderRadius: "4px",
      border: "1px solid #ccc",
      background: "#f6f8fa",
      cursor: "pointer",
    });
    btn.addEventListener("click", () => {
      navigator.clipboard.writeText(pre.textContent || "");
      btn.textContent = "Copied!";
      setTimeout(() => (btn.textContent = "Copy"), 1500);
    });
    pre.appendChild(btn);
  }

  ctx.onCleanup(() => {
    document.querySelectorAll(`.${ctx.scope}-copy`).forEach((el) => el.remove());
  });
}

export function cleanup() {}
