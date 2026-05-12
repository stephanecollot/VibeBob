export function apply(ctx) {
  // YouTube's CSP blocks eval/inline scripts injected from extensions in many cases.
  // We rely on CSS for most cases, and use a MutationObserver as fallback for
  // elements the CSS :has() selector might not catch (e.g., no href on the anchor).

  function hideShorts() {
    // Hide "Shorts" guide entries in the left sidebar
    document.querySelectorAll('ytd-guide-entry-renderer').forEach(el => {
      const titleEl = el.querySelector('yt-formatted-string.title');
      const anchor = el.querySelector('a#endpoint');
      const isShortsTitle = titleEl && titleEl.textContent.trim() === 'Shorts';
      const isShortsHref = anchor && anchor.getAttribute('href') === '/shorts';
      const isShortsAnchorTitle = anchor && anchor.getAttribute('title') === 'Shorts';
      if (isShortsTitle || isShortsHref || isShortsAnchorTitle) {
        el.style.setProperty('display', 'none', 'important');
      }
    });

    // Hide Shorts in mini guide
    document.querySelectorAll('ytd-mini-guide-entry-renderer').forEach(el => {
      const anchor = el.querySelector('a');
      if (anchor && (anchor.getAttribute('href') === '/shorts' || anchor.getAttribute('title') === 'Shorts')) {
        el.style.setProperty('display', 'none', 'important');
      }
    });

    // Hide Shorts shelves and items in feeds
    document.querySelectorAll(
      'ytd-reel-shelf-renderer, ytd-rich-shelf-renderer[is-shorts], ytd-reel-item-renderer, ytd-shorts, ytd-browse[page-subtype="shorts"]'
    ).forEach(el => {
      el.style.setProperty('display', 'none', 'important');
    });

    // Hide "Shorts" chip in the filter bar
    document.querySelectorAll('yt-chip-cloud-chip-renderer').forEach(el => {
      if (el.textContent.trim() === 'Shorts') {
        el.style.setProperty('display', 'none', 'important');
      }
    });
  }

  // Run immediately
  hideShorts();

  // Watch for DOM changes — YouTube loads content dynamically on SPA navigation
  const observer = new MutationObserver(() => {
    hideShorts();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  ctx.onCleanup(() => {
    observer.disconnect();
    // Restore all hidden elements by removing inline display override
    document.querySelectorAll(
      'ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer, ytd-reel-shelf-renderer, ' +
      'ytd-rich-shelf-renderer, ytd-reel-item-renderer, yt-chip-cloud-chip-renderer, ' +
      'ytd-shorts, ytd-browse'
    ).forEach(el => {
      el.style.removeProperty('display');
    });
  });
}

export function cleanup() {}
