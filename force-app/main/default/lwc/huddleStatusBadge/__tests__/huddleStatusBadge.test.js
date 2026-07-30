import { createElement } from "lwc";
import HuddleStatusBadge from "c/huddleStatusBadge";

/**
 * The one rule this component exists to enforce: a status never travels as a colour
 * on its own. Every assertion here is about the label and the icon surviving.
 */
describe("c-huddle-status-badge", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  function build(props = {}) {
    const element = createElement("c-huddle-status-badge", {
      is: HuddleStatusBadge
    });
    Object.assign(element, props);
    document.body.appendChild(element);
    return element;
  }

  it("renders the label as text alongside an icon", () => {
    const element = build({ tone: "critical", label: "Aging" });

    const label = element.shadowRoot.querySelector(".pill__label");
    const icon = element.shadowRoot.querySelector("lightning-icon");

    expect(label.textContent).toBe("Aging");
    expect(icon).not.toBeNull();
    expect(icon.iconName).toBe("utility:error");
  });

  it("applies the tone class so hue and label always agree", () => {
    const element = build({ tone: "success", label: "All assigned" });
    const pill = element.shadowRoot.querySelector(".pill");
    expect(pill.className).toContain("pill_success");
  });

  it("falls back to the neutral tone for an unknown tone", () => {
    const element = build({ tone: "chartreuse", label: "Unknown" });
    const pill = element.shadowRoot.querySelector(".pill");
    expect(pill.className).toContain("pill_neutral");
  });

  it("prefers an explicit icon over the tone default", () => {
    const element = build({
      tone: "accent",
      label: "Priya Raman",
      iconName: "utility:user"
    });
    expect(element.shadowRoot.querySelector("lightning-icon").iconName).toBe(
      "utility:user"
    );
  });

  it("gives the icon assistive text of its own when one is supplied", () => {
    const element = build({
      tone: "accent",
      label: "Priya Raman",
      assistiveText: "Assigned to"
    });
    expect(
      element.shadowRoot.querySelector("lightning-icon").alternativeText
    ).toBe("Assigned to");
  });
});
