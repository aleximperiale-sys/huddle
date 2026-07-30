import { createElement } from "lwc";
import HuddleEmptyState from "c/huddleEmptyState";

describe("c-huddle-empty-state", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  function build(props = {}) {
    const element = createElement("c-huddle-empty-state", {
      is: HuddleEmptyState
    });
    Object.assign(element, props);
    document.body.appendChild(element);
    return element;
  }

  it("renders an icon, a heading and an explanation", () => {
    const element = build({
      iconName: "utility:success",
      heading: "Nothing left hanging",
      message: "Decisions appear here once they pass seven days open."
    });

    expect(element.shadowRoot.querySelector("lightning-icon").iconName).toBe(
      "utility:success"
    );
    expect(
      element.shadowRoot.querySelector(".empty__heading").textContent
    ).toBe("Nothing left hanging");
    expect(
      element.shadowRoot.querySelector(".empty__message").textContent
    ).toContain("seven days open");
  });

  it("omits the button when the emptiness is not the user's to fix", () => {
    const element = build({ heading: "All clear" });
    expect(element.shadowRoot.querySelector("lightning-button")).toBeNull();
  });

  it("dispatches action when the recommended next step is taken", () => {
    const element = build({
      heading: "No match",
      actionLabel: "Clear filters"
    });
    const handler = jest.fn();
    element.addEventListener("action", handler);

    element.shadowRoot.querySelector("lightning-button").click();

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("supports a compact size for inline regions", () => {
    const element = build({ heading: "Nothing yet", size: "compact" });
    expect(element.shadowRoot.querySelector(".empty").className).toContain(
      "empty_compact"
    );
  });
});
