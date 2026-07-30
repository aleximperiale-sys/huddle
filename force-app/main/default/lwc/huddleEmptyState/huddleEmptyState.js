import { LightningElement, api } from "lwc";

/**
 * An intentional empty state: what is missing, why, and the one thing to do next.
 * Whether the emptiness is the user's to fix decides whether an action button is
 * offered at all - "no strategy sessions logged yet" is resolvable, "nothing has
 * been left hanging for a week" is a good outcome and needs no button.
 */
export default class HuddleEmptyState extends LightningElement {
  @api iconName = "utility:info";

  /** One short line naming the state. */
  @api heading;

  /** Optional second line explaining what would fill it. */
  @api message;

  /** When present, renders a button that dispatches `action`. */
  @api actionLabel;

  /** brand | neutral - brand for the one recommended next step. */
  @api actionVariant = "brand";

  /** Renders the state at reduced height for inline regions. */
  @api size; // 'compact' | default

  get containerClass() {
    return this.size === "compact" ? "empty empty_compact" : "empty";
  }

  get hasAction() {
    return Boolean(this.actionLabel);
  }

  handleAction() {
    this.dispatchEvent(new CustomEvent("action"));
  }
}
