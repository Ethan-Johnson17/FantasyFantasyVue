/* League chat settings shared by the chat screen and its tests. */

/** How often the open chat checks for new messages. No live connection: the free hosting doesn't keep one open. */
export const CHAT_POLL_MS = 5_000
/** Matches the API's limit */
export const CHAT_MESSAGE_MAX = 500
