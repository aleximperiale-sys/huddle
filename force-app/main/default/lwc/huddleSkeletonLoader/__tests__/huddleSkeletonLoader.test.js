import { createElement } from "lwc";
import HuddleSkeletonLoader from "c/huddleSkeletonLoader";

describe("c-huddle-skeleton-loader", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  function build(props = {}) {
    const element = createElement("c-huddle-skeleton-loader", {
      is: HuddleSkeletonLoader
    });
    Object.assign(element, props);
    document.body.appendChild(element);
    return element;
  }

  it("announces itself to assistive tech while it is on screen", () => {
    const element = build({ label: "Loading open decisions" });
    const status = element.shadowRoot.querySelector('[role="status"]');
    expect(status).not.toBeNull();
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(
      element.shadowRoot.querySelector(".slds-assistive-text").textContent
    ).toBe("Loading open decisions");
  });

  it("reserves the KPI card's box so the layout cannot shift on load", () => {
    const element = build({ variant: "kpi" });
    const kpi = element.shadowRoot.querySelector(".sk-kpi");
    expect(kpi).not.toBeNull();
    expect(element.shadowRoot.querySelector(".sk").style.minHeight).toBe(
      "7.5rem"
    );
  });

  it("renders one agenda placeholder per requested row", () => {
    const element = build({ variant: "agenda", count: 4 });
    expect(element.shadowRoot.querySelectorAll(".sk-agenda").length).toBe(4);
  });

  it("falls back to the variant's own row count when none is given", () => {
    const element = build({ variant: "rows" });
    expect(element.shadowRoot.querySelectorAll(".sk-row").length).toBe(5);
  });

  it("ignores a nonsense count rather than rendering nothing", () => {
    const element = build({ variant: "bars", count: "-3" });
    expect(element.shadowRoot.querySelectorAll(".sk-bar").length).toBe(4);
  });

  it("renders generic lines for an unrecognised variant", () => {
    const element = build({ variant: "something-else", count: 2 });
    expect(element.shadowRoot.querySelectorAll(".sk__block_line").length).toBe(
      2
    );
  });
});
