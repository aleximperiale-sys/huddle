/**
 * Topic 4, Deal Team Digest. Assembles what someone joining the deal actually needs:
 * the most recent strategy and the reasoning behind it, the action items still
 * outstanding and who owns them, and every question still unresolved.
 *
 * Read-only against the deal, but it still writes a change-log row. Knowing that a
 * manager pulled the internal strategy for a deal is itself worth auditing, and the
 * guardrail is that *every* Huddle action produces a row, without exceptions
 * carved out for the convenient cases.
 */
public with sharing class Huddle_DealTeamDigestInvocable {
  public class Request {
    @InvocableVariable(label='Opportunity Id' required=true)
    public String opportunityId;

    @InvocableVariable(label='Rep User Id')
    public String repUserId;

    @InvocableVariable(
      label='Session Limit'
      description='How many recent strategy sessions to include. Defaults to 3.'
    )
    public Integer sessionLimit;
  }

  public class Response {
    @InvocableVariable
    public Boolean success;
    @InvocableVariable
    public Integer strategySessionCount;
    @InvocableVariable
    public Integer openActionItemCount;
    @InvocableVariable
    public Integer openDecisionCount;
    @InvocableVariable
    public String digest;
    @InvocableVariable
    public String summary;
  }

  @InvocableMethod(
    label='Huddle: Deal Team Digest'
    description='Summarizes the latest strategy, open action items and unresolved decisions for someone joining the deal.'
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

    if (oppId == null) {
      r.success = false;
      r.summary = 'No Opportunity was supplied, so there is nothing to summarize. Which deal should I brief you on?';
      return r;
    }

    Integer sessionLimit = (req.sessionLimit == null ||
      req.sessionLimit <= 0)
      ? 3
      : Math.min(req.sessionLimit, 10);

    String oppName = opportunityName(oppId);
    List<Huddle_Strategy_Log__c> sessions = [
      SELECT
        Name,
        Meeting_Date__c,
        Strategy_Summary__c,
        Decision_Reasoning__c,
        Attendees__c,
        Logged_By__r.Name
      FROM Huddle_Strategy_Log__c
      WHERE Opportunity__c = :oppId
      ORDER BY Meeting_Date__c DESC, CreatedDate DESC
      LIMIT :sessionLimit
    ];
    List<Task> openTasks = [
      SELECT Subject, ActivityDate, Status, Owner.Name, Huddle_Owner_Unclear__c
      FROM Task
      WHERE
        WhatId = :oppId
        AND Huddle_Generated__c = TRUE
        AND Status != 'Completed'
      ORDER BY ActivityDate ASC NULLS LAST
      LIMIT 50
    ];
    List<Huddle_Open_Decision__c> decisions = [
      SELECT Question__c, Needed_By__c, Days_Open__c, Raised_By__r.Name
      FROM Huddle_Open_Decision__c
      WHERE
        Opportunity__c = :oppId
        AND Status__c = :Huddle_Constants.DECISION_OPEN
      ORDER BY CreatedDate ASC
      LIMIT 50
    ];

    r.strategySessionCount = sessions.size();
    r.openActionItemCount = openTasks.size();
    r.openDecisionCount = decisions.size();

    if (sessions.isEmpty() && openTasks.isEmpty() && decisions.isEmpty()) {
      r.success = true;
      r.digest = '';
      r.summary =
        'Huddle has nothing logged on ' +
        oppName +
        ' yet. Whoever ran the last strategy meeting on this deal did not record it here.';
      return r;
    }

    r.digest = buildDigest(oppName, sessions, openTasks, decisions);

    Huddle_ChangeLogService.insertLogs(
      new List<Huddle_Change_Log__c>{
        Huddle_ChangeLogService.buildDigestGenerated(
          oppId,
          sessions.isEmpty() ? null : sessions[0].Id,
          oppName,
          repId,
          'Deal team digest generated: ' +
            sessions.size() +
            ' strategy session(s), ' +
            openTasks.size() +
            ' open action item(s), ' +
            decisions.size() +
            ' unresolved decision(s).'
        )
      }
    );

    r.success = true;
    r.summary = r.digest;
    return r;
  }

  private static String buildDigest(
    String oppName,
    List<Huddle_Strategy_Log__c> sessions,
    List<Task> openTasks,
    List<Huddle_Open_Decision__c> decisions
  ) {
    List<String> out = new List<String>();
    out.add('INTERNAL DEAL TEAM DIGEST — ' + oppName);
    out.add('(Internal strategy only. None of this is customer-facing.)');

    if (sessions.isEmpty()) {
      out.add(
        '\nSTRATEGY\nNo strategy sessions have been logged on this deal.'
      );
    } else {
      Huddle_Strategy_Log__c latest = sessions[0];
      out.add(
        '\nCURRENT STRATEGY (' +
          latest.Name +
          ', ' +
          (latest.Meeting_Date__c == null
            ? 'undated'
            : latest.Meeting_Date__c.format()) +
          (String.isBlank(latest.Attendees__c)
            ? ''
            : ', with ' + latest.Attendees__c) +
          ')'
      );
      out.add(
        String.isBlank(latest.Strategy_Summary__c)
          ? '(none recorded)'
          : latest.Strategy_Summary__c
      );
      // The reasoning is the point of the digest: outcomes alone get re-litigated.
      out.add(
        '\nWHY\n' +
        (String.isBlank(latest.Decision_Reasoning__c)
          ? 'The meeting did not state its reasoning explicitly. Worth asking ' +
            (latest.Logged_By__r == null
              ? 'whoever ran it'
              : latest.Logged_By__r.Name) +
            ' before changing the plan.'
          : latest.Decision_Reasoning__c)
      );

      if (sessions.size() > 1) {
        List<String> priors = new List<String>();
        for (Integer i = 1; i < sessions.size(); i++) {
          Huddle_Strategy_Log__c s = sessions[i];
          priors.add(
            '- ' +
              (s.Meeting_Date__c == null
                ? s.Name
                : s.Meeting_Date__c.format()) +
              ': ' +
              Huddle_Util.clip(s.Strategy_Summary__c, 200)
          );
        }
        out.add('\nEARLIER SESSIONS\n' + String.join(priors, '\n'));
      }
    }

    if (openTasks.isEmpty()) {
      out.add('\nOPEN ACTION ITEMS\nNone outstanding.');
    } else {
      List<String> lines = new List<String>();
      for (Task t : openTasks) {
        lines.add(
          '- ' +
            t.Subject +
            ' — ' +
            (t.Owner == null ? 'unassigned' : t.Owner.Name) +
            (t.ActivityDate == null ? '' : ', due ' + t.ActivityDate.format()) +
            (t.Huddle_Owner_Unclear__c == true
              ? ' [owner unclear, needs reassignment]'
              : '')
        );
      }
      out.add(
        '\nOPEN ACTION ITEMS (' +
          openTasks.size() +
          ')\n' +
          String.join(lines, '\n')
      );
    }

    if (decisions.isEmpty()) {
      out.add(
        '\nUNRESOLVED DECISIONS\nNone. Nothing is waiting on a call that has not been made.'
      );
    } else {
      List<String> lines = new List<String>();
      for (Huddle_Open_Decision__c d : decisions) {
        Integer age = d.Days_Open__c == null
          ? 0
          : Integer.valueOf(d.Days_Open__c);
        lines.add(
          '- ' +
            d.Question__c +
            ' (open ' +
            age +
            ' day(s)' +
            (d.Needed_By__c == null
              ? ''
              : ', needed by ' + d.Needed_By__c.format()) +
            (age > Huddle_Constants.DECISION_AGING_DAYS ? ' — AGING' : '') +
            ')'
        );
      }
      out.add(
        '\nUNRESOLVED DECISIONS (' +
          decisions.size() +
          ')\n' +
          String.join(lines, '\n')
      );
    }

    return String.join(out, '\n');
  }

  private static String opportunityName(Id oppId) {
    List<Opportunity> opps = [
      SELECT Name
      FROM Opportunity
      WHERE Id = :oppId
      LIMIT 1
    ];
    return opps.isEmpty() ? 'this deal' : opps[0].Name;
  }
}
