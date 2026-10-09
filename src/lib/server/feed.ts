import "server-only";
import { invalidate } from "./cache";
import { db } from "./supabase";

/**
 * Live "new coin" feed over Supabase Realtime Broadcast. The server announces
 * a launch once it is live; browsers just listen on the channel. Unlike
 * postgres_changes, nothing here polls the WAL or runs per-subscriber RLS
 * checks against the database, so open tabs cost the database nothing.
 */

export const FEED_CHANNEL = "pqc-launches-feed";
export const FEED_EVENT = "launch";

const FEED_COLUMNS =
  "mint, name, symbol, description, image_url, creator, pq_address, leaf_index, scheme, message_hash, dev_buy_sol, dev_vault, quote_mint, quote_symbol, quote_image, created_at, launched_at, twitter, website, status";

/** Best effort: a missed announcement only means the coin shows up on the next list refresh. */
export async function announceLaunch(mint: string) {
  try {
    const { data } = await db.from("pqc_launches").select(FEED_COLUMNS).eq("mint", mint).maybeSingle();
    if (!data || data.status !== "live") return;
    // Fresh page loads include the new coin right away, not after the list cache expires.
    await invalidate("launches:list:");
    await db.channel(FEED_CHANNEL).httpSend(FEED_EVENT, data);
  } catch (err) {
    console.warn("feed: announce failed", err instanceof Error ? err.message : err);
  }
}
