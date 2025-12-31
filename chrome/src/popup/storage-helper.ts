/**
 * Storage helper using message channel to background
 * Works with both Chrome (MV3) and Firefox (MV2)
 */

let messageId = 0;

function generateId(): string {
  return `storage-${Date.now()}-${++messageId}`;
}

/**
 * Send message to background and wait for response
 */
function sendToBackground<T>(type: string, payload: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = generateId();
    chrome.runtime.sendMessage(
      { id, type, payload },
      (response: { ok: boolean; data?: T; errorMessage?: string } | undefined) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response) {
          reject(new Error('No response from background'));
          return;
        }
        if (response.ok) {
          resolve(response.data as T);
        } else {
          reject(new Error(response.errorMessage || 'Unknown error'));
        }
      }
    );
  });
}

/**
 * Get items from local storage via background
 */
export async function storageGet(keys: string[]): Promise<Record<string, unknown>> {
  return sendToBackground<Record<string, unknown>>('STORAGE_GET', { keys });
}

/**
 * Set items to local storage via background
 */
export async function storageSet(items: Record<string, unknown>): Promise<void> {
  await sendToBackground<{ success: boolean }>('STORAGE_SET', { items });
}
