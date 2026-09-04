/**
 * Post-resolution invariants. See ENG-023.
 *
 * A failure here is a programmer or data-corruption signal, not a client
 * error. The caller halts the command transaction, alerts, and retains the
 * offending journal context. It never returns the failure to the player as a
 * rejected action.
 */
import type { GameState, RuleSet } from "./index";

export interface InvariantViolation {
  readonly code: string;
  readonly message: string;
}

/**
 * Validates after every resolution and every replay.
 *
 * The resolver calls this after every accepted command and replay calls it on
 * the reconstructed snapshot. Transition-only conservation is handled by
 * checkTransitionInvariants because hand-built fixtures may use a non-canonical
 * initial inventory baseline.
 */
export function checkInvariants(state: GameState, rules?: RuleSet): readonly InvariantViolation[] {
  const violations: InvariantViolation[] = [];
  const content = rules?.content;
  const strictRuntimeChecks = content !== undefined;
  // Hand-built unit fixtures may intentionally omit server-created ledgers.
  // A started snapshot always has decks and deeds, so relation checks remain
  // strict on real runtime state without making partial replay seams unusable.
  const enforceLedgerRelations =
    content === undefined || (state.decks !== undefined && state.deeds.length > 0);
  const add = (code: string, message: string): void => {
    violations.push({ code, message });
  };
  const safeNonNegative = (value: number): boolean => Number.isSafeInteger(value) && value >= 0;
  const unique = (values: readonly string[]): boolean => new Set(values).size === values.length;

  if (state.stateSchemaVersion !== "1.0.0") {
    add("UNSUPPORTED_STATE_SCHEMA", `Unsupported state schema: ${state.stateSchemaVersion}`);
  }
  if (state.contentVersion.length === 0)
    add("MISSING_CONTENT_VERSION", "Content version is empty.");
  if (!safeNonNegative(state.aggregateVersion)) {
    add("INVALID_AGGREGATE_VERSION", "Aggregate version must be a safe non-negative integer.");
  }
  if (!safeNonNegative(state.prng.draws) || state.prng.words.length !== 4) {
    add("INVALID_PRNG_STATE", "PRNG state has an invalid draw count or word count.");
  }
  for (const word of state.prng.words) {
    if (!Number.isInteger(word) || word < 0 || word > 0xffffffff) {
      add("INVALID_PRNG_WORD", "PRNG words must be unsigned 32-bit integers.");
      break;
    }
  }
  if (strictRuntimeChecks && state.contentVersion !== content.contentVersion) {
    add(
      "CONTENT_VERSION_MISMATCH",
      `State content ${state.contentVersion} does not match ${content.contentVersion}.`,
    );
  }

  const seatIds = state.seats.map((seat) => seat.seatId);
  if (!unique(seatIds)) add("DUPLICATE_SEAT_ID", "Seat IDs must be unique.");
  const seatById = new Map(state.seats.map((seat) => [seat.seatId, seat]));
  for (const seat of state.seats) {
    if (!safeNonNegative(seat.balance))
      add("NEGATIVE_SEAT_BALANCE", `Seat ${seat.seatId} has invalid cash.`);
    if (!safeNonNegative(seat.position))
      add("INVALID_POSITION", `Seat ${seat.seatId} has invalid position.`);
    if (!safeNonNegative(seat.detentionTurnsRemaining)) {
      add("INVALID_DETENTION_TURNS", `Seat ${seat.seatId} has invalid Detention turns.`);
    }
    if (!unique(seat.deedIds))
      add("DUPLICATE_SEAT_DEED", `Seat ${seat.seatId} lists a deed twice.`);
    if (!unique(seat.detentionReleaseCardIds)) {
      add("DUPLICATE_HELD_CARD", `Seat ${seat.seatId} holds a release card twice.`);
    }
  }

  const deedIds = state.deeds.map((deed) => deed.deedId);
  if (!unique(deedIds)) add("DUPLICATE_DEED_ID", "Deed IDs must be unique.");
  const deedById = new Map(state.deeds.map((deed) => [deed.deedId, deed]));
  const claimedDeedIds = new Set<string>();
  if (enforceLedgerRelations) {
    for (const seat of state.seats) {
      for (const deedId of seat.deedIds) {
        const deed = deedById.get(deedId);
        if (deed === undefined) {
          add("UNKNOWN_SEAT_DEED", `Seat ${seat.seatId} references unknown deed ${deedId}.`);
        } else if (deed.ownerSeatId !== seat.seatId) {
          add("DEED_OWNERSHIP_MISMATCH", `Deed ${deedId} disagrees with seat ${seat.seatId}.`);
        }
        if (!claimedDeedIds.has(deedId)) claimedDeedIds.add(deedId);
        else add("DUPLICATE_DEED_CLAIM", `Deed ${deedId} is claimed by multiple seats.`);
      }
    }
    for (const deed of state.deeds) {
      if (deed.ownerSeatId !== undefined) {
        const owner = seatById.get(deed.ownerSeatId);
        if (owner === undefined)
          add("UNKNOWN_DEED_OWNER", `Deed ${deed.deedId} has an unknown owner.`);
        if (!claimedDeedIds.has(deed.deedId)) {
          add("MISSING_DEED_CLAIM", `Owned deed ${deed.deedId} is absent from its seat.`);
        }
      }
    }
    if (!unique(state.bank.deedIds)) add("DUPLICATE_BANK_DEED", "The bank lists a deed twice.");
    for (const deedId of state.bank.deedIds) {
      const deed = deedById.get(deedId);
      if (deed === undefined)
        add("UNKNOWN_BANK_DEED", `The bank references unknown deed ${deedId}.`);
      else if (deed.ownerSeatId !== undefined)
        add("BANK_OWNED_DEED_MISMATCH", `Owned deed ${deedId} remains in the bank.`);
    }
    for (const deed of state.deeds) {
      const inBank = state.bank.deedIds.includes(deed.deedId);
      if (deed.ownerSeatId === undefined && !inBank) {
        add("MISSING_BANK_DEED", `Unowned deed ${deed.deedId} is absent from the bank.`);
      }
      if (deed.ownerSeatId !== undefined && inBank) {
        add("OWNED_DEED_IN_BANK", `Owned deed ${deed.deedId} is also in the bank.`);
      }
    }
  }
  for (const deed of state.deeds) {
    if (!Number.isInteger(deed.improvementLevel) || deed.improvementLevel < 0) {
      add("INVALID_IMPROVEMENT_LEVEL", `Deed ${deed.deedId} has an invalid improvement level.`);
    }
  }
  if (!Number.isSafeInteger(state.bank.cash))
    add("INVALID_BANK_CASH", "Bank cash must be a safe integer.");
  if (state.jackpot !== undefined && !safeNonNegative(state.jackpot))
    add("INVALID_JACKPOT", "The Rest-space jackpot must be a safe non-negative integer.");
  for (const [kind, quantity] of Object.entries(state.bank.improvementInventory)) {
    if (!safeNonNegative(quantity))
      add("INVALID_INVENTORY", `Inventory ${kind} has invalid quantity.`);
  }

  if (strictRuntimeChecks) {
    const routeIndexes = content.spaces.map((space) => space.routeIndex);
    if (new Set(routeIndexes).size !== routeIndexes.length)
      add("DUPLICATE_ROUTE_INDEX", "Route indexes must be unique.");
    const maxRouteIndex = Math.max(...routeIndexes, 0);
    for (const seat of state.seats) {
      if (seat.position > maxRouteIndex)
        add("POSITION_OUT_OF_RANGE", `Seat ${seat.seatId} is beyond the route.`);
    }
    const contentDeedIds = content.deeds.map((deed) => deed.deedId);
    if (
      enforceLedgerRelations &&
      (state.deeds.length !== contentDeedIds.length ||
        contentDeedIds.some((id) => !deedById.has(id)))
    ) {
      add("INCOMPLETE_DEED_LEDGER", "State deed ledger does not match content.");
    }
    const maxLevelByDeed = new Map(
      content.deeds.map((deed) => [
        deed.deedId,
        deed.improvementLevels === undefined
          ? 0
          : Math.max(...deed.improvementLevels.map((level) => level.level), 0),
      ]),
    );
    for (const deed of state.deeds) {
      const maxLevel = maxLevelByDeed.get(deed.deedId);
      if (maxLevel !== undefined && deed.improvementLevel > maxLevel) {
        add("IMPROVEMENT_LEVEL_OUT_OF_RANGE", `Deed ${deed.deedId} exceeds its content level.`);
      }
    }
    // Conservation is a transition invariant: a hand-built fixture may start
    // with an intentionally non-canonical inventory baseline. The resolver
    // compares before/after totals below, while this check validates each
    // snapshot's representability and non-negative quantities.
  }

  const activeSeat =
    state.activeSeatId === undefined ? undefined : seatById.get(state.activeSeatId);
  const prioritySeat =
    state.prioritySeatId === undefined ? undefined : seatById.get(state.prioritySeatId);
  if (strictRuntimeChecks && state.phase !== "Lobby" && state.phase !== "Finished") {
    if (activeSeat?.status !== "active")
      add("INVALID_ACTIVE_SEAT", "A live phase needs one active turn seat.");
    if (prioritySeat?.status !== "active")
      add("INVALID_PRIORITY_SEAT", "A live phase needs one active priority seat.");
  }
  if (state.phase !== "Finished" && activeSeat?.status === "eliminated")
    add("ELIMINATED_ACTIVE_SEAT", "An eliminated seat cannot be active.");
  if (state.phase !== "Finished" && prioritySeat?.status === "eliminated")
    add("ELIMINATED_PRIORITY_SEAT", "An eliminated seat cannot have priority.");

  if (state.obligation !== undefined) {
    const obligation = state.obligation;
    if (state.phase !== "AwaitDebt")
      add("OBLIGATION_PHASE_MISMATCH", "An obligation must pause in AwaitDebt.");
    if (seatById.get(obligation.debtorSeatId)?.status !== "active")
      add("INVALID_DEBTOR", "An obligation debtor must be active.");
    if (obligation.creditorSeatId === obligation.debtorSeatId)
      add("SELF_CREDITOR", "A debtor cannot owe itself.");
    if (obligation.creditorSeatId !== undefined && !seatById.has(obligation.creditorSeatId))
      add("UNKNOWN_CREDITOR", "An obligation creditor must exist.");
    if (!safeNonNegative(obligation.amount))
      add("INVALID_OBLIGATION_AMOUNT", "Obligation amount must be non-negative.");
    if (JSON.stringify(obligation.continuation) !== JSON.stringify(state.effectQueue))
      add(
        "OBLIGATION_CONTINUATION_MISMATCH",
        "Obligation continuation must mirror the effect queue.",
      );
  }
  if (state.pendingChoice !== undefined) {
    if (state.phase !== "AwaitChoice")
      add("CHOICE_PHASE_MISMATCH", "A pending choice must pause in AwaitChoice.");
    if (JSON.stringify(state.pendingChoice.continuation) !== JSON.stringify(state.effectQueue))
      add("CHOICE_CONTINUATION_MISMATCH", "Choice continuation must mirror the effect queue.");
  }
  if (state.pendingAcquisitionDeedId !== undefined && state.phase !== "AwaitPurchase")
    add("ACQUISITION_PHASE_MISMATCH", "A pending acquisition must pause in AwaitPurchase.");
  if (state.pendingAuction !== undefined) {
    const auction = state.pendingAuction;
    if (state.phase !== "AwaitAuction")
      add("AUCTION_PHASE_MISMATCH", "A deed auction must pause in AwaitAuction.");
    if (!safeNonNegative(auction.highBid))
      add("INVALID_AUCTION_BID", "Auction high bid must be non-negative.");
    if (auction.highBidderSeatId !== undefined && !seatById.has(auction.highBidderSeatId))
      add("UNKNOWN_AUCTION_BIDDER", "Auction bidder must exist.");
    if (!unique(auction.passedSeatIds))
      add("DUPLICATE_AUCTION_PASS", "Auction pass records must be unique.");
    if (
      auction.highBidderSeatId !== undefined &&
      auction.passedSeatIds.includes(auction.highBidderSeatId)
    )
      add("PASSED_AUCTION_BIDDER", "A passed bidder cannot hold the high bid.");
    if (prioritySeat?.status !== "active")
      add("INVALID_AUCTION_PRIORITY", "Auction priority must be an active seat.");
    if (auction.prioritySeatId !== state.prioritySeatId)
      add("AUCTION_PRIORITY_MISMATCH", "Auction priority must match state priority.");
  }
  if (state.pendingImprovementAuction !== undefined) {
    const auction = state.pendingImprovementAuction;
    if (state.phase !== "ImprovementAuction")
      add(
        "IMPROVEMENT_AUCTION_PHASE_MISMATCH",
        "An improvement auction must pause in ImprovementAuction.",
      );
    if (!safeNonNegative(auction.highBid))
      add("INVALID_IMPROVEMENT_AUCTION_BID", "Improvement auction bid must be non-negative.");
    if (!unique(auction.passedSeatIds))
      add("DUPLICATE_IMPROVEMENT_AUCTION_PASS", "Improvement auction pass records must be unique.");
    if (
      auction.highBidderSeatId !== undefined &&
      auction.passedSeatIds.includes(auction.highBidderSeatId)
    )
      add("PASSED_IMPROVEMENT_BIDDER", "A passed improvement bidder cannot hold the high bid.");
    if (auction.prioritySeatId !== state.prioritySeatId)
      add(
        "IMPROVEMENT_PRIORITY_MISMATCH",
        "Improvement auction priority must match state priority.",
      );
  }
  if (state.pendingTrade !== undefined) {
    const trade = state.pendingTrade;
    if (trade.proposerSeatId === trade.counterpartySeatId)
      add("SELF_TRADE", "A trade must name two distinct seats.");
    if (!seatById.has(trade.proposerSeatId) || !seatById.has(trade.counterpartySeatId))
      add("UNKNOWN_TRADE_PARTY", "Trade parties must exist.");
    if (!safeNonNegative(trade.aggregateVersion))
      add("INVALID_TRADE_VERSION", "Trade version must be non-negative.");
    for (const [side, ownerSeatId] of [
      [trade.offered, trade.proposerSeatId],
      [trade.requested, trade.counterpartySeatId],
    ] as const) {
      const owner = seatById.get(ownerSeatId);
      if (!safeNonNegative(side.cash) || (owner !== undefined && side.cash > owner.balance))
        add("INVALID_TRADE_CASH", "A trade cannot offer unavailable cash.");
      if (!unique(side.deedIds) || side.deedIds.some((id) => !owner?.deedIds.includes(id)))
        add("INVALID_TRADE_DEED", "A trade must name currently held deeds once.");
      if (
        !unique(side.detentionReleaseCardIds) ||
        side.detentionReleaseCardIds.some((id) => !owner?.detentionReleaseCardIds.includes(id))
      )
        add("INVALID_TRADE_CARD", "A trade must name currently held release cards once.");
    }
  }

  return Object.freeze(violations);
}

