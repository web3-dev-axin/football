import postgres from "postgres";
import type { ResultProposal, Trade } from "@polygoal/shared";

/**
 * Reads the indexer's Ponder schema (markets / trades / result_proposals) and
 * surfaces the rows in the same shape the rest of the API already returns
 * via the in-memory state. Lets `/portfolio` and `/settlements` serve real
 * on-chain data when the indexer is running, without forcing every other
 * endpoint to be migrated off the in-memory model.
 *
 * Returns `null` from {@link createPonderReader} when the indexer has not yet
 * provisioned its schema, so callers can transparently fall back to legacy
 * data.
 */
export class PonderReader {
  private constructor(
    private readonly sql: postgres.Sql,
    private readonly schema: string,
  ) {}

  static async create(databaseUrl: string, schema = "ponder"): Promise<PonderReader | null> {
    // Pin every connection in this pool to the Ponder schema so we don't have
    // to inject the schema name into every query (which broke with
    // postgres.js's identifier escaping and produced cartesian joins).
    const sql = postgres(databaseUrl, {
      max: 2,
      connect_timeout: 5,
      connection: { search_path: schema },
    });
    try {
      const rows = await sql<Array<{ exists: boolean }>>`
        select exists(
          select 1 from information_schema.tables
          where table_schema = ${schema} and table_name = 'trade'
        ) as exists
      `;
      if (!rows[0]?.exists) {
        await sql.end();
        return null;
      }
      return new PonderReader(sql, schema);
    } catch {
      await sql.end().catch(() => {});
      return null;
    }
  }

  async close(): Promise<void> {
    await this.sql.end();
  }

  /**
   * On chain `market_key` is always `fixture:<id>:<type>`. The commercial
   * market id the API uses is sometimes the same (`fixture:worldcup-2026-002:match_winner`)
   * and sometimes has the `fixture:` prefix removed (`demo-2026-001:match_winner`).
   * Strip one leading `fixture:` to recover the API id.
   */
  private toCommercialMarketId(marketKey: string): string {
    return marketKey.startsWith("fixture:") ? marketKey.slice("fixture:".length) : marketKey;
  }

  async listTradesForWallet(walletAddress: `0x${string}`): Promise<Trade[]> {
    const lowered = walletAddress.toLowerCase();
    const rows = await this.sql<
      Array<{
        id: string;
        market_key: string;
        trader: string;
        outcome_index: number;
        collateral_amount_raw: string;
        shares_amount_raw: string;
        trade_type: number;
      }>
    >`
      select t.id,
             m.market_key,
             t.trader,
             t.outcome_index,
             t.collateral_amount_raw::text as collateral_amount_raw,
             t.shares_amount_raw::text as shares_amount_raw,
             t.trade_type
      from trade t
      join market m on m.market_address = t.market_address
      where lower(t.trader) = ${lowered}
      order by t.block_number, t.log_index
    `;

    return rows.map((row) => ({
      id: row.id,
      marketId: this.toCommercialMarketId(row.market_key),
      walletAddress: row.trader as `0x${string}`,
      outcomeIndex: row.outcome_index,
      collateralAmountRaw: row.collateral_amount_raw,
      sharesAmountRaw: row.shares_amount_raw,
      tradeType: row.trade_type === 0 ? "buy" : "sell",
    }));
  }

  /**
   * If this commercial market has an on-chain ResultProposal, return the live
   * oracle state and the corresponding market status so the API can overlay it
   * on top of the in-memory `live_trading` default. Used by `/markets/:id`.
   */
  async getMarketStatusOverlay(commercialMarketId: string): Promise<{ status: string; oracleState: string; winningOutcome?: number } | null> {
    const onchainKey = `fixture:${commercialMarketId}`;
    const rows = await this.sql<Array<{ status: string; winning_outcome: number }>>`
      select rp.status, rp.winning_outcome
      from result_proposal rp
      join market m on m.market_id = rp.market_id
      where m.market_key = ${onchainKey}
      limit 1
    `;
    if (rows.length === 0) return null;
    const { status, winning_outcome } = rows[0];
    if (status === "finalized") return { status: "redeemable", oracleState: "finalized", winningOutcome: winning_outcome };
    if (status === "voided") return { status: "voided", oracleState: "voided" };
    if (status === "challenged") return { status: "challenged", oracleState: "challenged", winningOutcome: winning_outcome };
    return { status: "proposed", oracleState: "proposed", winningOutcome: winning_outcome };
  }

  async listSettlements(statusFilter?: string): Promise<ResultProposal[]> {
    const rows = await this.sql<
      Array<{
        market_id: string;
        market_key: string | null;
        winning_outcome: number;
        challenge_deadline: string | null;
        status: string;
        proposed_tx_hash: string | null;
        finalized_tx_hash: string | null;
        challenge_evidence_uri: string | null;
      }>
    >`
      select rp.market_id,
             m.market_key,
             rp.winning_outcome,
             coalesce(rp.challenge_deadline::text, '') as challenge_deadline,
             rp.status,
             rp.proposed_tx_hash,
             rp.finalized_tx_hash,
             rp.challenge_evidence_uri
      from result_proposal rp
      left join market m on m.market_id = rp.market_id
      ${statusFilter ? this.sql`where rp.status = ${statusFilter}` : this.sql``}
      order by coalesce(rp.proposed_block, rp.finalized_block, 0)
    `;

    return rows.map((row) => {
      const apiMarketId = row.market_key
        ? this.toCommercialMarketId(row.market_key)
        : row.market_id;
      const deadlineSeconds = row.challenge_deadline ? Number(row.challenge_deadline) : NaN;
      return {
        id: `proposal:${apiMarketId}`,
        marketId: apiMarketId,
        winningOutcome: row.winning_outcome,
        goalCountInWindow: 0,
        evidenceUri: row.challenge_evidence_uri ?? "",
        challengeDeadline: Number.isFinite(deadlineSeconds)
          ? new Date(deadlineSeconds * 1000).toISOString()
          : new Date(0).toISOString(),
        status: row.status as ResultProposal["status"],
        txHash: (row.finalized_tx_hash ?? row.proposed_tx_hash ?? undefined) as
          | `0x${string}`
          | undefined,
      };
    });
  }
}
