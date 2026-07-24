/**
 * Topic 3, Identify Open Decisions. Anything the meeting explicitly left unresolved
 * ("we still need to decide whether to bring in the CISO before the next call")
 * becomes its own tracked record instead of a sentence buried in the notes.
 *
 * Additive and internal, so no confirmation gate: raising a question assigns no
 * work to anybody. Duplicate suppression is by question text against the same
 * Opportunity, so re-running the topic on the same recap does not pile up copies.
 */
public with sharing class Huddle_IdentifyOpenDecisionsInvocable {
  public class Request {
    @InvocableVariable(label='Opportunity Id')
    public String opportunityId;

    @InvocableVariable(
      label='Source Strategy Log Id'
      description='When provided, the cached extraction is reused instead of re-parsing.'
    )
    public String strategyLogId;

    @InvocableVariable(
      label='Meeting Recap'
      description='Raw recap. Used only when no Strategy Log Id is supplied.'
    )
    public String meetingRecap;

    @InvocableVariable(label='Rep User Id')
    public String repUserId;
  }

  public class Response {
    @InvocableVariable
    public Boolean success;
    @InvocableVariable
    public Integer decisionCount;
    @InvocableVariable
    public Integer skippedDuplicateCount;
    @InvocableVariable
    public String decisions;
    @InvocableVariable
    public String summary;
  }

  @InvocableMethod(
    label='Huddle: Identify Open Decisions'
    description='Turns each question the meeting left unresolved into a tracked Open Decision record.'
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
    Id logId = Huddle_Util.toIdOrNull(req.strategyLogId);
    Id oppId = resolveOpportunity(req.opportunityId, logId);

    Huddle_MeetingParse parse = Huddle_ExtractionService.resolve(
      logId,
      req.meetingRecap
    );

    if (parse.openQuestions.isEmpty()) {
      r.success = true;
      r.decisionCount = 0;
      r.skippedDuplicateCount = 0;
      r.summary = parse.lowConfidence
        ? 'The recap was too thin to tell what was left unresolved. Ask what the meeting did not settle.'
        : 'The meeting did not flag anything as unresolved, so no open decisions were raised.';
      return r;
    }

    Set<String> existing = existingQuestions(oppId);
    List<Huddle_Open_Decision__c> toInsert = new List<Huddle_Open_Decision__c>();
    Integer duplicates = 0;

    for (Huddle_MeetingParse.OpenQuestion q : parse.openQuestions) {
      String key = normalize(q.question);
      if (existing.contains(key)) {
        duplicates++;
        continue;
      }
      existing.add(key);
      toInsert.add(
        new Huddle_Open_Decision__c(
          Opportunity__c = oppId,
          Strategy_Log__c = logId,
          Question__c = Huddle_Util.clip(q.question, 32000),
          Context__c = Huddle_Util.clip(q.context, 32000),
          Status__c = Huddle_Constants.DECISION_OPEN,
          Needed_By__c = q.neededInDays == null
            ? null
            : Date.today().addDays(q.neededInDays),
          Raised_By__c = repId
        )
      );
    }

    if (!toInsert.isEmpty()) {
      insert toInsert;
      List<Huddle_Change_Log__c> audit = new List<Huddle_Change_Log__c>();
      for (Huddle_Open_Decision__c d : toInsert) {
        audit.add(Huddle_ChangeLogService.buildDecisionRaised(d, repId));
      }
      Huddle_ChangeLogService.insertLogs(audit);
    }

    r.success = true;
    r.decisionCount = toInsert.size();
    r.skippedDuplicateCount = duplicates;
    r.decisions = describe(toInsert);
    r.summary = toInsert.isEmpty()
      ? 'Every unresolved question from this recap was already being tracked on the deal, so nothing new was raised.'
      : 'Raised ' +
        toInsert.size() +
        ' open decision(s) on the deal:\n' +
        r.decisions +
        (duplicates > 0
          ? '\n(' + duplicates + ' were already tracked and skipped.)'
          : '');
    return r;
  }

  private static String describe(List<Huddle_Open_Decision__c> decisions) {
    List<String> lines = new List<String>();
    for (Huddle_Open_Decision__c d : decisions) {
      lines.add(
        '- ' +
          d.Question__c +
          (d.Needed_By__c == null
            ? ''
            : ' (needed by ' + d.Needed_By__c.format() + ')')
      );
    }
    return String.join(lines, '\n');
  }

  private static Set<String> existingQuestions(Id oppId) {
    Set<String> out = new Set<String>();
    if (oppId == null) {
      return out;
    }
    for (Huddle_Open_Decision__c d : [
      SELECT Question__c
      FROM Huddle_Open_Decision__c
      WHERE
        Opportunity__c = :oppId
        AND Status__c = :Huddle_Constants.DECISION_OPEN
      LIMIT 500
    ]) {
      out.add(normalize(d.Question__c));
    }
    return out;
  }

  private static String normalize(String q) {
    return q == null ? '' : q.toLowerCase().replaceAll('[^a-z0-9 ]', '').trim();
  }

  private static Id resolveOpportunity(String supplied, Id strategyLogId) {
    Id oppId = Huddle_Util.toIdOrNull(supplied);
    if (oppId != null || strategyLogId == null) {
      return oppId;
    }
    List<Huddle_Strategy_Log__c> logs = [
      SELECT Opportunity__c
      FROM Huddle_Strategy_Log__c
      WHERE Id = :strategyLogId
      LIMIT 1
    ];
    return logs.isEmpty() ? null : logs[0].Opportunity__c;
  }
}