/** Throws the programmer/data-corruption signal required by ENG-023. */
export function assertInvariants(state: GameState, rules?: RuleSet, before?: GameState): void {
  const violations = [...checkInvariants(state, rules)];
  if (before !== undefined && rules !== undefined) {
    violations.push(...checkTransitionInvariants(before, state, rules));
  }
  if (violations.length > 0) {
    throw new Error(
      `Engine invariant violation: ${violations.map((item) => item.code).join(", ")}`,
    );
  }
}

function inventoryTotals(state: GameState, rules: RuleSet): Readonly<Record<string, number>> {
  const totals: Record<string, number> = {};
  for (const kind of Object.keys(rules.content.economy.improvementInventory)) {
    totals[kind] = state.bank.improvementInventory[kind] ?? 0;
  }
  for (const deedState of state.deeds) {
    const deed = rules.content.deeds.find((candidate) => candidate.deedId === deedState.deedId);
    for (const level of deed?.improvementLevels ?? []) {
      if (level.level <= deedState.improvementLevel) {
        const kind = Object.keys(rules.content.economy.improvementInventory)[0];
        if (kind !== undefined) totals[kind] = (totals[kind] ?? 0) + level.inventoryDelta;
      }
    }
  }
  return totals;
}

/** Compares finite inventory across one accepted command or replay step. */
export function checkTransitionInvariants(
  before: GameState,
  after: GameState,
  rules: RuleSet,
): readonly InvariantViolation[] {
  if (rules.content === undefined || rules.configuration === undefined) return [];
  if (rules.configuration.unlimitedImprovementInventory) return [];
  // Lobby setup creates the first ledger; it is not a construction transition.
  if (before.phase === "Lobby" || before.decks === undefined || after.decks === undefined)
    return [];
  const beforeTotals = inventoryTotals(before, rules);
  const afterTotals = inventoryTotals(after, rules);
  return Object.keys(beforeTotals)
    .filter((kind) => beforeTotals[kind] !== afterTotals[kind])
    .map((kind) => ({
      code: "INVENTORY_NOT_CONSERVED",
      message: `Inventory ${kind} changed without a matching level transition (${beforeTotals[kind]} -> ${afterTotals[kind]}).`,
    }));
}
