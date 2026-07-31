/**
 * Topic 2, Create Action Items. Turns each action item the meeting named into a
 * Task assigned to the person it was meant for.
 *
 * This is the riskiest thing Huddle does, because the Tasks land on people other
 * than the one entering the notes. So it is two-phase: apply=false returns the
 * full assignment preview (who is getting what, due when, and where Huddle is
 * unsure) and writes nothing; apply=true creates the Tasks only after the attendee
 * has confirmed that preview in the conversation.
 *
 * Where an owner cannot be resolved, the Task is still created, flagged
 * Huddle_Owner_Unclear__c and parked with the note-taker, rather than being handed
 * to a plausible-looking user. Guessing here is worse than admitting ignorance.
 */
public with sharing class Huddle_CreateActionItemsInvocable {
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

    @InvocableVariable(
      label='Rep User Id'
      description='The attendee entering the notes.'
    )
    public String repUserId;

    @InvocableVariable(
      label='Apply'
      description='False to preview the assignments without writing. True only after the attendee has confirmed.'
    )
    public Boolean apply;

    @InvocableVariable(
      label='Owner Overrides'
      description='Optional corrections from the confirmation step, one per line as itemNumber=Name or itemNumber=UserId.'
    )
    public String ownerOverrides;

    @InvocableVariable(
      label='Skip Items'
      description='Optional comma-separated item numbers the attendee said were wrong and should not be created.'
    )
    public String skipItems;
  }

  public class Response {
    @InvocableVariable
    public Boolean success;
    @InvocableVariable
    public Boolean applied;
    @InvocableVariable
    public Integer taskCount;
    @InvocableVariable
    public Integer unresolvedOwnerCount;
    @InvocableVariable
    public String assignments;
    @InvocableVariable
    public String summary;
  }

  /** One action item joined to the owner Huddle resolved (or failed to resolve) for it. */
  private class Planned {
    Integer itemNumber;
    Huddle_MeetingParse.ActionItem item;
    Id ownerId;
    String ownerLabel;
    Boolean ownerUnclear;
    String unclearReason;
    Date dueDate;
  }

  @InvocableMethod(
    label='Huddle: Create Action Items'
    description='Previews or creates one Task per action item from the strategy meeting, assigned to the person the meeting named.'
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
    r.applied = req.apply == true;
    Id repId = Huddle_Util.toIdOrRunningUser(req.repUserId);
    Id logId = Huddle_Util.toIdOrNull(req.strategyLogId);
    Id oppId = resolveOpportunity(req.opportunityId, logId);

    Huddle_MeetingParse parse = Huddle_ExtractionService.resolve(
      logId,
      req.meetingRecap
    );

    if (parse.actionItems.isEmpty()) {
      r.success = true;
      r.taskCount = 0;
      r.unresolvedOwnerCount = 0;
      r.summary = parse.lowConfidence
        ? 'The recap was too vague to pull out any action items. Ask who agreed to do what before creating tasks.'
        : 'No action items were stated in the meeting, so nothing was created. Huddle only creates tasks for work someone actually committed to.';
      return r;
    }

    // "By Friday" was said in the meeting, so the clock starts there. A huddle
    // written up late produces tasks that are already overdue, which is the truth.
    List<Planned> plan = buildPlan(parse, repId, req, meetingDateFor(logId));

    if (!r.applied) {
      // Preview only. Nothing is written until the attendee confirms this list.
      r.success = true;
      r.taskCount = plan.size();
      r.unresolvedOwnerCount = countUnclear(plan);
      r.assignments = describe(plan);
      r.summary =
        'Proposed ' +
        plan.size() +
        ' action item(s) from the meeting. Confirm the assignments below before anything is created:\n' +
        r.assignments +
        (r.unresolvedOwnerCount > 0
          ? '\n\n' +
            r.unresolvedOwnerCount +
            ' item(s) have no owner Huddle can resolve. Confirming as-is parks them with you, flagged for reassignment; or tell me who owns them.'
          : '');
      return r;
    }

    List<Task> tasks = new List<Task>();
    for (Planned p : plan) {
      tasks.add(
        new Task(
          Subject = Huddle_Util.clip(p.item.text, 255),
          ActivityDate = p.dueDate,
          OwnerId = p.ownerId,
          WhatId = oppId,
          Status = 'Not Started',
          Priority = 'Normal',
          Description = buildDescription(p),
          Huddle_Generated__c = true,
          Huddle_Owner_Unclear__c = p.ownerUnclear,
          Huddle_Source_Strategy_Log__c = logId
        )
      );
    }
    insert tasks;

    List<Huddle_Change_Log__c> audit = new List<Huddle_Change_Log__c>();
    for (Integer i = 0; i < tasks.size(); i++) {
      audit.add(
        Huddle_ChangeLogService.buildTaskCreated(
          tasks[i],
          logId,
          oppId,
          repId,
          true, // reaching apply=true means the attendee confirmed the preview
          plan[i].ownerUnclear
        )
      );
    }
    Huddle_ChangeLogService.insertLogs(audit);

    r.success = true;
    r.taskCount = tasks.size();
    r.unresolvedOwnerCount = countUnclear(plan);
    r.assignments = describe(plan);
    r.summary =
      'Created ' +
      tasks.size() +
      ' action item(s):\n' +
      r.assignments +
      (r.unresolvedOwnerCount > 0
        ? '\n\n' +
          r.unresolvedOwnerCount +
          ' were flagged "owner unclear" and parked with you to reassign.'
        : '');
    return r;
  }

  /** Join extracted items to resolved owners, applying the attendee's corrections. */
  private static List<Planned> buildPlan(
    Huddle_MeetingParse parse,
    Id repId,
    Request req,
    Date meetingDate
  ) {
    Map<Integer, String> overrides = parseOverrides(req.ownerOverrides);
    Set<Integer> skips = parseSkips(req.skipItems);

    List<String> hints = new List<String>();
    for (Integer i = 0; i < parse.actionItems.size(); i++) {
      Integer itemNumber = i + 1;
      hints.add(
        overrides.containsKey(itemNumber)
          ? overrides.get(itemNumber)
          : parse.actionItems[i].ownerHint
      );
    }
    Map<String, Huddle_OwnerResolver.Resolution> resolutions = Huddle_OwnerResolver.resolveAll(
      hints,
      repId
    );

    List<Planned> plan = new List<Planned>();
    for (Integer i = 0; i < parse.actionItems.size(); i++) {
      Integer itemNumber = i + 1;
      if (skips.contains(itemNumber)) {
        continue;
      }
      Huddle_MeetingParse.ActionItem item = parse.actionItems[i];
      String hintText = hints[i];

      // An override given as a raw user id is taken at face value: the attendee
      // picked it explicitly, which is stronger evidence than any extraction.
      Id overrideId = overrides.containsKey(itemNumber)
        ? Huddle_Util.toIdOrNull(overrides.get(itemNumber))
        : null;

      Planned p = new Planned();
      p.itemNumber = itemNumber;
      p.item = item;
      p.dueDate = meetingDate
        .addDays(
          item.dueInDays == null
            ? Huddle_Constants.DEFAULT_ACTION_DUE_DAYS
            : item.dueInDays
        );

      if (overrideId != null) {
        p.ownerId = overrideId;
        p.ownerLabel = String.valueOf(overrideId);
        p.ownerUnclear = false;
      } else {
        Huddle_OwnerResolver.Resolution res = resolutions.get(
          Huddle_OwnerResolver.normalizeKey(hintText)
        );
        if (res != null && res.resolved) {
          p.ownerId = res.userId;
          p.ownerLabel = res.userName;
          p.ownerUnclear = false;
        } else {
          // Park it with the note-taker, flagged, rather than guessing.
          p.ownerId = repId;
          p.ownerLabel = 'unassigned (parked with you)';
          p.ownerUnclear = true;
          p.unclearReason = res == null
            ? 'The recap named no owner for this item.'
            : res.reason;
        }
      }
      plan.add(p);
    }
    return plan;
  }

  private static String buildDescription(Planned p) {
    String body =
      'Auto-created by Huddle from an internal deal-strategy meeting.\n\n' +
      'From the recap: "' +
      p.item.sourceSentence +
      '"';
    if (String.isNotBlank(p.item.ownerHint)) {
      body += '\nOwner named in the meeting: ' + p.item.ownerHint;
    }
    if (p.ownerUnclear) {
      body += '\n\n' + Huddle_Constants.OWNER_UNCLEAR_NOTE;
      if (String.isNotBlank(p.unclearReason)) {
        body += '\nReason: ' + p.unclearReason;
      }
    }
    return Huddle_Util.clip(body, 32000);
  }

  private static String describe(List<Planned> plan) {
    List<String> lines = new List<String>();
    for (Planned p : plan) {
      lines.add(
        p.itemNumber +
          '. "' +
          p.item.text +
          '" → ' +
          p.ownerLabel +
          ', due ' +
          p.dueDate.format() +
          (p.ownerUnclear ? ' [OWNER UNCLEAR: ' + p.unclearReason + ']' : '')
      );
    }
    return String.join(lines, '\n');
  }

  private static Integer countUnclear(List<Planned> plan) {
    Integer n = 0;
    for (Planned p : plan) {
      if (p.ownerUnclear) {
        n++;
      }
    }
    return n;
  }

  private static Map<Integer, String> parseOverrides(String raw) {
    Map<Integer, String> out = new Map<Integer, String>();
    if (String.isBlank(raw)) {
      return out;
    }
    for (String line : raw.split('\n')) {
      List<String> parts = line.split('=', 2);
      if (parts.size() != 2) {
        continue;
      }
      try {
        out.put(Integer.valueOf(parts[0].trim()), parts[1].trim());
      } catch (Exception e) {
        // A malformed override is ignored rather than applied to the wrong item.
        continue;
      }
    }
    return out;
  }

  private static Set<Integer> parseSkips(String raw) {
    Set<Integer> out = new Set<Integer>();
    if (String.isBlank(raw)) {
      return out;
    }
    for (String part : raw.split(',')) {
      try {
        out.add(Integer.valueOf(part.trim()));
      } catch (Exception e) {
        continue;
      }
    }
    return out;
  }

  /** When the huddle happened; due-date cues are relative to it, not to today. */
  private static Date meetingDateFor(Id strategyLogId) {
    if (strategyLogId == null) {
      return Date.today();
    }
    List<Huddle_Strategy_Log__c> logs = [
      SELECT Meeting_Date__c
      FROM Huddle_Strategy_Log__c
      WHERE Id = :strategyLogId
      WITH USER_MODE
      LIMIT 1
    ];
    if (logs.isEmpty() || logs[0].Meeting_Date__c == null) {
      return Date.today();
    }
    return logs[0].Meeting_Date__c;
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
      WITH USER_MODE
      LIMIT 1
    ];
    return logs.isEmpty() ? null : logs[0].Opportunity__c;
  }
}
