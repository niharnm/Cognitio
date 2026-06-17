interface PendingVerification {
  claim: string;
  sourceUrl?: string;
  pageTitle?: string;
  mode: "selected_text" | "page";
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "cognitio-selection",
    title: "Verify selected claim",
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "cognitio-selection" || !info.selectionText) {
    return;
  }

  const pending: PendingVerification = {
    claim: info.selectionText,
    mode: "selected_text"
  };

  if (info.pageUrl) {
    pending.sourceUrl = info.pageUrl;
  }
  if (tab?.title) {
    pending.pageTitle = tab.title;
  }

  await chrome.storage.session.set({ pendingVerification: pending });
  await chrome.action.openPopup();
});
