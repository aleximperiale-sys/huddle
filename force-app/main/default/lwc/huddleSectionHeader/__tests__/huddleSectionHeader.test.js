import { createElement } from "lwc";
import HuddleSectionHeader from "c/huddleSectionHeader";

describe("c-huddle-section-header", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  function build(props = {}) {
    const element = createElement("c-huddle-section-header", {
      is: HuddleSectionHeader
    });
    Object.assign(element, props);
    document.body.appendChild(element);
    return element;
  }

  it("renders an h2 by default so the outline stays honest", () => {
    const element = build({ heading: "Audited actions" });
    expect(element.shadowRoot.querySelector("h2")).not.toBeNull();
    expect(element.shadowRoot.querySelector("h3")).toBeNull();
  });

  it("drops to an h3 for a nested section", () => {
    const element = build({ heading: "What Huddle did", level: "3" });
    expect(element.shadowRoot.querySelector("h3")).not.toBeNull();
    expect(element.shadowRoot.querySelector("h2")).toBeNull();
  });

  it("renders the eyebrow, count and description when supplied", () => {
    const element = build({
      eyebrow: "Needs a decision",
      heading: "Unresolved",
      countLabel: "3 decisions",
      description: "Oldest first."
    });
    expect(element.shadowRoot.querySelector(".head__eyebrow").textContent).toBe(
      "Needs a decision"
    );
    expect(element.shadowRoot.querySelector(".head__count").textContent).toBe(
      "3 decisions"
    );
    expect(
      element.shadowRoot.querySelector(".head__description").textContent
    ).toBe("Oldest first.");
  });

  it("has no disclosure button unless the section is collapsible", () => {
    const element = build({ heading: "Scope" });
    expect(
      element.shadowRoot.querySelector("lightning-button-icon")
    ).toBeNull();
  });

  it("reports the intended state and reflects aria-expanded", () => {
    const element = build({
      heading: "Scope",
      collapsible: true,
      collapsed: false
    });
    const toggle = element.shadowRoot.querySelector("lightning-button-icon");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.iconName).toBe("utility:chevrondown");

    const handler = jest.fn();
    element.addEventListener("toggle", handler);
    toggle.click();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].detail).toEqual({ collapsed: true });
  });

  it("gives the hero variant its own rule treatment", () => {
    const element = build({ heading: "Unresolved", variant: "hero" });
    expect(element.shadowRoot.querySelector(".head").className).toContain(
      "head_hero"
    );
    expect(element.shadowRoot.querySelector("h2").className).toContain(
      "head__title_hero"
    );
  });
});
