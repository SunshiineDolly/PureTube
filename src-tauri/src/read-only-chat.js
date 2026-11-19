(() => {
  if (location.origin !== 'https://www.youtube.com' ||
      !['/live_chat', '/live_chat_replay'].includes(location.pathname)) return;
  const selectors = [
    '#input-panel',
    'yt-live-chat-message-input-renderer',
    'yt-live-chat-signin-renderer',
    'yt-live-chat-sign-in-renderer',
    '#sign-in-button',
    'a[href*="accounts.google.com"]',
    'a[href*="/signin"]',
    'a[href*="/ServiceLogin"]'
  ].join(',');
  const clean = () => document.querySelectorAll(selectors).forEach(node => node.remove());
  new MutationObserver(clean).observe(document, {childList:true, subtree:true});
  clean();
  // This is a public message viewer. Keep third-party links in the chat from
  // navigating a frame or handing off to another browser/account flow.
  document.addEventListener('click', event => {
    if (event.target instanceof Element && event.target.closest('a')) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
})();
