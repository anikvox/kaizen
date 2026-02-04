import { Storage } from "@plasmohq/storage"

const storage = new Storage()

// Update the action behavior based on auth state
async function updateActionBehavior() {
  const token = await storage.get<string>("deviceToken")

  if (token) {
    // User is logged in - disable popup so clicking opens sidepanel
    await chrome.action.setPopup({ popup: "" })
  } else {
    // User is not logged in - enable popup for login
    await chrome.action.setPopup({ popup: "popup.html" })
  }
}

// Handle extension icon click - open sidepanel when logged in
chrome.action.onClicked.addListener(async (tab) => {
  // This only fires when popup is disabled (user is logged in)
  if (tab.id) {
    await chrome.sidePanel.open({ tabId: tab.id })
  }
})

// Watch for storage changes to update behavior
storage.watch({
  deviceToken: async (change) => {
    updateActionBehavior()

    // Close sidepanel when user logs out
    if (!change.newValue) {
      const windows = await chrome.windows.getAll()
      for (const window of windows) {
        if (window.id) {
          await chrome.sidePanel.setOptions({
            enabled: false
          })
          // Re-enable for future use
          await chrome.sidePanel.setOptions({
            enabled: true,
            path: "sidepanel.html"
          })
        }
      }
    }
  }
})

// Initialize on startup
updateActionBehavior()
