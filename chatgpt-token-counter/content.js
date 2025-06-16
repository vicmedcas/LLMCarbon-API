// content.js
// This script runs in the context of the ChatGPT webpage.
// Its sole responsibility is to extract message texts when requested by the popup.

console.log('ChatGPT Token Extractor: Content script loaded.');

/**
 * Extracts the text content from all conversation messages on the page.
 */
function extractMessages() {
    const messageElements = document.querySelectorAll('div[data-message-id]');
    const messages = [];
    let lastRole = null;

    // This selector targets elements that are likely to contain message text or code.
    const messageTextSelector = 'h1, h2, h3, h4, h5, h6, p, li, code, .whitespace-pre-wrap';

    messageElements.forEach(elem => {
        const role = elem.getAttribute('data-message-author-role');

        // Use querySelectorAll to capture all parts of a message (e.g., text and code blocks).
        const textElements = elem.querySelectorAll(messageTextSelector);
        let text = '';
        if (textElements.length > 0) {
            text = Array.from(textElements).map(el => el.textContent).join('\n\n').trim();
        } else {
            // Fallback to the entire element text if no matches are found.
            text = elem.textContent.trim();
        }

        if (text) {
            // Merge consecutive messages from the same author.
            if (role === lastRole && messages.length > 0) {
                messages[messages.length - 1].text += '\n\n' + text;
            } else {
                messages.push({ role, text });
                lastRole = role;
            }
        }
    });

    return messages.map(m => m.text);
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

