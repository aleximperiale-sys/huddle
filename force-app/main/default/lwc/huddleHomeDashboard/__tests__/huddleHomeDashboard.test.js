import { createElement } from "lwc";
import HuddleHomeDashboard from "c/huddleHomeDashboard";
import getSummary from "@salesforce/apex/Huddle_HomeDashboardController.getSummary";

jest.mock(
  "@salesforce/apex/Huddle_HomeDashboardController.getSummary",
  () => {
    const { createApexTestWireAdapter } = require("@salesforce/sfdx-lwc-jest");
    return { default: createApexTestWireAdapter(jest.fn()) };
  },
  { virtual: true }
);

jest.mock(
  "@salesforce/apex",
  () => ({ refreshApex: jest.fn(() => Promise.resolve()) }),
  { virtual: true }
);

const SUMMARY = {
  sessionsThisWeek: 3,
  sessionsAllTime: 27,
  actionItemsCreated: 20,
  actionItemsCompleted: 5,
  actionItemsOwnerUnclear: 2,
  openDecisions: 4,
  decisionsResolved: 6,
  agingDecisionCount: 2,
  agingDecisions: [
    {
      id: "a0100000000000AAA",
      name: "DEC-00001",
      question: "Whether to hold the discount",
      opportunityName: "Northwind Expansion",
      daysOpen: 21,
      neededBy: "2020-01-01"
    },
    {
      id: "a0100000000000BBB",
      name: "DEC-00002",
      question: "Who owns the security questionnaire",
      opportunityName: "Acme Renewal",
      daysOpen: 9,
      neededBy: null
    }
  ],
  topContributors: [{ label: "Dan Ortiz", count: 4 }],
  byType: [
    { label: "Task Created", count: 6 },
    { label: "Strategy Logged", count: 3 }
  ],
  trend: [
    { label: "1 Jul", count: 0 },
    { label: "2 Jul", count: 1 },
    { label: "3 Jul", count: 2 },
    { label: "4 Jul", count: 1 },
    { label: "5 Jul", count: 4 },
    { label: "6 Jul", count: 2 },
    { label: "7 Jul", count: 3 }
  ]
};

function flush() {
  return Promise.resolve().then(() => Promise.resolve());
}

