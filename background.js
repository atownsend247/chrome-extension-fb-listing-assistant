// Only opens the full-page manager (toolbar icon, or the Manager button in the
// Facebook panel). It does nothing on Facebook and runs no timers.

const MANAGER_URL = chrome.runtime.getURL("manager.html");

async function openManager() {
  const [tab] = await chrome.tabs.query({ url: MANAGER_URL });
  if (tab) {
    await chrome.tabs.update(tab.id, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url: MANAGER_URL });
  }
}

chrome.action.onClicked.addListener(openManager);
chrome.runtime.onMessage.addListener(msg => {
  if (msg && msg.open === "manager") openManager();
});
