import { createElement } from "lwc";
import HuddleKpiCard from "c/huddleKpiCard";

describe("c-huddle-kpi-card", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  function build(props = {}) {
    const element = createElement("c-huddle-kpi-card", { is: HuddleKpiCard });
    Object.assign(element, props);
    document.body.appendChild(element);
    return element;
  }

  it("renders the value, label and supporting text", () => {
    const element = build({
      label: "decisions still unresolved",
      value: 7,
      supportingText: "3 of 10 resolved so far"
    });

    expect(element.shadowRoot.querySelector(".kpi__value").textContent).toBe(
      "7"
    );
    expect(element.shadowRoot.querySelector(".kpi__label").textContent).toBe(
      "decisions still unresolved"
    );
    expect(element.shadowRoot.querySelector(".kpi__support").textContent).toBe(
      "3 of 10 resolved so far"
    );
  });

  it("swaps the body for a same-height skeleton while loading", () => {
    const element = build({ label: "anything", value: 1, loading: true });
    expect(
      element.shadowRoot.querySelector("c-huddle-skeleton-loader")
    ).not.toBeNull();
    expect(element.shadowRoot.querySelector(".kpi__value")).toBeNull();
  });

  it("clamps the progress meter into 0–100 and labels it", () => {
    const element = build({ label: "done", value: 4, progress: 140 });
    const bar = element.shadowRoot.querySelector("lightning-progress-bar");
    expect(bar.value).toBe(100);
    expect(
      element.shadowRoot.querySelector(".kpi__meter-label").textContent
    ).toBe("100% complete");
  });

  it("omits the meter entirely when no progress is supplied", () => {
    const element = build({ label: "done", value: 4 });
    expect(
      element.shadowRoot.querySelector("lightning-progress-bar")
    ).toBeNull();
  });

  it("marks a downward trend as bad news in class, not just in colour", () => {
    const element = build({
      label: "actions",
      value: 3,
      trendLabel: "-2 vs the 3 days before",
      trendDirection: "down",
      trendMeaning: "negative"
    });
    const trend = element.shadowRoot.querySelector(".kpi__trend");
    expect(trend.className).toContain("kpi__trend_negative");
    expect(trend.textContent).toContain("-2 vs the 3 days before");
  });

  it("shows its own error state without taking the page down", () => {
    const element = build({
      label: "decisions",
      value: 3,
      errorMessage: "Could not count these."
    });
    expect(element.shadowRoot.querySelector(".kpi__error").textContent).toBe(
      "Could not count these."
    );
    expect(element.shadowRoot.querySelector(".kpi__value")).toBeNull();
  });

  it("shows an empty message in place of a meaningless zero", () => {
    const element = build({
      label: "action items completed",
      value: 0,
      emptyMessage: "No action items yet"
    });
    expect(element.shadowRoot.querySelector(".kpi__empty").textContent).toBe(
      "No action items yet"
    );
  });

  it("dispatches action from its footer button", () => {
    const element = build({
      label: "decisions",
      value: 2,
      actionLabel: "Review them"
    });
    const handler = jest.fn();
    element.addEventListener("action", handler);

    element.shadowRoot.querySelector("lightning-button").click();

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("carries the tone through to the card class for the rail colour", () => {
    const element = build({ label: "x", value: 1, tone: "critical" });
    expect(element.shadowRoot.querySelector(".kpi").className).toContain(
      "kpi_tone-critical"
    );
  });
});
