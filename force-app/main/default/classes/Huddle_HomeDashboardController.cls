/**
 * Controller for huddleHomeDashboard. Read-only rollups off the change log and the
 * open-decision object: strategy sessions logged this week, action items created
 * versus completed, and the questions that have been hanging longest.
 *
 * The aging rollup is the one a manager actually acts on, so it returns the
 * individual decisions rather than just a count.
 */
public with sharing class Huddle_HomeDashboardController {
  public class Tally {
    @AuraEnabled
    public String label;
    @AuraEnabled
    public Integer count;
    public Tally(String label, Integer count) {
      this.label = label;
      this.count = count;
    }
  }

  public class AgingDecision {
    @AuraEnabled
    public Id id;
    @AuraEnabled
    public String name;
    @AuraEnabled
    public String question;
    @AuraEnabled
    public String opportunityName;
    @AuraEnabled
    public Integer daysOpen;
    @AuraEnabled
    public Date neededBy;
  }

  public class Summary {
    @AuraEnabled
    public Integer sessionsThisWeek = 0;
    @AuraEnabled
    public Integer sessionsAllTime = 0;
    @AuraEnabled
    public Integer actionItemsCreated = 0;
    @AuraEnabled
    public Integer actionItemsCompleted = 0;
    @AuraEnabled
    public Integer actionItemsOwnerUnclear = 0;
    @AuraEnabled
    public Integer openDecisions = 0;
    @AuraEnabled
    public Integer agingDecisionCount = 0;
    @AuraEnabled
    public List<AgingDecision> agingDecisions = new List<AgingDecision>();
    @AuraEnabled
    public List<Tally> topContributors = new List<Tally>();
    @AuraEnabled
    public List<Tally> byType = new List<Tally>();
    @AuraEnabled
    public List<Tally> trend = new List<Tally>();
  }

  @AuraEnabled(cacheable=true)
  public static Summary getSummary() {
    Summary s = new Summary();

    s.sessionsThisWeek = [
      SELECT COUNT()
      FROM Huddle_Strategy_Log__c
      WHERE CreatedDate = THIS_WEEK
    ];
    s.sessionsAllTime = [SELECT COUNT() FROM Huddle_Strategy_Log__c];

    s.actionItemsCreated = [
      SELECT COUNT()
      FROM Task
      WHERE Huddle_Generated__c = TRUE
    ];
    s.actionItemsCompleted = [
      SELECT COUNT()
      FROM Task
      WHERE Huddle_Generated__c = TRUE AND Status = 'Completed'
    ];
    s.actionItemsOwnerUnclear = [
      SELECT COUNT()
      FROM Task
      WHERE
        Huddle_Generated__c = TRUE
        AND Huddle_Owner_Unclear__c = TRUE
        AND Status != 'Completed'
    ];

    s.openDecisions = [
      SELECT COUNT()
      FROM Huddle_Open_Decision__c
      WHERE Status__c = :Huddle_Constants.DECISION_OPEN
    ];

    for (Huddle_Open_Decision__c d : [
      SELECT
        Id,
        Name,
        Question__c,
        Days_Open__c,
        Needed_By__c,
        Opportunity__r.Name
      FROM Huddle_Open_Decision__c
      WHERE
        Status__c = :Huddle_Constants.DECISION_OPEN
        AND Days_Open__c > :Huddle_Constants.DECISION_AGING_DAYS
      ORDER BY Days_Open__c DESC
      LIMIT 10
    ]) {
      AgingDecision a = new AgingDecision();
      a.id = d.Id;
      a.name = d.Name;
      a.question = d.Question__c;
      a.opportunityName = d.Opportunity__r == null
        ? '(no opportunity)'
        : d.Opportunity__r.Name;
      a.daysOpen = d.Days_Open__c == null ? 0 : Integer.valueOf(d.Days_Open__c);
      a.neededBy = d.Needed_By__c;
      s.agingDecisions.add(a);
    }
    s.agingDecisionCount = s.agingDecisions.size();

    for (AggregateResult ar : [
      SELECT Created_By_Rep__r.Name repName, COUNT(Id) cnt
      FROM Huddle_Change_Log__c
      WHERE CreatedDate = THIS_WEEK AND Created_By_Rep__c != NULL
      GROUP BY Created_By_Rep__r.Name
      ORDER BY COUNT(Id) DESC
      LIMIT 5
    ]) {
      s.topContributors.add(
        new Tally((String) ar.get('repName'), (Integer) ar.get('cnt'))
      );
    }

    for (AggregateResult ar : [
      SELECT Change_Type__c ct, COUNT(Id) cnt
      FROM Huddle_Change_Log__c
      WHERE CreatedDate = THIS_WEEK AND Change_Type__c != NULL
      GROUP BY Change_Type__c
      ORDER BY COUNT(Id) DESC
    ]) {
      s.byType.add(new Tally((String) ar.get('ct'), (Integer) ar.get('cnt')));
    }

    // 7-day trend, oldest first, zero-filled so the chart has no gaps.
    Map<Date, Integer> counts = new Map<Date, Integer>();
    for (AggregateResult ar : [
      SELECT DAY_ONLY(CreatedDate) d, COUNT(Id) cnt
      FROM Huddle_Change_Log__c
      WHERE CreatedDate = LAST_N_DAYS:7
      GROUP BY DAY_ONLY(CreatedDate)
    ]) {
      counts.put((Date) ar.get('d'), (Integer) ar.get('cnt'));
    }
    for (Integer i = 6; i >= 0; i--) {
      Date d = Date.today().addDays(-i);
      s.trend.add(
        new Tally(d.format(), counts.containsKey(d) ? counts.get(d) : 0)
      );
    }
    return s;
  }
}
