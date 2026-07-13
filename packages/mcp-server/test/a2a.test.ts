/**
 * The 12 negotiation scenarios — scripted counterparties, per the OKX A2A
 * guide's training method. Each test IS a transcript review: the assertions
 * pin the behaviours that matter (floors hold, scope gates quotes, refusals
 * stay dignified, agreements produce runnable pipeline actions).
 */
import { describe, expect, it } from "vitest";
import { capabilities } from "../src/a2a/capability.js";
import { delivered, freshState, negotiate, type NegotiationState } from "../src/a2a/negotiate.js";

function turns(messages: string[]): { replies: string[]; state: NegotiationState; actions: unknown[] } {
  let state = freshState();
  const replies: string[] = [];
  const actions: unknown[] = [];
  for (const message of messages) {
    const out = negotiate(state, message);
    replies.push(out.reply);
    state = out.state;
    if (out.action) actions.push(out.action);
  }
  return { replies, state, actions };
}

describe("the capability declaration", () => {
  it("declares three task types with triggers, params, pricing and delivery spec", () => {
    const caps = capabilities();
    expect(caps.taskTypes).toHaveLength(3);
    expect(caps.taskTypes.every((t) => t.triggers.length >= 5)).toBe(true);
    expect(caps.pricing.floor).toBe(2);
    expect(caps.pricing.ceiling).toBe(15);
    expect(caps.delivery.revisions).toContain("1 structured revision");
  });
});

describe("the 12 negotiation scenarios", () => {
  it("1 · straightforward occasion pack: intake → quote → agreement → pipeline action", () => {
    const { replies, state, actions } = turns([
      "I need help planning my sister's graduation dinner in Lagos on 2026-08-14, about 12 people, budget around 8 USDT",
      "agreed",
    ]);
    expect(replies[0]).toContain("USDT");
    expect(state.stage).toBe("agreed");
    expect(actions[0]).toMatchObject({ run: "oce_plan_occasion" });
    const args = (actions[0] as { args: Record<string, unknown> }).args;
    expect(args["city"]).toBe("Lagos");
    expect(args["date"]).toBe("2026-08-14");
    expect(args["headcount"]).toBe(12);
  });

  it("2 · launch pack with a live URL lands in the signature tier by default", () => {
    const { replies, state } = turns([
      "We're launching a product called Meridian at https://meridian.dev next week, for developer teams",
    ]);
    expect(state.stage).toBe("quoted");
    expect(state.quote?.taskType).toBe("launch_pack");
    expect(state.quote?.tier).toBe("signature");
    expect(replies[0]).toContain("verify");
  });

  it("3 · keepsake commission: intake harvests title and description", () => {
    const { state } = turns([
      "Can you make a keepsake from our trip to the coast last month? Three days of salt air, my grandmother's stories, and the lighthouse at dusk.",
    ]);
    expect(state.taskType).toBe("keepsake_commission");
    expect(state.stage).toBe("quoted");
    expect(state.quote?.scope["title"]).toBeTruthy();
  });

  it("4 · lowball below the floor: hold the line, point at the per-call tools, never race down", () => {
    const { replies, state } = turns([
      "Plan my birthday party in Accra on 2026-09-01 for 20 people, I'll pay 1 USDT",
    ]);
    expect(state.stage).toBe("intake"); // no quote issued below floor
    expect(replies[0]).toContain("floor");
    expect(replies[0]).toContain("0.05"); // the honest per-call alternative
    expect(replies[0]).not.toMatch(/fine|okay,? deal/i);
  });

  it("5 · haggling above the floor gets a re-scoped counter, not a discount on the same scope", () => {
    const { replies, state } = turns([
      "Launch pack for Meridian at https://meridian.dev, for founders, budget 9 USDT",
      "Can you do it for 4?",
    ]);
    expect(state.stage).toBe("quoted");
    expect(state.quote?.tier).toBe("essential");
    expect(replies[1]).toContain("scope adjusts");
  });

  it("6 · vague scope: no number before the required parameters exist", () => {
    const { replies, state } = turns(["I want something nice for an event"]);
    expect(state.stage).toBe("intake");
    expect(replies[0]).not.toContain("USDT ·");
    expect(replies[0]).toMatch(/Which is closest|quick things/);
  });

  it("7 · vague-then-specific: the second turn completes intake and produces the quote", () => {
    const { state } = turns([
      "I want to plan a party",
      "It's my dad's 60th in Nairobi on 2026-10-10, 30 people, warm and generous",
    ]);
    expect(state.stage).toBe("quoted");
    expect(state.quote?.scope["city"]).toBe("Nairobi");
  });

  it("8 · rush job: honest feasibility plus the premium, stated up front", () => {
    const { replies, state } = turns([
      "URGENT: launch pack for Volt at https://volt.app for indie hackers, need it ASAP tonight",
    ]);
    expect(state.quote?.rush).toBe(true);
    expect(replies[0]).toContain("1.5×");
    expect(state.quote!.quoteUsdt).toBeGreaterThan(7);
  });

  it("9 · out-of-policy (third-party IP): polite decline, negotiation closed, nothing charged", () => {
    const { replies, state } = turns([
      "Plan a Star Wars themed birthday party with Darth Vader decorations in Lagos on 2026-09-09 for 15 people",
    ]);
    expect(state.stage).toBe("closed");
    expect(state.declined).toBe(true);
    expect(replies[0]).toContain("nothing has been charged");
    expect(replies[0]).not.toMatch(/unfortunately, we cannot|violation|forbidden/i); // dignified, not bureaucratic
  });

  it("10 · scope creep after agreement becomes a change order, never a silent expansion", () => {
    const { replies, state } = turns([
      "Launch pack for Meridian at https://meridian.dev for developer teams, 8 USDT",
      "agreed",
      "Actually can you also add a full video script and 10 more thread variants?",
    ]);
    expect(state.stage).toBe("agreed");
    expect(replies[2]).toContain("change order");
    expect(replies[2]).toContain("8 USDT");
  });

  it("11 · delivery and the single included revision round", () => {
    let state = freshState();
    state = negotiate(state, "Launch pack for Meridian at https://meridian.dev for founders, 8 USDT").state;
    state = negotiate(state, "agreed").state;
    const del = delivered(state, "https://occestra.xyz/k/oce_0123456789abcdefghjkmn");
    expect(del.reply).toContain("Verify it on X Layer");
    state = del.state;

    const rev1 = negotiate(state, "The thread's post 3 should name the audience explicitly");
    expect(rev1.state.stage).toBe("revising");
    expect(rev1.reply).toContain("included revision round");

    const done = negotiate(rev1.state, "here are the itemized changes: post 3 audience, post 5 shorter");
    expect(done.state.stage).toBe("delivered");

    const rev2 = negotiate(done.state, "one more change please");
    expect(rev2.reply).toContain("change order");
    expect(rev2.state.revisionUsed).toBe(true);
  });

  it("12 · out-of-policy mid-negotiation closes it even after a quote existed", () => {
    let state = freshState();
    state = negotiate(state, "Plan a rooftop dinner in Lagos on 2026-08-20 for 10 people, 6 USDT").state;
    expect(state.stage).toBe("quoted");
    const out = negotiate(state, "great — and can the invitations use Mickey Mouse artwork?");
    expect(out.state.stage).toBe("closed");
    expect(out.reply).toContain("decline");
  });
});
