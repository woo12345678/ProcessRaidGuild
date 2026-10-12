function isTrustedSender(event, trustedUrl) {
  return Boolean(event?.senderFrame && event.senderFrame.url === trustedUrl);
}

function guardIpcHandler(trustedUrl, handler) {
  return async function guardedHandler(event, ...args) {
    if (!isTrustedSender(event, trustedUrl)) throw new Error('Untrusted renderer');
    return handler(event, ...args);
  };
}

function installNavigationGuards(webContents, trustedUrl) {
  const blockUntrustedNavigation = (event, url) => {
    if (url !== trustedUrl) event.preventDefault();
  };
  webContents.on('will-navigate', blockUntrustedNavigation);
  webContents.on('will-redirect', blockUntrustedNavigation);
  webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

module.exports = { isTrustedSender, guardIpcHandler, installNavigationGuards };
