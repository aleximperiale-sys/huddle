import { createElement } from "lwc";
import HuddleOpportunityStrategyBadge from "c/huddleOpportunityStrategyBadge";
import getOpportunitySummary from "@salesforce/apex/Huddle_ChangeLogConsoleController.getOpportunitySummary";
import getChangesForOpportunity from "@salesforce/apex/Huddle_ChangeLogConsoleController.getChangesForOpportunity";

jest.mock(
  "@salesforce/apex/Huddle_ChangeLogConsoleController.getOpportunitySummary",
  () => {
    const { createApexTestWireAdapter } = require("@salesforce/sfdx-lwc-jest");
    return { default: createApexTestWireAdapter(jest.fn()) };
  },
  { virtual: true }
);

jest.mock(
  "@salesforce/apex/Huddle_ChangeLogConsoleController.getChangesForOpportunity",
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
  strategySessions: 2,
  actionItems: 4,
  openDecisions: 1,
  lastSessionDate: "2026-07-12T14:30:00.000Z",
  lastStrategyLogId: "a0000000000000AAA"
};

const CHANGES = [
  {
    id: "c1",
    changeType: "Decision Raised",
    relatedRecordName: "DEC-00001",
    assignedToName: null,
    createdDate: "2026-07-12T14:30:00.000Z",
    sourceStrategyLogId: "a0000000000000AAA"
  },
  {
    id: "c2",
    changeType: "Decision Raised",
    relatedRecordName: "DEC-00002",
    assignedToName: null,
    createdDate: "2026-07-11T14:30:00.000Z",
    sourceStrategyLogId: "a0000000000000AAA"
  },
  {
    id: "c3",
    changeType: "Task Created",
    relatedRecordName: "Send the revised quote",
    assignedToName: "Priya Raman",
    createdDate: "2026-07-11T14:30:00.000Z",
    sourceStrategyLogId: "a0000000000000AAA"
  }
];

function flush() {
  return Promise.resolve().then(() => Promise.resolve());
}

describe("c-huddle-opportunity-strategy-badge", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
  });

  function build() {
    const element = createElement("c-huddle-opportunity-strategy-badge", {
      is: HuddleOpportunityStrategyBadge
    });
    element.recordId = "0060000000000AAA";
    document.body.appendChild(element);
    return element;
  }

  it("states internal-only in a pill and in a sentence", () => {
    const element = build();
    const pill = element.shadowRoot.querySelector("c-huddle-status-badge");
    expect(pill.label).toBe("Internal only");
    expect(
      element.shadowRoot.querySelector(".internal-note").textContent
    ).toContain("never surfaced to the customer");
  });

  it("shows placeholders until both wires have reported", async () => {
    const element = build();
    getOpportunitySummary.emit(SUMMARY);
    await flush();

    // Summary is in, the change list is not: still loading.
    expect(
      element.shadowRoot.querySelector("c-huddle-skeleton-loader")
    ).not.toBeNull();

    getChangesForOpportunity.emit(CHANGES);
    await flush();

    expect(
      element.shadowRoot.querySelector("c-huddle-skeleton-loader")
    ).toBeNull();
    expect(
      element.shadowRoot.querySelector(".headline__figure")
    ).not.toBeNull();
  });

  it("makes what is unresolved the loudest figure on the card", async () => {
    const element = build();
    getOpportunitySummary.emit(SUMMARY);
    getChangesForOpportunity.emit(CHANGES);
    await flush();

    expect(
      element.shadowRoot.querySelector(".headline__figure").textContent
    ).toBe("1");
    expect(element.shadowRoot.querySelector(".headline").className).toContain(
      "headline_open"
    );
    expect(
      element.shadowRoot.querySelector(".headline__label").textContent
    ).toBe("1 decision still unresolved on this deal");
  });

  it("plots open decisions against every decision the deal raised", async () => {
    const element = build();
    getOpportunitySummary.emit(SUMMARY);
    getChangesForOpportunity.emit(CHANGES);
    await flush();

    // 2 raised, 1 still open, so 50% resolved.
    expect(
      element.shadowRoot.querySelector("lightning-progress-bar").value
    ).toBe(50);
    expect(element.shadowRoot.querySelector(".meter__label").textContent).toBe(
      "1 of 2 decisions resolved"
    );
  });

  it("switches to the cleared treatment when nothing is unresolved", async () => {
    const element = build();
    getOpportunitySummary.emit({ ...SUMMARY, openDecisions: 0 });
    getChangesForOpportunity.emit(CHANGES);
    await flush();

    const headlineClass =
      element.shadowRoot.querySelector(".headline").className;
    expect(headlineClass).toContain("headline_clear");
    const badges = Array.from(
      element.shadowRoot.querySelectorAll("c-huddle-status-badge")
    );
    expect(badges.some((b) => b.label === "Nothing unresolved")).toBe(true);
  });

  it("offers an empty state, not a blank card, on an untouched deal", async () => {
    const element = build();
    getOpportunitySummary.emit({
      strategySessions: 0,
      actionItems: 0,
      openDecisions: 0
    });
    getChangesForOpportunity.emit([]);
    await flush();

    const empty = element.shadowRoot.querySelector("c-huddle-empty-state");
    expect(empty.heading).toBe("No strategy session logged on this deal yet");
  });

  it("expands the audit trail on request and labels the count", async () => {
    const element = build();
    getOpportunitySummary.emit(SUMMARY);
    getChangesForOpportunity.emit(CHANGES);
    await flush();

    const toggle = Array.from(
      element.shadowRoot.querySelectorAll("lightning-button")
    ).find((b) => b.label === "Show the audit trail (3)");
    expect(toggle).toBeDefined();

    toggle.click();
    await flush();

    expect(element.shadowRoot.querySelectorAll(".history__item").length).toBe(
      3
    );
  });

  it("turns an Apex failure into a sentence and keeps the raw text", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    const element = build();
    getOpportunitySummary.error({ message: "INSUFFICIENT_ACCESS" });
    getChangesForOpportunity.emit([]);
    await flush();

    const error = element.shadowRoot.querySelector("c-huddle-error-state");
    expect(error.message).toContain(
      "could not load this deal's strategy history"
    );
    expect(error.detail).toBe("INSUFFICIENT_ACCESS");
  });
});
