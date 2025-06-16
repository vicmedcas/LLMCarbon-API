// background.js

// This script ensures the side panel is available to be opened.
// It tells Chrome to open the side panel whenever the extension's action icon is clicked.
chrome.runtime.onInstalled.addListener(() => {
  if (chrome.sidePanel) {
    chrome.sidePanel
      .setPanelBehavior({ openPanelOnActionClick: true })
      .catch((error) => console.error(error));
  } else {
    console.error('sidePanel API not found. Please check your Chrome version.');
  }
});
