import { createElement } from "lwc";
import HuddleErrorState from "c/huddleErrorState";

describe("c-huddle-error-state", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  function build(props = {}) {
    const element = createElement("c-huddle-error-state", {
      is: HuddleErrorState
    });
    Object.assign(element, props);
    document.body.appendChild(element);
    return element;
  }

  function buttonsOf(element) {
    return Array.from(element.shadowRoot.querySelectorAll("lightning-button"));
  }

  it("shows the human message and marks itself as an alert", () => {
    const element = build({ message: "Huddle could not load the briefing." });
    const alert = element.shadowRoot.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(
      element.shadowRoot.querySelector(".block__message").textContent
    ).toBe("Huddle could not load the briefing.");
  });

  it("keeps the raw diagnostic off screen until it is asked for", async () => {
    const element = build({
      message: "Friendly sentence.",
      detail: "System.QueryException: no such column"
    });

    expect(element.shadowRoot.querySelector(".block__detail")).toBeNull();

    const disclosure = buttonsOf(element).find(
      (b) => b.label === "Technical details"
    );
    disclosure.click();
    await Promise.resolve();

    expect(
      element.shadowRoot.querySelector(".block__detail").textContent
    ).toContain("QueryException");
  });

  it("hides retry entirely when retrying cannot help", () => {
    const element = build({ message: "Friendly sentence." });
    expect(buttonsOf(element).some((b) => b.label === "Retry")).toBe(false);
  });

  it("reports itself while the retry is in flight", () => {
    const element = build({
      message: "Friendly sentence.",
      retryLabel: "Try again",
      retrying: true
    });
    const retry = buttonsOf(element)[0];
    expect(retry.label).toBe("Retrying…");
    expect(retry.disabled).toBe(true);
  });

  it("dispatches retry when the button is pressed", () => {
    const element = build({
      message: "Friendly sentence.",
      retryLabel: "Try again"
    });
    const handler = jest.fn();
    element.addEventListener("retry", handler);

    buttonsOf(element)[0].click();

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("renders as an inline alert when it must not replace the content", () => {
    const element = build({ variant: "inline", message: "Stale figures." });
    expect(element.shadowRoot.querySelector(".alert")).not.toBeNull();
    expect(element.shadowRoot.querySelector(".block")).toBeNull();
  });
});
