/**
 * The single structured parse of a strategy-meeting recap. Produced once by
 * Huddle_ExtractionService and consumed by every topic's action, so the strategy
 * log, the action items and the open decisions all come from one reading of the
 * text rather than three possibly-inconsistent ones.
 *
 * Serializable to JSON so it can be cached on
 * Huddle_Strategy_Log__c.Extraction_JSON__c at log time.
 */
public class Huddle_MeetingParse {
  /** Something the meeting agreed someone would do. */
  public class ActionItem {
    public String text; // The action, cleaned into a task-like phrase.
    public String ownerHint; // The name or role the recap attached to it, blank when none.
    public Integer dueInDays; // Timing cue in days, null when the recap gave none.
    public String sourceSentence; // The literal sentence it came from, for traceability.

    public ActionItem() {
    }
    public ActionItem(
      String text,
      String ownerHint,
      Integer dueInDays,
      String sourceSentence
    ) {
      this.text = text;
      this.ownerHint = ownerHint;
      this.dueInDays = dueInDays;
      this.sourceSentence = sourceSentence;
    }
  }

  /** A question the meeting explicitly left unresolved. */
  public class OpenQuestion {
    public String question;
    public String context; // Surrounding sentence(s) explaining what it blocks.
    public Integer neededInDays; // Deadline cue in days, null when none stated.

    public OpenQuestion() {
    }
    public OpenQuestion(String question, String context, Integer neededInDays) {
      this.question = question;
      this.context = context;
      this.neededInDays = neededInDays;
    }
  }

  public String strategySummary = ''; // What the team decided to do.
  public String reasoning = ''; // Why they decided it. The part that survives handoff.
  public List<ActionItem> actionItems = new List<ActionItem>();
  public List<OpenQuestion> openQuestions = new List<OpenQuestion>();
  public List<String> attendees = new List<String>();
  public Boolean lowConfidence = false; // True when the recap was too thin to parse confidently.
  public String notes = ''; // Why it was low-confidence, so the agent can say so plainly.

  public String toJsonString() {
    return JSON.serialize(this);
  }

  public static Huddle_MeetingParse fromJson(String jsonStr) {
    if (String.isBlank(jsonStr)) {
      return new Huddle_MeetingParse();
    }
    return (Huddle_MeetingParse) JSON.deserialize(
      jsonStr,
      Huddle_MeetingParse.class
    );
  }
}
