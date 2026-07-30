import { LightningElement, api } from "lwc";

/**
 * A briefing-sheet section rule: eyebrow, heading, optional count, description, and
 * a slot for the section's own actions. Low chrome by design - the agenda regions
 * are separated by rules and headings, not by nested card borders.
 *
 * Collapsing is owned by the parent: this component reports the intent and reflects
 * the state it is given, so the parent can persist it or animate the body itself.
 */
export default class HuddleSectionHeader extends LightningElement {
  /** Section title. */
  @api heading;

  /** Small uppercase line above the heading - where this sits on the agenda. */
  @api eyebrow;

  /** One sentence on what the section is for. */
  @api description;

  /** Optional leading icon. */
  @api iconName;

  /** Optional count rendered beside the heading (e.g. "12 items"). */
  @api countLabel;

  /** "2" (default) or "3" - keeps the document outline honest. */
  @api level = "2";

  /** Renders the disclosure button. */
  @api collapsible = false;

  /** Current state, owned by the parent. */
  @api collapsed = false;

  /** 'hero' gives the region the loudest treatment on the page. */
  @api variant;

  get isLevelThree() {
    return String(this.level) === "3";
  }

  get containerClass() {
    return this.variant === "hero" ? "head head_hero" : "head";
  }

  get headingClass() {
    return this.variant === "hero"
      ? "head__title head__title_hero"
      : "head__title";
  }

  get toggleIcon() {
    return this.collapsed ? "utility:chevronright" : "utility:chevrondown";
  }

  get toggleTitle() {
    return this.collapsed ? `Show ${this.heading}` : `Hide ${this.heading}`;
  }

  get isExpanded() {
    return this.collapsed ? "false" : "true";
  }

  handleToggle() {
    this.dispatchEvent(
      new CustomEvent("toggle", { detail: { collapsed: !this.collapsed } })
    );
  }
}
