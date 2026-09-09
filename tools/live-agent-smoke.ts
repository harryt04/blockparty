import { randomUUID } from "node:crypto";
import {
  BootstrapResponse,
  CommandEnvelope,
  type LegalAction,
  type Command,
} from "../packages/contracts/src/index";

const baseUrl = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/u, "");
const requestIds = new Set<string>();
const maxSteps = Number.parseInt(process.env.SMOKE_STEPS ?? "64", 10);
const humanSeatCount = Number.parseInt(process.env.SMOKE_HUMAN_SEATS ?? "1", 10);
const botSeatCount = Number.parseInt(process.env.SMOKE_BOT_SEATS ?? "1", 10);

class CookieJar {
  private readonly values = new Map<string, string>();

  absorb(response: Response): void {
    const getSetCookie = (response.headers as Headers & { getSetCookie?: () => string[] })
      .getSetCookie;
    const headers = getSetCookie?.call(response.headers) ?? [];
    for (const header of headers) {
      const separator = header.indexOf("=");
      const end = header.indexOf(";", separator);
      if (separator <= 0) continue;
      const name = header.slice(0, separator);
      const value = header.slice(separator + 1, end < 0 ? undefined : end);
      this.values.set(name, value);
    }
  }

  header(): string {
    return [...this.values.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
  }

  value(name: string): string | undefined {
    return this.values.get(name);
  }
}

async function request(path: string, init: RequestInit, cookies: CookieJar): Promise<Response> {
  const headers = new Headers(init.headers);
  const cookie = cookies.header();
  if (cookie.length > 0) headers.set("cookie", cookie);
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  cookies.absorb(response);
  return response;
}

async function json(response: Response): Promise<unknown> {
  const body: unknown = await response.json();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

function nextRequestId(): string {
  const requestId = randomUUID();
  requestIds.add(requestId);
  return requestId;
}

function nextCommandId(): string {
  return randomUUID();
}

function payloadForLegalAction(action: LegalAction): Command {
  const constraints = action.constraints ?? {};
  const stringConstraint = (key: string): string | undefined =>
    typeof constraints[key] === "string" ? constraints[key] : undefined;

  switch (action.type) {
    case "RollDice":
    case "EndTurn":
    case "EndNoContest":
    case "PassAuction":
    case "PayObligation":
    case "DeclareBankruptcy":
    case "StartGame":
      return { type: action.type };
    case "AcquireDeed":
    case "DeclineAcquisition":
    case "MortgageDeed":
    case "RedeemMortgage":
    case "BuyImprovement":
    case "SellImprovement":
    case "RequestScarceImprovement": {
      const deedId = stringConstraint("deedId");
      if (deedId === undefined) throw new Error(`${action.type} omitted deedId constraint`);
      return { type: action.type, deedId };
    }
    case "PlaceAuctionBid": {
      const minimum = constraints.minBid;
      if (typeof minimum !== "number") throw new Error("PlaceAuctionBid omitted minBid constraint");
      return { type: "PlaceAuctionBid", amount: minimum };
    }
    case "ChoosePendingOption": {
      const choiceId = stringConstraint("choiceId");
      if (choiceId === undefined)
        throw new Error("ChoosePendingOption omitted choiceId constraint");
      return {
        type: "ChoosePendingOption",
        choiceId,
        optionId: stringConstraint("optionId") ?? "selected",
      };
    }
    case "AcceptTrade":
    case "RejectTrade":
    case "CancelTrade": {
      const tradeId = stringConstraint("tradeId");
      if (tradeId === undefined) throw new Error(`${action.type} omitted tradeId constraint`);
      return { type: action.type, tradeId };
    }
    case "ProposeTrade": {
      const counterpartySeatId = stringConstraint("counterpartySeatId");
      if (counterpartySeatId === undefined) {
        throw new Error("ProposeTrade omitted counterpartySeatId constraint");
      }
      return {
        type: "ProposeTrade",
        counterpartySeatId,
        offered: { cash: 1, deedIds: [], detentionReleaseCardIds: [] },
        requested: { cash: 1, deedIds: [], detentionReleaseCardIds: [] },
      };
    }
    default:
      throw new Error(`Agent harness does not know how to compose ${action.type}`);
  }
}

function chooseAction(actions: readonly LegalAction[]): LegalAction {
  const preferred = [
    "CancelTrade",
    "RejectTrade",
    "RollDice",
    "AcquireDeed",
    "DeclineAcquisition",
    "PassAuction",
    "PayObligation",
    "ChoosePendingOption",
    "ProposeTrade",
    "EndTurn",
    "MortgageDeed",
    "RedeemMortgage",
    "SellImprovement",
    "BuyImprovement",
    "RequestScarceImprovement",
  ];
  return (
    preferred.map((type) => actions.find((action) => action.type === type)).find(Boolean) ??
    actions[0]!
  );
}

async function bootstrap(cookies: CookieJar, gameId: string) {
  const response = await request(`/api/games/${gameId}/bootstrap`, {}, cookies);
  return BootstrapResponse.parse(await json(response));
}

async function command(
  cookies: CookieJar,
  gameId: string,
  expectedVersion: number,
  payload: Command,
): Promise<void> {
  const csrf = cookies.value("bp_csrf");
  if (csrf === undefined) throw new Error("Creation response did not set a CSRF cookie");
  const envelope = CommandEnvelope.parse({
    protocolVersion: 1,
    type: "game.command",
    requestId: nextRequestId(),
    gameId,
    commandId: nextCommandId(),
    expectedVersion,
    payload,
  });
  const response = await request(
    `/api/games/${gameId}/commands`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrf,
      },
      body: JSON.stringify(envelope),
    },
    cookies,
  );
  await json(response);
  if (response.status !== 202) throw new Error(`Expected command ACK, got ${response.status}`);
}

