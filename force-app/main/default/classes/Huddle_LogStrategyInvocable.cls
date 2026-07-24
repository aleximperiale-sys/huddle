/**
 * Topic 1, Log Strategy. The entry point for almost every interaction. Captures the
 * meeting recap against the Opportunity as an internal-only Huddle_Strategy_Log__c,
 * separating what the team decided from why they decided it, and caches the single
 * extraction every downstream topic reads.
 *
 * Purely additive and internal, so it runs without a confirmation gate. The record
 * it writes is a dedicated object rather than a Note or Activity precisely so no
 * customer-facing tool reading Opportunity activity history can ever surface it.
 */
public with sharing class Huddle_LogStrategyInvocable {
  public class Request {
    @InvocableVariable(
      label='Meeting Recap'
      required=true
      description='The attendee\'s raw recap of the internal strategy meeting.'
    )
    public String meetingRecap;

    @InvocableVariable(
      label='Opportunity Id'
      description='The deal the strategy session was about.'
    )
    public String opportunityId;

    @InvocableVariable(
      label='Rep User Id'
      description='The attendee entering the notes. Defaults to the running user.'
    )
    public String repUserId;

    @InvocableVariable(
      label='Meeting Date'
      description='yyyy-MM-dd. Defaults to today.'
    )
    public String meetingDate;

    @InvocableVariable(
      label='Attendees'
      description='Optional explicit attendee list, comma separated.'
    )
    public String attendees;

    @InvocableVariable(
      label='Source Channel'
      description='Chat, Dictation, or Transcript. Defaults to Chat.'
    )
    public String sourceChannel;
  }

  public class Response {
    @InvocableVariable
    public Boolean success;
    @InvocableVariable
    public String strategyLogId;
    @InvocableVariable
    public String strategyLogName;
    @InvocableVariable
    public String strategySummary;
    @InvocableVariable
    public String reasoning;
    @InvocableVariable
    public Integer actionItemCount;
    @InvocableVariable
    public Integer openQuestionCount;
    @InvocableVariable
    public Boolean lowConfidence;
    @InvocableVariable
    public String summary;
  }

  @InvocableMethod(
    label='Huddle: Log Strategy'
    description='Logs the strategy meeting against the Opportunity as an internal-only record and caches the extraction for every other topic.'
  )
  public static List<Response> run(List<Request> requests) {
    List<Response> out = new List<Response>();
    for (Request req : requests) {
      out.add(handle(req));
    }
    return out;
  }

  private static Response handle(Request req) {
    Response r = new Response();
    Id repId = Huddle_Util.toIdOrRunningUser(req.repUserId);
    Id oppId = Huddle_Util.toIdOrNull(req.opportunityId);

    Huddle_MeetingParse parse = Huddle_ExtractionService.parse(
      req.meetingRecap
    );

    // An explicit attendee list from the agent beats the one inferred from the text.
    String attendees = String.isNotBlank(req.attendees)
      ? req.attendees
      : String.join(parse.attendees, ', ');

    Huddle_Strategy_Log__c log = new Huddle_Strategy_Log__c(
      Opportunity__c = oppId,
      Meeting_Recap__c = req.meetingRecap,
      Strategy_Summary__c = Huddle_Util.clip(parse.strategySummary, 32000),
      Decision_Reasoning__c = Huddle_Util.clip(parse.reasoning, 32000),
      Meeting_Date__c = Huddle_Util.toDateOrNull(req.meetingDate) == null
        ? Date.today()
        : Huddle_Util.toDateOrNull(req.meetingDate),
      Attendees__c = Huddle_Util.clip(attendees, 255),
      Logged_By__c = repId,
      Internal_Only__c = true,
      Source_Channel__c = String.isBlank(req.sourceChannel)
        ? 'Chat'
        : req.sourceChannel,
      Low_Confidence__c = parse.lowConfidence,
      Extraction_JSON__c = parse.toJsonString()
    );
    insert log;

    Huddle_ChangeLogService.insertLogs(
      new List<Huddle_Change_Log__c>{
        Huddle_ChangeLogService.buildStrategyLogged(log, repId)
      }
    );

    r.success = true;
    r.strategyLogId = log.Id;
    r.strategyLogName = log.Name;
    r.strategySummary = parse.strategySummary;
    r.reasoning = parse.reasoning;
    r.actionItemCount = parse.actionItems.size();
    r.openQuestionCount = parse.openQuestions.size();
    r.lowConfidence = parse.lowConfidence;
    r.summary =
      'Logged ' +
      log.Name +
      ' against the deal as internal-only. Captured the strategy' +
      (String.isBlank(parse.reasoning)
        ? ' (no explicit reasoning was stated)'
        : ' and the reasoning behind it') +
      ', and spotted ' +
      parse.actionItems.size() +
      ' action item(s) and ' +
      parse.openQuestions.size() +
      ' open question(s).' +
      (parse.lowConfidence
        ? ' NOTE: the recap was thin, ask for a little more detail before creating tasks.'
        : '');
    return r;
  }
}
