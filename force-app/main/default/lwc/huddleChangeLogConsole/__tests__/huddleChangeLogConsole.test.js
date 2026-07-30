import { createElement } from "lwc";
import HuddleChangeLogConsole from "c/huddleChangeLogConsole";
import getChanges from "@salesforce/apex/Huddle_ChangeLogConsoleController.getChanges";
import getFilterOptions from "@salesforce/apex/Huddle_ChangeLogConsoleController.getFilterOptions";

jest.mock(
  "@salesforce/apex/Huddle_ChangeLogConsoleController.getChanges",
  () => ({ default: jest.fn() }),
  { virtual: true }
);

jest.mock(
  "@salesforce/apex/Huddle_ChangeLogConsoleController.getFilterOptions",
  () => {
    const { createApexTestWireAdapter } = require("@salesforce/sfdx-lwc-jest");
    return { default: createApexTestWireAdapter(jest.fn()) };
  },
  { virtual: true }
);

function row(overrides = {}) {
  return {
    id: "a0200000000000AAA",
    name: "CHG-00001",
    changeType: "Task Created",
    objectApiName: "Task",
    relatedRecordId: "00T00000000000AAA",
    relatedRecordName: "Send the revised quote",
    detail: "Assigned from the 12 July deal review.",
    assignedToName: "Priya Raman",
    repName: "Dan Ortiz",
    opportunityId: "0060000000000AAA",
    opportunityName: "Northwind Expansion",
    sourceStrategyLogId: "a0000000000000AAA",
    sourceStrategyLogName: "STR-00001",
    repConfirmed: true,
    createdDate: "2026-07-12T14:30:00.000Z",
    ...overrides
  };
}

const ROWS = [
  row(),
  row({
    id: "a0200000000000BBB",
    name: "CHG-00002",
    changeType: "Strategy Logged",
    relatedRecordName: "STR-00002",
    assignedToName: null,
    repConfirmed: false,
    opportunityName: "Acme Renewal",
    createdDate: "2026-07-11T09:00:00.000Z"
  }),
  row({
    id: "a0200000000000CCC",
    name: "CHG-00003",
    changeType: "Decision Raised",
    relatedRecordName: "DEC-00007",
    assignedToName: null,
    repConfirmed: false,
    createdDate: "2026-07-10T09:00:00.000Z"
  })
];

function flush() {
  return Promise.resolve()
    .then(() => Promise.resolve())
    .then(() => Promise.resolve());
}