async function main(): Promise<void> {
  const cookies = new CookieJar();
  const configuration = {
    schemaVersion: "1.0.0",
    preset: "standard",
    restSpaceJackpot: false,
    doubleStartOnExactLanding: false,
    noAuctionAfterDeclinedAcquisition: false,
    noIncomeWhileDetained: false,
    bonusForMatchingOnes: false,
    startingAssetsDealt: false,
    relaxedEvenBuilding: false,
    unlimitedImprovementInventory: false,
  } as const;
  const createdResponse = await request(
    "/api/games",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        humanSeatCount,
        botSeatCount,
        hostName: "Smoke Host",
        hostToken: { colorIndex: 1, pieceId: "piece-lantern", pattern: "solid" },
        preset: "standard",
        configuration,
        acknowledged13Plus: true,
      }),
    },
    cookies,
  );
  const created = (await json(createdResponse)) as { gameId: string };
  if (createdResponse.status !== 201)
    throw new Error(`Expected game creation, got ${createdResponse.status}`);

  let current = await bootstrap(cookies, created.gameId);
  await command(cookies, created.gameId, current.aggregateVersion, { type: "StartGame" });

  const observedEvents = new Set<string>();
  const observedActions = new Set<string>();
  let accepted = 1;
  let tradeProposed = false;
  let tradeResolved = false;
  for (let step = 0; step < maxSteps; step += 1) {
    current = await bootstrap(cookies, created.gameId);
    for (const event of current.snapshot.publicEvents ?? []) observedEvents.add(event.type);
    if (current.snapshot.status !== "ACTIVE" || current.snapshot.phase === "Finished") break;
    const action = current.snapshot.legalActions[0];
    if (action === undefined) {
      throw new Error(
        `No legal action at step ${step}; status=${current.snapshot.status}, phase=${current.snapshot.phase}, activeSeat=${current.snapshot.activeSeatId}, viewerSeat=${current.snapshot.viewerSeatId}, events=${(current.snapshot.publicEvents ?? []).map((event) => event.type).join(",")}`,
      );
    }
    const selectedAction = chooseAction(current.snapshot.legalActions);
    observedActions.add(selectedAction.type);
    tradeProposed ||= selectedAction.type === "ProposeTrade";
    tradeResolved ||= ["AcceptTrade", "RejectTrade", "CancelTrade"].includes(selectedAction.type);
    const payload = payloadForLegalAction(selectedAction);
    await command(cookies, created.gameId, current.aggregateVersion, payload);
    accepted += 1;
  }

  current = await bootstrap(cookies, created.gameId);
  for (const event of current.snapshot.publicEvents ?? []) observedEvents.add(event.type);
  if (!observedEvents.has("BotDecisionExplained")) {
    throw new Error("BotDecisionExplained was not observed after the live command loop");
  }
  const tradeEventResolved = ["TradeAccepted", "TradeRejected", "TradeCancelled"].some((type) =>
    observedEvents.has(type),
  );
  if (!tradeProposed || (!tradeResolved && !tradeEventResolved)) {
    throw new Error(
      `The live command loop did not complete a trade cycle; actions=${[...observedActions].join(
        ",",
      )}`,
    );
  }
  if (requestIds.size !== accepted) throw new Error("Agent request IDs were not unique");

  console.log(
    JSON.stringify({
      ok: true,
      gameId: created.gameId,
      acceptedCommands: accepted,
      phase: current.snapshot.phase,
      aggregateVersion: current.aggregateVersion,
      botDecisionObserved: true,
      tradeCycleObserved: true,
    }),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Agent smoke test failed");
  process.exitCode = 1;
});
