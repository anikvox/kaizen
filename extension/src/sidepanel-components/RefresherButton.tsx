import { cn } from "@kaizen/ui";

// Chrome extension API types
declare const chrome: {
  tabs: {
    create: (options: { url: string }) => void;
  };
  runtime: {
    getURL: (path: string) => string;
  };
};

export function RefresherButton({
  isDisabled
}: {
  isDisabled: boolean
}) {
  const handleClick = () => {
    // Open the quiz page in a new tab
    chrome.tabs.create({
      url: chrome.runtime.getURL('tabs/dashboard.html')
    });
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    // Handle Enter key (Space is handled by default button behavior)
    if (event.key === 'Enter') {
      handleClick();
    }
  };

  return (
    <button
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={cn(
        "mt-2 text-sm text-blue-600 hover:text-blue-800 font-medium underline decoration-dotted underline-offset-2 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-300 focus:ring-offset-1 rounded px-1",
        isDisabled && "opacity-50 cursor-not-allowed pointer-events-none" // Disable button when disabled prop is true
      )}
      aria-label="Take a refresher quiz to test your knowledge"
    >
      Take a refresher →
    </button>
  );
}
