export function apply(ctx) {
  const tableContainer = document.querySelector('.experiment-page-header-container');
  if (!tableContainer) return;

  // --- Button ---
  const btn = document.createElement('button');
  btn.className = `${ctx.scope}-freeze-btn`;

  // Apply all styles inline so they're not dependent on CSS class matching
  Object.assign(btn.style, {
    position: 'fixed',
    bottom: '28px',
    right: '28px',
    zIndex: '99999',
    display: 'flex',
    alignItems: 'center',
    gap: '7px',
    padding: '9px 16px 9px 12px',
    background: '#1a1a2e',
    color: '#fff',
    border: 'none',
    borderRadius: '24px',
    fontSize: '13px',
    fontWeight: '600',
    fontFamily: 'Roboto, system-ui, sans-serif',
    cursor: 'pointer',
    boxShadow: '0 4px 16px rgba(0,0,0,0.28)',
    letterSpacing: '0.01em',
    userSelect: 'none',
    transition: 'background 0.18s, transform 0.12s, box-shadow 0.18s',
  });

  const icon = document.createElement('span');
  icon.textContent = '📌';
  icon.style.fontSize = '15px';

  const label = document.createElement('span');
  label.textContent = 'Freeze Table';

  btn.appendChild(icon);
  btn.appendChild(label);
  document.body.appendChild(btn);

  btn.addEventListener('mouseover', () => {
    btn.style.transform = 'translateY(-1px)';
    btn.style.boxShadow = '0 6px 24px rgba(0,0,0,0.36)';
  });
  btn.addEventListener('mouseout', () => {
    btn.style.transform = '';
    btn.style.boxShadow = frozen
      ? '0 4px 20px rgba(92,107,192,0.45)'
      : '0 4px 16px rgba(0,0,0,0.28)';
  });

  // --- State ---
  let frozen = false;
  let placeholder = null;
  let originalStyles = {};

  function freeze() {
    frozen = true;
    btn.style.background = '#5c6bc0';
    btn.style.boxShadow = '0 4px 20px rgba(92,107,192,0.45)';
    icon.style.transform = 'rotate(-45deg)';
    label.textContent = 'Unfreeze Table';

    originalStyles = {
      position: tableContainer.style.position,
      top: tableContainer.style.top,
      left: tableContainer.style.left,
      width: tableContainer.style.width,
      zIndex: tableContainer.style.zIndex,
      background: tableContainer.style.background,
      boxShadow: tableContainer.style.boxShadow,
      margin: tableContainer.style.margin,
    };

    // Create placeholder to preserve layout height
    const rect = tableContainer.getBoundingClientRect();
    placeholder = document.createElement('div');
    placeholder.style.height = tableContainer.offsetHeight + 'px';
    placeholder.style.flexShrink = '0';
    tableContainer.parentNode.insertBefore(placeholder, tableContainer);

    tableContainer.style.position = 'fixed';
    tableContainer.style.top = '0px';
    tableContainer.style.left = rect.left + 'px';
    tableContainer.style.width = tableContainer.offsetWidth + 'px';
    tableContainer.style.zIndex = '9000';
    tableContainer.style.background = '#fff';
    tableContainer.style.boxShadow = '0 4px 16px rgba(0,0,0,0.18)';
    tableContainer.style.margin = '0';
  }

  function unfreeze() {
    frozen = false;
    btn.style.background = '#1a1a2e';
    btn.style.boxShadow = '0 4px 16px rgba(0,0,0,0.28)';
    icon.style.transform = '';
    label.textContent = 'Freeze Table';

    tableContainer.style.position = originalStyles.position;
    tableContainer.style.top = originalStyles.top;
    tableContainer.style.left = originalStyles.left;
    tableContainer.style.width = originalStyles.width;
    tableContainer.style.zIndex = originalStyles.zIndex;
    tableContainer.style.background = originalStyles.background;
    tableContainer.style.boxShadow = originalStyles.boxShadow;
    tableContainer.style.margin = originalStyles.margin;

    if (placeholder && placeholder.parentNode) {
      placeholder.parentNode.removeChild(placeholder);
    }
    placeholder = null;
  }

  btn.addEventListener('click', () => {
    if (frozen) unfreeze();
    else freeze();
  });

  ctx.onCleanup(() => {
    if (frozen) unfreeze();
    btn.remove();
  });
}

export function cleanup() {}