describe("c-huddle-change-log-console", () => {
  beforeEach(() => {
    getChanges.mockResolvedValue(ROWS);
  });

  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
  });

  function build() {
    const element = createElement("c-huddle-change-log-console", {
      is: HuddleChangeLogConsole
    });
    document.body.appendChild(element);
    return element;
  }

  it("shows skeleton rows before the log arrives", () => {
    const element = build();
    expect(
      element.shadowRoot.querySelector("c-huddle-skeleton-loader")
    ).not.toBeNull();
    expect(element.shadowRoot.querySelector(".entry")).toBeNull();
  });

  it("renders the timeline newest first with assignment as a chip", async () => {
    const element = build();
    await flush();

    const entries = element.shadowRoot.querySelectorAll(".entry");
    expect(entries.length).toBe(3);
    expect(
      element.shadowRoot.querySelectorAll(".entry__type")[0].textContent
    ).toBe("Task Created");

    const chips = entries[0].querySelectorAll("c-huddle-status-badge");
    expect(chips[0].label).toBe("Priya Raman");
    expect(chips[1].label).toBe("Confirmed by rep");
    expect(chips[1].tone).toBe("success");
  });

  it("says so in words when no confirmation was needed", async () => {
    const element = build();
    await flush();

    const secondRowChips = element.shadowRoot
      .querySelectorAll(".entry")[1]
      .querySelectorAll("c-huddle-status-badge");
    expect(secondRowChips[0].label).toBe("No confirmation needed");
    expect(secondRowChips[0].tone).toBe("neutral");
  });

  it("summarises the filtered slice, not the whole object", async () => {
    const element = build();
    await flush();

    const values = Array.from(
      element.shadowRoot.querySelectorAll(".strip__value")
    ).map((n) => n.textContent);
    // total, strategies, tasks, decisions, distinct assignees
    expect(values).toEqual(["3", "1", "1", "1", "1"]);
  });

  it("searches what is already loaded without another Apex call", async () => {
    const element = build();
    await flush();
    expect(getChanges).toHaveBeenCalledTimes(1);

    const search = element.shadowRoot.querySelector(".log__search");
    search.value = "acme";
    search.dispatchEvent(new CustomEvent("change"));
    await flush();

    expect(getChanges).toHaveBeenCalledTimes(1);
    expect(element.shadowRoot.querySelectorAll(".entry").length).toBe(1);
  });

  it("re-queries the server when a scope filter changes", async () => {
    const element = build();
    await flush();

    element.shadowRoot
      .querySelectorAll("lightning-combobox")[0]
      .dispatchEvent(
        new CustomEvent("change", { detail: { value: "0060000000000AAA" } })
      );
    await flush();

    expect(getChanges).toHaveBeenCalledTimes(2);
    expect(getChanges.mock.calls[1][0].opportunityId).toBe("0060000000000AAA");
  });

  it("sorts the timeline from the sort control", async () => {
    const element = build();
    await flush();

    const sort = element.shadowRoot.querySelector(".log__select");
    sort.dispatchEvent(
      new CustomEvent("change", { detail: { value: "oldest" } })
    );
    await flush();

    expect(
      element.shadowRoot.querySelectorAll(".entry__type")[0].textContent
    ).toBe("Decision Raised");
  });

  it("hands the table view to lightning-datatable with a live sort state", async () => {
    const element = build();
    await flush();

    const viewToggle = element.shadowRoot.querySelector(
      "lightning-radio-group"
    );
    expect(viewToggle.value).toBe("timeline");
    viewToggle.dispatchEvent(
      new CustomEvent("change", { detail: { value: "table" } })
    );
    await flush();

    const table = element.shadowRoot.querySelector("lightning-datatable");
    expect(table).not.toBeNull();
    expect(table.data.length).toBe(3);
    expect(table.sortedBy).toBe("createdDate");
    expect(table.sortedDirection).toBe("desc");

    table.dispatchEvent(
      new CustomEvent("sort", {
        detail: { fieldName: "changeType", sortDirection: "asc" }
      })
    );
    await flush();
    expect(
      element.shadowRoot.querySelector("lightning-datatable").sortedBy
    ).toBe("changeType");
  });

  it("paginates rather than rendering an unbounded list", async () => {
    const many = [];
    for (let i = 0; i < 60; i++) {
      many.push(row({ id: `a02000000000${i}`, name: `CHG-${i}` }));
    }
    getChanges.mockResolvedValue(many);

    const element = build();
    await flush();

    expect(element.shadowRoot.querySelectorAll(".entry").length).toBe(25);
    expect(element.shadowRoot.querySelector(".pager__label").textContent).toBe(
      "1–25 of 60"
    );

    const next = Array.from(
      element.shadowRoot.querySelectorAll("lightning-button")
    ).find((b) => b.label === "Next");
    next.click();
    await flush();

    expect(element.shadowRoot.querySelector(".pager__label").textContent).toBe(
      "26–50 of 60"
    );
  });

  it("offers a server-side load-more once the cap is hit and reports itself", async () => {
    const capped = [];
    for (let i = 0; i < 200; i++) {
      capped.push(row({ id: `a02000000000${i}`, name: `CHG-${i}` }));
    }
    getChanges.mockResolvedValue(capped);

    const element = build();
    await flush();

    const more = Array.from(
      element.shadowRoot.querySelectorAll("lightning-button")
    ).find((b) => b.label === "Load 200 more");
    expect(more).not.toBeNull();

    let resolveSecond;
    getChanges.mockImplementation(
      () => new Promise((res) => (resolveSecond = res))
    );
    more.click();
    await flush();

    const busy = Array.from(
      element.shadowRoot.querySelectorAll("lightning-button")
    ).find((b) => b.label === "Loading records…");
    expect(busy).toBeDefined();
    expect(busy.disabled).toBe(true);

    resolveSecond(capped);
    await flush();
    expect(getChanges.mock.calls[1][0].maxRows).toBe(400);
  });

  it("distinguishes an empty object from an over-narrow filter", async () => {
    getChanges.mockResolvedValue([]);
    const element = build();
    await flush();

    let empty = element.shadowRoot.querySelector("c-huddle-empty-state");
    expect(empty.heading).toBe("Huddle has not logged anything yet");

    getChanges.mockResolvedValue(ROWS);
    element.shadowRoot
      .querySelectorAll("lightning-combobox")[0]
      .dispatchEvent(new CustomEvent("change", { detail: { value: "x" } }));
    await flush();

    const search = element.shadowRoot.querySelector(".log__search");
    search.value = "no-such-thing";
    search.dispatchEvent(new CustomEvent("change"));
    await flush();

    empty = element.shadowRoot.querySelector("c-huddle-empty-state");
    expect(empty.heading).toBe("No audited action matches this scope");
  });

  it("translates an Apex failure into a sentence and keeps the raw text", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    getChanges.mockRejectedValue({
      body: { message: "System.QueryException: unexpected token" }
    });

    const element = build();
    await flush();

    const error = element.shadowRoot.querySelector("c-huddle-error-state");
    expect(error.message).toContain("could not load the change log");
    expect(error.detail).toBe("System.QueryException: unexpected token");
  });

  it("builds a row action menu from the links a row actually has", async () => {
    const element = build();
    await flush();

    const menus = element.shadowRoot.querySelectorAll("lightning-button-menu");
    expect(menus.length).toBe(3);
    const items = element.shadowRoot.querySelectorAll("lightning-menu-item");
    // Every row here has a related record, a source recap, an opportunity and itself.
    expect(items.length).toBe(12);
  });

  it("survives the filter-options wire failing", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    const element = build();
    getFilterOptions.error({ message: "no access" });
    await flush();

    // The log itself still renders; the comboboxes keep their "All" fallbacks.
    expect(element.shadowRoot.querySelectorAll(".entry").length).toBe(3);
    expect(element.shadowRoot.querySelector("c-huddle-error-state")).toBeNull();
  });
});