describe("c-huddle-home-dashboard", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
  });

  function build() {
    const element = createElement("c-huddle-home-dashboard", {
      is: HuddleHomeDashboard
    });
    document.body.appendChild(element);
    return element;
  }

  it("shows placeholders, not an empty page, before any data arrives", () => {
    const element = build();
    const skeletons = element.shadowRoot.querySelectorAll(
      "c-huddle-skeleton-loader"
    );
    expect(skeletons.length).toBeGreaterThan(0);
    expect(element.shadowRoot.querySelector(".agenda__row")).toBeNull();
  });

  it("makes the aging-decision agenda the first thing on the sheet", async () => {
    const element = build();
    getSummary.emit(SUMMARY);
    await flush();

    const regions = element.shadowRoot.querySelectorAll("section.region");
    expect(regions[0].className).toContain("region_hero");

    const rows = element.shadowRoot.querySelectorAll(".agenda__row");
    expect(rows.length).toBe(2);
    // Longest open first, without being asked.
    expect(
      element.shadowRoot.querySelectorAll(".agenda__age-value")[0].textContent
    ).toBe("21");
  });

  it("marks a decision past a fortnight as critical, in class and in words", async () => {
    const element = build();
    getSummary.emit(SUMMARY);
    await flush();

    const rows = element.shadowRoot.querySelectorAll(".agenda__row");
    expect(rows[0].className).toContain("agenda__row_critical");
    expect(rows[1].className).not.toContain("agenda__row_critical");

    const pills = element.shadowRoot.querySelectorAll(
      ".agenda__urgency c-huddle-status-badge"
    );
    expect(pills[0].label).toBe("Overdue for a decision");
    expect(pills[0].tone).toBe("critical");
    expect(pills[1].label).toBe("Aging");
  });

  it("filters the agenda by search term without a round trip", async () => {
    const element = build();
    getSummary.emit(SUMMARY);
    await flush();

    const search = element.shadowRoot.querySelector(".agenda__search");
    search.value = "acme";
    search.dispatchEvent(new CustomEvent("change"));
    await flush();

    const rows = element.shadowRoot.querySelectorAll(".agenda__row");
    expect(rows.length).toBe(1);
    expect(
      element.shadowRoot.querySelector(".agenda__question").textContent
    ).toBe("Who owns the security questionnaire");
  });

  it("offers a way out when the filters match nothing", async () => {
    const element = build();
    getSummary.emit(SUMMARY);
    await flush();

    const search = element.shadowRoot.querySelector(".agenda__search");
    search.value = "zzzz-no-match";
    search.dispatchEvent(new CustomEvent("change"));
    await flush();

    const empty = element.shadowRoot.querySelector("c-huddle-empty-state");
    expect(empty).not.toBeNull();
    expect(empty.actionLabel).toBe("Clear filters");

    empty.dispatchEvent(new CustomEvent("action"));
    await flush();

    expect(element.shadowRoot.querySelectorAll(".agenda__row").length).toBe(2);
  });

  it("celebrates a genuinely clear agenda instead of showing a blank region", async () => {
    const element = build();
    getSummary.emit({ ...SUMMARY, agingDecisions: [], agingDecisionCount: 0 });
    await flush();

    const empty = element.shadowRoot.querySelector("c-huddle-empty-state");
    expect(empty.heading).toContain("Nothing has been left hanging");
  });

  it("computes the KPI percentages and tones off the summary", async () => {
    const element = build();
    getSummary.emit(SUMMARY);
    await flush();

    const cards = Array.from(
      element.shadowRoot.querySelectorAll("c-huddle-kpi-card")
    );
    const decisions = cards.find(
      (c) => c.label === "decisions still unresolved"
    );
    expect(decisions.value).toBe(4);
    expect(decisions.tone).toBe("critical");
    expect(decisions.progress).toBe(60); // 6 resolved of 10 raised
    expect(decisions.statusLabel).toBe("2 aging past a week");

    const completed = cards.find((c) => c.label === "action items completed");
    expect(completed.progress).toBe(25); // 5 of 20

    const unclear = cards.find(
      (c) => c.label === "action items with an unclear owner"
    );
    expect(unclear.tone).toBe("critical");
    expect(unclear.statusLabel).toBe("Needs reassignment");
  });

  it("reads the activity trend from comparable three-day windows", async () => {
    const element = build();
    getSummary.emit(SUMMARY);
    await flush();

    const actions = Array.from(
      element.shadowRoot.querySelectorAll("c-huddle-kpi-card")
    ).find((c) => c.label === "audited actions, last 7 days");

    expect(actions.value).toBe(13);
    // last three days 4+2+3=9 against the three before 1+2+1=4
    expect(actions.trendLabel).toBe("+5 vs the 3 days before");
    expect(actions.trendDirection).toBe("up");
    expect(actions.trendMeaning).toBe("positive");
  });

  it("expands a row into its detail block and collapses it again", async () => {
    const element = build();
    getSummary.emit(SUMMARY);
    await flush();

    const toggle = element.shadowRoot.querySelector(".agenda__toggle");
    toggle.click();
    await flush();
    expect(element.shadowRoot.querySelector(".agenda__detail")).not.toBeNull();

    element.shadowRoot.querySelector(".agenda__toggle").click();
    await flush();
    expect(element.shadowRoot.querySelector(".agenda__detail")).toBeNull();
  });

  it("replaces the sheet with a retryable error when nothing loaded", async () => {
    // The raw text is logged for developers, so the console noise is expected.
    jest.spyOn(console, "error").mockImplementation(() => {});
    const element = build();
    getSummary.error({ message: "INSUFFICIENT_ACCESS" }, 400);
    await flush();

    const error = element.shadowRoot.querySelector("c-huddle-error-state");
    expect(error).not.toBeNull();
    expect(error.message).toContain("could not load the briefing");
    // The raw Apex text survives for whoever has to debug it.
    expect(error.detail).toBe("INSUFFICIENT_ACCESS");
    expect(element.shadowRoot.querySelector(".agenda__row")).toBeNull();
  });

  it("keeps the figures and warns inline when a refresh fails on top of good data", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    const element = build();
    getSummary.emit(SUMMARY);
    await flush();

    getSummary.error({ message: "boom" });
    await flush();

    const inline = element.shadowRoot.querySelector("c-huddle-error-state");
    expect(inline.variant).toBe("inline");
    expect(element.shadowRoot.querySelectorAll(".agenda__row").length).toBe(2);
  });

  it("swaps the refresh label to contextual text and disables the button", async () => {
    const element = build();
    getSummary.emit(SUMMARY);
    await flush();

    const buttons = Array.from(
      element.shadowRoot.querySelectorAll("lightning-button")
    );
    const refresh = buttons.find((b) => b.label === "Refresh");
    expect(refresh.disabled).toBe(false);

    refresh.click();
    await Promise.resolve();

    const busy = Array.from(
      element.shadowRoot.querySelectorAll("lightning-button")
    ).find((b) => b.label === "Refreshing data…");
    expect(busy).not.toBeNull();
    expect(busy.disabled).toBe(true);
  });

  it("keeps a table twin of every plotted value", async () => {
    const element = build();
    getSummary.emit(SUMMARY);
    await flush();

    // The table section is collapsed by default; opening it is one toggle.
    const headers = Array.from(
      element.shadowRoot.querySelectorAll("c-huddle-section-header")
    );
    const tableHeader = headers.find(
      (h) => h.heading === "Every figure as a table"
    );
    tableHeader.dispatchEvent(
      new CustomEvent("toggle", { detail: { collapsed: false } })
    );
    await flush();

    const rows = element.shadowRoot.querySelectorAll(".table-view tbody tr");
    // 2 change types + 1 contributor + 7 days
    expect(rows.length).toBe(10);
  });
});
