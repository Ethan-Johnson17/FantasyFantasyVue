/* League chat settings shared by the chat screen and its tests. */

/** How often the open chat checks for new messages. No live connection: the free hosting doesn't keep one open. */
export const CHAT_POLL_MS = 5_000
/** Matches the API's limit */
export const CHAT_MESSAGE_MAX = 500
/** How often league screens refresh the Chat tab's unread badge */
export const UNREAD_POLL_MS = 30_000
/** The API stops counting unread messages here */
export const UNREAD_CAP = 10

/** "3", or "9+" once the count reaches the cap. */
export function unreadText(count: number): string {
  return count >= UNREAD_CAP ? `${String(UNREAD_CAP - 1)}+` : String(count)
}
