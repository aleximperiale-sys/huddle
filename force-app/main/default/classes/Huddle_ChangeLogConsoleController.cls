/**
 * Controller for huddleChangeLogConsole and huddleOpportunityStrategyBadge.
 * Read-only: the change log is an audit trail, so nothing here mutates it.
 * Filtering uses bound variables, never string-concatenated user input.
 */
public with sharing class Huddle_ChangeLogConsoleController {
  public class ChangeRow {
    @AuraEnabled
    public Id id;
    @AuraEnabled
    public String name;
    @AuraEnabled
    public String changeType;
    @AuraEnabled
    public String objectApiName;
    @AuraEnabled
    public String relatedRecordId;
    @AuraEnabled
    public String relatedRecordName;
    @AuraEnabled
    public String detail;
    @AuraEnabled
    public String assignedToName;
    @AuraEnabled
    public String repName;
    @AuraEnabled
    public Id opportunityId;
    @AuraEnabled
    public String opportunityName;
    @AuraEnabled
    public Id sourceStrategyLogId;
    @AuraEnabled
    public String sourceStrategyLogName;
    @AuraEnabled
    public Boolean repConfirmed;
    @AuraEnabled
    public Datetime createdDate;
  }

  public class FilterOptions {
    @AuraEnabled
    public List<Map<String, String>> reps = new List<Map<String, String>>();
    @AuraEnabled
    public List<Map<String, String>> opportunities = new List<Map<String, String>>();
    @AuraEnabled
    public List<String> changeTypes = new List<String>();
  }

  /** Summary for the Opportunity record-page badge. */
  public class OpportunitySummary {
    @AuraEnabled
    public Integer strategySessions = 0;
    @AuraEnabled
    public Integer actionItems = 0;
    @AuraEnabled
    public Integer openDecisions = 0;
    @AuraEnabled
    public Datetime lastSessionDate;
    @AuraEnabled
    public Id lastStrategyLogId;
  }

  @AuraEnabled(cacheable=true)
  public static List<ChangeRow> getChanges(
    String repId,
    String opportunityId,
    String changeType,
    Date startDate,
    Date endDate,
    Integer maxRows
  ) {
    Integer lim = (maxRows == null ||
      maxRows <= 0 ||
      maxRows > 2000)
      ? 200
      : maxRows;

    String soql =
      'SELECT Id, Name, Change_Type__c, Object_API_Name__c, Related_Record_Id__c, ' +
      'Related_Record_Name__c, Detail__c, Assigned_To__r.Name, Created_By_Rep__r.Name, ' +
      'Opportunity__c, Opportunity__r.Name, Source_Strategy_Log__c, Source_Strategy_Log__r.Name, ' +
      'Rep_Confirmed__c, CreatedDate FROM Huddle_Change_Log__c';

    Id repFilter = String.isBlank(repId) ? null : (Id) repId;
    Id oppFilter = String.isBlank(opportunityId) ? null : (Id) opportunityId;
    Datetime startDt = startDate == null
      ? null
      : Datetime.newInstance(startDate, Time.newInstance(0, 0, 0, 0));
    Datetime endDt = endDate == null
      ? null
      : Datetime.newInstance(endDate.addDays(1), Time.newInstance(0, 0, 0, 0));

    List<String> clauses = new List<String>();
    if (repFilter != null) {
      clauses.add('Created_By_Rep__c = :repFilter');
    }
    if (oppFilter != null) {
      clauses.add('Opportunity__c = :oppFilter');
    }
    if (String.isNotBlank(changeType)) {
      clauses.add('Change_Type__c = :changeType');
    }
    if (startDt != null) {
      clauses.add('CreatedDate >= :startDt');
    }
    if (endDt != null) {
      clauses.add('CreatedDate <= :endDt');
    }
    if (!clauses.isEmpty()) {
      soql += ' WHERE ' + String.join(clauses, ' AND ');
    }
    soql += ' ORDER BY CreatedDate DESC LIMIT :lim';

    List<ChangeRow> rows = new List<ChangeRow>();
    for (
      Huddle_Change_Log__c c : (List<Huddle_Change_Log__c>) Database.query(soql)
    ) {
      rows.add(toRow(c));
    }
    return rows;
  }

  @AuraEnabled(cacheable=true)
  public static List<ChangeRow> getChangesForOpportunity(String opportunityId) {
    List<ChangeRow> rows = new List<ChangeRow>();
    if (String.isBlank(opportunityId)) {
      return rows;
    }
    for (Huddle_Change_Log__c c : [
      SELECT
        Id,
        Name,
        Change_Type__c,
        Object_API_Name__c,
        Related_Record_Id__c,
        Related_Record_Name__c,
        Detail__c,
        Assigned_To__r.Name,
        Created_By_Rep__r.Name,
        Opportunity__c,
        Opportunity__r.Name,
        Source_Strategy_Log__c,
        Source_Strategy_Log__r.Name,
        Rep_Confirmed__c,
        CreatedDate
      FROM Huddle_Change_Log__c
      WHERE Opportunity__c = :opportunityId
      ORDER BY CreatedDate DESC
      LIMIT 200
    ]) {
      rows.add(toRow(c));
    }
    return rows;
  }

  /** Counts behind the "Huddle has logged N strategy sessions and M action items" badge. */
  @AuraEnabled(cacheable=true)
  public static OpportunitySummary getOpportunitySummary(String opportunityId) {
    OpportunitySummary s = new OpportunitySummary();
    if (String.isBlank(opportunityId)) {
      return s;
    }
    Id oppId = (Id) opportunityId;

    List<Huddle_Strategy_Log__c> logs = [
      SELECT Id, CreatedDate
      FROM Huddle_Strategy_Log__c
      WHERE Opportunity__c = :oppId
      ORDER BY CreatedDate DESC
      LIMIT 200
    ];
    s.strategySessions = logs.size();
    if (!logs.isEmpty()) {
      s.lastSessionDate = logs[0].CreatedDate;
      s.lastStrategyLogId = logs[0].Id;
    }
    s.actionItems = [
      SELECT COUNT()
      FROM Task
      WHERE WhatId = :oppId AND Huddle_Generated__c = TRUE
    ];
    s.openDecisions = [
      SELECT COUNT()
      FROM Huddle_Open_Decision__c
      WHERE
        Opportunity__c = :oppId
        AND Status__c = :Huddle_Constants.DECISION_OPEN
    ];
    return s;
  }

  @AuraEnabled(cacheable=true)
  public static FilterOptions getFilterOptions() {
    FilterOptions opts = new FilterOptions();
    Set<Id> repIds = new Set<Id>();
    Set<Id> oppIds = new Set<Id>();
    for (Huddle_Change_Log__c c : [
      SELECT
        Created_By_Rep__c,
        Created_By_Rep__r.Name,
        Opportunity__c,
        Opportunity__r.Name
      FROM Huddle_Change_Log__c
      WHERE CreatedDate = LAST_N_DAYS:180
      LIMIT 5000
    ]) {
      if (
        c.Created_By_Rep__c != null && !repIds.contains(c.Created_By_Rep__c)
      ) {
        repIds.add(c.Created_By_Rep__c);
        opts.reps.add(
          new Map<String, String>{
            'value' => c.Created_By_Rep__c,
            'label' => c.Created_By_Rep__r.Name
          }
        );
      }
      if (c.Opportunity__c != null && !oppIds.contains(c.Opportunity__c)) {
        oppIds.add(c.Opportunity__c);
        opts.opportunities.add(
          new Map<String, String>{
            'value' => c.Opportunity__c,
            'label' => c.Opportunity__r.Name
          }
        );
      }
    }
    opts.changeTypes = new List<String>{
      Huddle_Constants.CHANGE_STRATEGY_LOGGED,
      Huddle_Constants.CHANGE_TASK_CREATED,
      Huddle_Constants.CHANGE_DECISION_RAISED,
      Huddle_Constants.CHANGE_DECISION_RESOLVED,
      Huddle_Constants.CHANGE_DIGEST_GENERATED
    };
    return opts;
  }

  private static ChangeRow toRow(Huddle_Change_Log__c c) {
    ChangeRow row = new ChangeRow();
    row.id = c.Id;
    row.name = c.Name;
    row.changeType = c.Change_Type__c;
    row.objectApiName = c.Object_API_Name__c;
    row.relatedRecordId = c.Related_Record_Id__c;
    row.relatedRecordName = c.Related_Record_Name__c;
    row.detail = c.Detail__c;
    row.assignedToName = c.Assigned_To__r == null
      ? null
      : c.Assigned_To__r.Name;
    row.repName = c.Created_By_Rep__r == null ? null : c.Created_By_Rep__r.Name;
    row.opportunityId = c.Opportunity__c;
    row.opportunityName = c.Opportunity__r == null
      ? null
      : c.Opportunity__r.Name;
    row.sourceStrategyLogId = c.Source_Strategy_Log__c;
    row.sourceStrategyLogName = c.Source_Strategy_Log__r == null
      ? null
      : c.Source_Strategy_Log__r.Name;
    row.repConfirmed = c.Rep_Confirmed__c;
    row.createdDate = c.CreatedDate;
    return row;
  }
}
