// content.js
// This script runs in the context of the ChatGPT webpage.
// Its sole responsibility is to extract message texts when requested by the popup.

console.log('ChatGPT Token Extractor: Content script loaded.');

/**
 * Extracts the text content from all conversation messages on the page.
 */
function extractMessages() {
  // Selectors for ChatGPT message containers.
  const messageNodes = document.querySelectorAll('[data-message-id] .markdown, [data-message-id] .text-base');
  const messages = Array.from(messageNodes).map(node => node.innerText.trim());
  console.log(`Extracted ${messages.length} messages.`);
  return messages.filter(Boolean);
}

/**
 * Listens for messages from other parts of the extension (i.e., the popup).
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'getMessages') {
    console.log('Received request for messages from popup.');
    const messages = extractMessages();
    sendResponse({ messages: messages });
  }
  // Return true to indicate you wish to send a response asynchronously (although not used here, it's good practice).
  return true;
});

