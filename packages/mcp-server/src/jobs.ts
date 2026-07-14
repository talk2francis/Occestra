/**
 * The job queue.
 *
 * WHY THIS EXISTS. A launch kit is a browser render, a brand genome, four image generations,
 * seven pieces of copy, and a Tribunal pass over every one of them. That is minutes, not
 * seconds. Answering it synchronously means holding an HTTP connection open across all of it
 * — and the marketplace client on the other end has a timeout. When it fires, the client does
 * the only thing it can: it retries. So the buyer is charged twice for a pack that was already
 * being built, and the first copy is finished into a socket nobody is listening to.
 *
 * That is not a latency problem, it is a MONEY problem, and it is the single biggest
 * reliability risk in an ASP that sells minutes-long work over a request/response protocol.
 *
 * So: accept, charge once, hand back a job id, and let the buyer poll. The state lives in
 * SQLite, not in a promise — which means it survives the process. If we are restarted
 * mid-launch-kit, the job is still there when we come back, and it is finished, because the
 * buyer already paid for it and a crash of ours is not a reason for them to lose their money.
 *
 * Cancellation is a REQUEST, not a kill. The worker checks between stages, because tearing a
 * pipeline down mid-render leaves half-written bytes on disk.
 */
import type { Pack } from "@occestra/studio-core";
import { buildGrader } from "./grader.js";
import { instrumentDeps, studioOf, type DemoEvent } from "./demo.js";
import { PolicyRefusal, isPackTool, runPipeline, type PipelineContext } from "./pipelines.js";
import type { JobRow, Store } from "./store.js";

/** Thrown into a running pipeline at its next port call once a cancel has been asked for. */
export class JobCancelled extends Error {
  override readonly name = "JobCancelled";
}

export interface JobQueueConfig {
  ctx: PipelineContext & { store: Store; packForClient: (pack: Pack) => unknown };
  /**
   * How many packs may be in flight at once.
   *
   * Not a throughput dial — a COST dial. Every concurrent job is a fistful of simultaneous
   * provider calls against one shared daily USD cap, and the governor cannot slow down what
   * it has already let start. Two is the default because it is the number that keeps a queue
   * moving without letting a burst of buyers spend a day's budget in ninety seconds.
   */
  concurrency?: number;
  pollMs?: number;
  linkChecker?: (url: string) => Promise<boolean>;
}

export class JobQueue {
  private readonly store: Store;
  private readonly concurrency: number;
  private readonly pollMs: number;
  private running = 0;
  private timer?: NodeJS.Timeout;
  /** Resolved when the queue next goes idle — the whole of the test harness's patience. */
  private idle?: () => void;

  constructor(private readonly config: JobQueueConfig) {
    this.store = config.ctx.store;
    this.concurrency = Math.max(1, config.concurrency ?? 2);
    this.pollMs = config.pollMs ?? 400;
  }

  /**
   * Come back from the dead.
   *
   * Anything that was 'running' when we stopped is, by definition, unfinished — the promise
   * that was driving it died with the process, and nothing is coming back for it. It was paid
   * for, so it goes back in the queue. Re-running costs US the provider spend a second time,
   * which is exactly the right party to bill for our own crash.
   */
  start(): { requeued: string[]; abandoned: string[] } {
    const recovered = this.store.recoverJobs();

    for (const id of recovered.abandoned) {
      const job = this.store.getJob(id);
      if (job) this.bookRefund(job, "the run failed twice and was abandoned");
    }

    this.timer = setInterval(() => this.pump(), this.pollMs);
    this.timer.unref?.();
    this.pump();

    return recovered;
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Start work NOW rather than on the next tick. The buyer is holding the other end. */
  kick(): void {
    this.pump();
  }

  /** Resolves once nothing is queued and nothing is running. Used by tests, not by the app. */
  async drain(): Promise<void> {
    for (;;) {
      const health = this.store.jobQueueHealth();
      if (health.queued === 0 && this.running === 0) return;
      this.pump();
      await new Promise<void>((resolve) => {
        this.idle = resolve;
        setTimeout(resolve, this.pollMs).unref?.();
      });
    }
  }

  private pump(): void {
    while (this.running < this.concurrency) {
      const job = this.store.claimJob();
      if (!job) return;

      this.running += 1;
      void this.execute(job).finally(() => {
        this.running -= 1;
        this.idle?.();
      });
    }
  }

  private async execute(job: JobRow): Promise<void> {
    if (!isPackTool(job.tool)) {
      this.store.failJob(job.id, `unknown tool: ${job.tool}`);
      this.bookRefund(job, `unknown tool: ${job.tool}`);
      return;
    }

    const emit = (event: DemoEvent | { type: string; [key: string]: unknown }): void => {
      this.store.appendJobProgress(job.id, event);

      // The only place a cancel can land. The pipelines are opaque — they do not take an
      // AbortSignal — but every one of them talks to the world through instrumented ports,
      // and this fires on each call. So a cancel is honoured at the next provider call,
      // never in the middle of one.
      if (this.store.isCancelling(job.id)) throw new JobCancelled();
    };

    const instrumented = instrumentDeps(this.config.ctx.deps, emit as (event: DemoEvent) => void);
    const runCtx: PipelineContext = {
      ...this.config.ctx,
      deps: instrumented,
      grader: buildGrader({
        deps: instrumented,
        ...(this.config.linkChecker ? { linkChecker: this.config.linkChecker } : {}),
        onEvent: emit as (event: DemoEvent) => void,
      }),
    };

    emit({ type: "run_started", tool: job.tool, studio: studioOf(job.tool) });

    try {
      const pack = await runPipeline(runCtx, job.tool, job.args);
      emit({ type: "run_complete", pack: { id: pack.id } });
      this.store.finishJob(job.id, pack.id);
    } catch (error) {
      if (error instanceof JobCancelled) {
        this.store.markCancelled(job.id);
        // Deliberately NOT refunded. A running job has already spent real money at real
        // providers on the buyer's behalf; asking to stop it does not un-spend that. The
        // tool description says so in as many words, before they call it.
        return;
      }

      const message =
        error instanceof PolicyRefusal
          ? error.politeMessage
          : "the run failed. Nothing was delivered, so the payment is booked as owed back to you.";

      this.store.failJob(job.id, message);
      this.bookRefund(job, error instanceof PolicyRefusal ? "refused after payment" : "the run failed");
      this.config.ctx.deps.log?.("job failed", error);
    }
  }

  /** Money in, nothing out. It gets written down where everyone can see it. */
  private bookRefund(job: JobRow, reason: string): void {
    if (!job.orderId || job.priceUsdt <= 0) return;

    this.store.oweRefund({
      orderId: job.orderId,
      payerRef: job.payerRef,
      amountUsdt: job.priceUsdt,
      tool: job.tool,
      reason,
    });
  }
}
