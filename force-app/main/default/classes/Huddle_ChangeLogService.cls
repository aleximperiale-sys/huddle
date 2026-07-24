/**
 * The audit backbone. Every write Huddle makes, no exceptions, funnels through here
 * so a Huddle_Change_Log__c row exists for it. This is deliberately not optional or
 * configurable: a manager reviewing the Huddle app has to be able to see exactly
 * what was logged and, above all, who got assigned what.
 *
 * Methods build the rows; callers hand them to insertLogs() so a topic's write and
 * its audit row commit together and stay bulk-safe.
 */
public with sharing class Huddle_ChangeLogService {
  public static Huddle_Change_Log__c buildStrategyLogged(
    Huddle_Strategy_Log__c log,
    Id repId
  ) {
    Huddle_Change_Log__c c = base(
      Huddle_Constants.CHANGE_STRATEGY_LOGGED,
      log.Id,
      log.Name,
      Huddle_Constants.OBJ_STRATEGY_LOG,
      log.Id,
      log.Opportunity__c,
      repId,
      false
    );
    c.Detail__c = Huddle_Util.clip(
      'Strategy captured: ' +
      (String.isBlank(log.Strategy_Summary__c)
        ? '(none extracted)'
        : log.Strategy_Summary__c),
      32000
    );
    return c;
  }

  public static Huddle_Change_Log__c buildTaskCreated(
    Task t,
    Id strategyLogId,
    Id opportunityId,
    Id repId,
    Boolean confirmed,
    Boolean ownerUnclear
  ) {
    Huddle_Change_Log__c c = base(
      Huddle_Constants.CHANGE_TASK_CREATED,
      t.Id,
      t.Subject,
      Huddle_Constants.OBJ_TASK,
      strategyLogId,
      opportunityId,
      repId,
      confirmed
    );
    c.Assigned_To__c = t.OwnerId;
    c.Detail__c = Huddle_Util.clip(
      'Action item "' +
        t.Subject +
        '" due ' +
        (t.ActivityDate == null ? 'unspecified' : t.ActivityDate.format()) +
        (ownerUnclear
          ? ' — OWNER UNCLEAR, assigned to the note-taker pending reassignment.'
          : '.'),
      32000
    );
    return c;
  }

  public static Huddle_Change_Log__c buildDecisionRaised(
    Huddle_Open_Decision__c d,
    Id repId
  ) {
    Huddle_Change_Log__c c = base(
      Huddle_Constants.CHANGE_DECISION_RAISED,
      d.Id,
      Huddle_Util.clip(d.Question__c, 255),
      Huddle_Constants.OBJ_OPEN_DECISION,
      d.Strategy_Log__c,
      d.Opportunity__c,
      repId,
      false
    );
    c.Detail__c = Huddle_Util.clip(
      'Left unresolved by the meeting: ' + d.Question__c,
      32000
    );
    return c;
  }

  public static Huddle_Change_Log__c buildDecisionResolved(
    Huddle_Open_Decision__c d,
    Id repId
  ) {
    Huddle_Change_Log__c c = base(
      Huddle_Constants.CHANGE_DECISION_RESOLVED,
      d.Id,
      Huddle_Util.clip(d.Question__c, 255),
      Huddle_Constants.OBJ_OPEN_DECISION,
      d.Strategy_Log__c,
      d.Opportunity__c,
      repId,
      true
    );
    c.Detail__c = Huddle_Util.clip('Resolved: ' + d.Resolution__c, 32000);
    return c;
  }

  public static Huddle_Change_Log__c buildDigestGenerated(
    Id opportunityId,
    Id strategyLogId,
    String opportunityName,
    Id repId,
    String detail
  ) {
    Huddle_Change_Log__c c = base(
      Huddle_Constants.CHANGE_DIGEST_GENERATED,
      opportunityId,
      opportunityName,
      Huddle_Constants.OBJ_OPPORTUNITY,
      strategyLogId,
      opportunityId,
      repId,
      false
    );
    c.Detail__c = Huddle_Util.clip(detail, 32000);
    return c;
  }

  /**
   * Persist the audit rows. allOrNone=false so one bad row never suppresses the
   * rest of the audit trail; failures are logged, not swallowed.
   */
  public static void insertLogs(List<Huddle_Change_Log__c> logs) {
    if (logs == null || logs.isEmpty()) {
      return;
    }
    List<Database.SaveResult> results = Database.insert(logs, false);
    for (Database.SaveResult sr : results) {
      if (!sr.isSuccess()) {
        for (Database.Error e : sr.getErrors()) {
          System.debug(
            LoggingLevel.ERROR,
            'Huddle change-log insert failed: ' + e.getMessage()
          );
        }
      }
    }
  }

  private static Huddle_Change_Log__c base(
    String changeType,
    Id recordId,
    String recordName,
    String objectApiName,
    Id strategyLogId,
    Id opportunityId,
    Id repId,
    Boolean confirmed
  ) {
    return new Huddle_Change_Log__c(
      Change_Type__c = changeType,
      Related_Record_Id__c = recordId,
      Related_Record_Name__c = Huddle_Util.clip(recordName, 255),
      Object_API_Name__c = objectApiName,
      Source_Strategy_Log__c = strategyLogId,
      Opportunity__c = opportunityId,
      Created_By_Rep__c = repId,
      Rep_Confirmed__c = confirmed == true
    );
  }
}
