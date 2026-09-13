import type { GameSnapshotProjection } from "@blockparty/contracts";
import {
  presentationStages,
  type ConfirmedPresentationUpdate,
  type PresentationStage,
} from "./turn-presentation-model";

export interface TurnPresentationState {
  readonly authoritativeSnapshot?: GameSnapshotProjection;
  readonly presentedSequence: number;
  readonly stage?: PresentationStage;
  readonly movementStep: number;
  readonly queueLength: number;
  readonly catchingUp: boolean;
}

export interface TurnPresentationController {
  acceptConfirmedUpdate(update: ConfirmedPresentationUpdate): void;
  skipCurrent(): void;
  skipToLive(): void;
  replayLastTurn(): void;
  setReducedMotion(reduced: boolean): void;
  subscribe(listener: (state: TurnPresentationState) => void): () => void;
  close(): void;
}

type Timer = ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>;

const MAX_QUEUED_STAGES = 96;

function initialState(): TurnPresentationState {
  return { presentedSequence: 0, movementStep: 0, queueLength: 0, catchingUp: false };
}

/** Client-only coordinator for confirmed display stages. It never changes game authority. */
export class TurnPresentationCoordinator implements TurnPresentationController {
  private state = initialState();
  private readonly listeners = new Set<(state: TurnPresentationState) => void>();
  private queue: PresentationStage[] = [];
  private active?: PresentationStage;
  private timer?: Timer;
  private reducedMotion = false;
  private closed = false;
  private lastAcceptedSequence = 0;
  private lastTurn: PresentationStage[] = [];
  private turnBuffer: PresentationStage[] = [];

  get currentState(): TurnPresentationState {
    return this.state;
  }

  subscribe(listener: (state: TurnPresentationState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  acceptConfirmedUpdate(update: ConfirmedPresentationUpdate): void {
    if (this.closed) return;
    const sequence = update.snapshot.sequence;
    if (this.state.authoritativeSnapshot !== undefined && sequence < this.lastAcceptedSequence)
      return;
    const firstUpdate = this.state.authoritativeSnapshot === undefined;
    this.state = { ...this.state, authoritativeSnapshot: update.snapshot };

    if (firstUpdate) {
      this.lastAcceptedSequence = sequence;
      this.state = { ...this.state, presentedSequence: sequence, catchingUp: false };
      this.emit();
      return;
    }

    if (sequence <= this.lastAcceptedSequence) {
      this.emit();
      return;
    }

    const stages = update.events === undefined ? undefined : presentationStages(update.events);
    this.lastAcceptedSequence = sequence;
    if (stages === undefined || stages.length === 0 || stages.at(-1)?.eventSequence !== sequence) {
      this.queue = [];
      this.active = undefined;
      this.clearTimer();
      this.state = {
        ...this.state,
        presentedSequence: sequence,
        movementStep: 0,
        queueLength: 0,
        catchingUp: false,
      };
      this.emit();
      return;
    }

    this.queue.push(...stages);
    if (this.queue.length > MAX_QUEUED_STAGES) {
      this.queue = [];
      this.active = undefined;
      this.clearTimer();
      this.state = {
        ...this.state,
        presentedSequence: sequence,
        movementStep: 0,
        queueLength: 0,
        catchingUp: false,
      };
      this.emit();
      return;
    }
    this.state = { ...this.state, queueLength: this.queue.length, catchingUp: true };
    this.emit();
    this.pump();
  }

  skipCurrent(): void {
    if (this.closed) return;
    if (this.active === undefined) return;
    this.finishActive();
  }

  skipToLive(): void {
    if (this.closed || this.state.authoritativeSnapshot === undefined) return;
    this.queue = [];
    this.active = undefined;
    this.clearTimer();
    const sequence = this.state.authoritativeSnapshot.sequence;
    this.lastAcceptedSequence = Math.max(this.lastAcceptedSequence, sequence);
    this.state = {
      ...this.state,
      presentedSequence: sequence,
      movementStep: 0,
      queueLength: 0,
      catchingUp: false,
    };
    this.emit();
  }

  replayLastTurn(): void {
    if (this.closed || this.lastTurn.length === 0 || this.active !== undefined) return;
    this.queue = this.lastTurn.map((stage) => ({ ...stage }));
    this.state = { ...this.state, queueLength: this.queue.length, catchingUp: true };
    this.emit();
    this.pump();
  }

  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
    if (reduced && this.active !== undefined) {
      this.state = {
        ...this.state,
        movementStep: Math.max(0, (this.active.movement?.path.length ?? 1) - 1),
      };
      this.emit();
    }
    this.pump();
  }

  close(): void {
    this.closed = true;
    this.queue = [];
    this.active = undefined;
    this.clearTimer();
    this.listeners.clear();
  }

  private pump(): void {
    if (this.closed || this.active !== undefined) return;
    const next = this.queue.shift();
    if (next === undefined) {
      if (this.state.catchingUp) {
        this.state = { ...this.state, queueLength: 0, catchingUp: false };
        this.emit();
      }
      return;
    }
    this.active = next;
    this.turnBuffer.push(next);
    this.state = {
      ...this.state,
      stage: next,
      movementStep: this.reducedMotion ? Math.max(0, (next.movement?.path.length ?? 1) - 1) : 0,
      queueLength: this.queue.length,
      catchingUp: true,
    };
    this.emit();
    if (this.reducedMotion || next.durationMs === 0) {
      this.finishActive();
      return;
    }
    if (next.movement?.interpolated === true && next.movement.path.length > 1) {
      const stepMs = Math.min(120, Math.max(90, next.durationMs / (next.movement.path.length - 1)));
      this.timer = setInterval(() => {
        if (this.closed || this.active === undefined) return;
        const finalStep = this.active.movement!.path.length - 1;
        const movementStep = Math.min(finalStep, this.state.movementStep + 1);
        this.state = { ...this.state, movementStep };
        this.emit();
        if (movementStep >= finalStep) this.finishActive();
      }, stepMs);
      return;
    }
    this.timer = setTimeout(() => this.finishActive(), next.durationMs);
  }

  private finishActive(): void {
    if (this.active === undefined) return;
    const completed = this.active;
    this.clearTimer();
    this.active = undefined;
    if (completed.eventType === "TurnEnded" && this.turnBuffer.length > 0) {
      this.lastTurn = this.turnBuffer;
      this.turnBuffer = [];
    }
    this.state = {
      ...this.state,
      presentedSequence: Math.max(this.state.presentedSequence, completed.eventSequence),
      stage: undefined,
      movementStep: 0,
      queueLength: this.queue.length,
      catchingUp: true,
    };
    this.emit();
    this.pump();
  }

  private clearTimer(): void {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.state);
  }
}
