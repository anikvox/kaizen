/**
 * Utility functions for Chrome AI availability checking
 */

/**
 * Check if Chrome AI flags are properly enabled
 * This checks if LanguageModel.availability exists, which indicates flags are set correctly
 * 
 * @returns Object containing flags status
 */
export async function checkChromeAIAvailability(): Promise<{
  available: boolean;
  reason?: string;
}> {
  const LanguageModel = (window as { LanguageModel?: { availability?: () => Promise<string> } }).LanguageModel;
  
  if (!LanguageModel?.availability) {
    return {
      available: false,
      reason: 'Chrome flags are not enabled. Please enable the required flags and restart Chrome.',
    };
  }

  return {
    available: true,
  };
}

/**
 * Check if the Gemini Nano model is available and ready to use
 * 
 * @returns Object containing model availability status
 */
export async function checkModelAvailability(): Promise<{
  status: 'readily' | 'after-download' | 'no';
  available: boolean;
  needsDownload: boolean;
  message: string;
}> {
  // First check if Chrome AI flags are enabled
  const chromeAICheck = await checkChromeAIAvailability();
  
  if (!chromeAICheck.available) {
    return {
      status: 'no',
      available: false,
      needsDownload: false,
      message: chromeAICheck.reason || 'Chrome flags are not enabled',
    };
  }

  try {
    const LanguageModel = (window as { LanguageModel?: { availability: () => Promise<string> } }).LanguageModel;
    
    // Check model availability status
    const status = await LanguageModel.availability();

    // Handle both 'readily' and 'available' as ready states
    if (status === 'readily' || status === 'available') {
      return {
        status: 'readily',
        available: true,
        needsDownload: false,
        message: 'Gemini Nano model is ready to use',
      };
    }

    if (status === 'after-download') {
      return {
        status: 'after-download',
        available: false,
        needsDownload: true,
        message: 'Gemini Nano model needs to be downloaded',
      };
    }

    if (status === 'no') {
      return {
        status: 'no',
        available: false,
        needsDownload: false,
        message: 'Gemini Nano model is not available on this device',
      };
    }

    // Unknown status - log it for debugging
    console.warn('Unknown model availability status:', status);
    return {
      status: 'no',
      available: false,
      needsDownload: false,
      message: `Unknown model availability status: ${status}`,
    };
  } catch (error) {
    return {
      status: 'no',
      available: false,
      needsDownload: false,
      message: `Error checking model availability: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}
