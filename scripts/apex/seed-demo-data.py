#!/usr/bin/env python3
"""
Seed Huddle with realistic demo data.

Everything is created by calling Huddle's own invocables, so the strategy logs,
Tasks, open decisions and audit rows all come out of the real pipeline rather
than being hand-inserted to look right. Extraction genuinely runs on each recap.

Each deal is seeded in its own anonymous-Apex transaction, because one execution
covering every deal would blow the 100-SOQL governor limit.

Usage:
    python3 scripts/apex/seed-demo-data.py --org <username-or-alias>
    python3 scripts/apex/seed-demo-data.py --org <username-or-alias> --clean
"""

import argparse
import json
import subprocess
import sys
import tempfile
from datetime import date, timedelta

DEMO_TAG = "Huddle Demo"

# Recaps are written the way people actually talk in a deal review. They exercise
# the extraction rules on purpose: group decisions with no owner (must NOT become
# tasks), first-person commitments (resolve to the running user), named people who
# aren't users (must be flagged "owner unclear"), and explicit open questions.
DEALS = [
    {
        "account": f"{DEMO_TAG} - Northwind Traders",
        "opportunity": "Northwind Traders - Platform Migration",
        "stage": "Negotiation/Review",
        "amount": 180000,
        "close_in_days": 24,
        "meetings": [
            {
                "days_ago": 38,
                "attendees": "Alex Imperiale, Dana Whitlock",
                "recap": (
                    "Attendees: Alex Imperiale, Dana Whitlock\n"
                    "We agreed to hold the discount until legal review completes, because finance "
                    "flagged margin risk on this deal shape. The plan is to lead with the migration "
                    "story rather than price, since their whole evaluation is really about downtime. "
                    "I will draft the mutual action plan tomorrow. "
                    "Dana Whitlock needs to pull together the downtime benchmark data by Friday. "
                    "We still need to decide whether to bring their CISO in before the next call."
                ),
            },
            {
                "days_ago": 17,
                "attendees": "Alex Imperiale, Dana Whitlock",
                "recap": (
                    "Legal came back clean, so we decided to put the 12 percent discount on the table "
                    "at the next session because their procurement cycle closes end of month and we "
                    "would rather trade the discount for a faster signature. "
                    "I'll send the revised quote this week. "
                    "The open question is whether we hold firm on the three year term or let them "
                    "take two."
                ),
            },
            {
                "days_ago": 3,
                "attendees": "Alex Imperiale",
                "recap": (
                    "Quick huddle before the exec readout. The approach is to open with the downtime "
                    "numbers and only talk price if they raise it, since the CFO is the one who "
                    "pushed back last time. I'll build the readout deck tomorrow and I will confirm "
                    "the attendee list with their EA today."
                ),
            },
        ],
    },
    {
        "account": f"{DEMO_TAG} - Acme Logistics",
        "opportunity": "Acme Logistics - Fleet Analytics",
        "stage": "Proposal/Price Quote",
        "amount": 95000,
        "close_in_days": 12,
        "meetings": [
            {
                "days_ago": 29,
                "attendees": "Alex Imperiale, Marco Bell",
                "recap": (
                    "Attendees: Alex Imperiale, Marco Bell\n"
                    "We decided to scope the pilot to two depots rather than the full fleet, because "
                    "their data quality is poor outside the main hub and a bad pilot would kill the "
                    "whole account. The plan is to price the pilot at cost and make the money back on "
                    "the rollout. "
                    "Marco Bell will build the depot readiness checklist next week. "
                    "I'll write up the pilot success criteria this week. "
                    "We still need to decide who owns data cleanup on their side."
                ),
            },
            {
                "days_ago": 9,
                "attendees": "Alex Imperiale",
                "recap": (
                    "Their ops lead went quiet, so we agreed to route through the CFO instead since "
                    "she sponsored the original budget request. I will reach out to her tomorrow. "
                    "Open question is whether we push the close date out a quarter or force the issue "
                    "before their fiscal year ends."
                ),
            },
        ],
    },
    {
        "account": f"{DEMO_TAG} - Vertex Health",
        "opportunity": "Vertex Health - Compliance Suite",
        "stage": "Needs Analysis",
        "amount": 240000,
        "close_in_days": 62,
        "meetings": [
            {
                "days_ago": 44,
                "attendees": "Alex Imperiale, Priya Raman",
                "recap": (
                    "Attendees: Alex Imperiale, Priya Raman\n"
                    "The plan is to run a technical deep dive before we talk commercials, because "
                    "their security team has veto power and has killed two vendors already this year. "
                    "The sales engineer will build the demo environment next week. "
                    "Priya Raman will put together the security questionnaire response by Friday. "
                    "I'll set up the deep dive session this week. "
                    "We still need to decide whether we can commit to their data residency "
                    "requirement before the next call."
                ),
            },
            {
                "days_ago": 21,
                "attendees": "Alex Imperiale, Priya Raman",
                "recap": (
                    "Deep dive went well. We agreed to propose the enterprise tier rather than "
                    "professional, since the audit logging they need is only in enterprise and "
                    "downgrading now would mean a painful upgrade conversation in six months. "
                    "I will rework the pricing model this week. "
                    "Open question is how we handle their request for source code escrow."
                ),
            },
            {
                "days_ago": 6,
                "attendees": "Alex Imperiale",
                "recap": (
                    "Their compliance officer joined late and raised concerns about our subprocessor "
                    "list. We decided to get ahead of it rather than wait, because the last thing we "
                    "want is a security surprise in week ten. I'll pull the current subprocessor "
                    "documentation tomorrow."
                ),
            },
        ],
    },
    {
        "account": f"{DEMO_TAG} - Bluepeak Media",
        "opportunity": "Bluepeak Media - Enterprise Rollout",
        "stage": "Value Proposition",
        "amount": 310000,
        "close_in_days": 78,
        "meetings": [
            {
                "days_ago": 33,
                "attendees": "Alex Imperiale, Jess Whitfield",
                "recap": (
                    "Attendees: Alex Imperiale, Jess Whitfield\n"
                    "We agreed to go wide rather than deep on this one, because their org is "
                    "federated and no single buyer can sign for everyone. The approach is to land one "
                    "business unit and use it as the reference. "
                    "Jess Whitfield will map the stakeholder tree next week. "
                    "I'll draft the business unit landing plan this week. "
                    "We still need to decide which business unit we target first."
                ),
            },
            {
                "days_ago": 11,
                "attendees": "Alex Imperiale",
                "recap": (
                    "Picked the streaming unit as the beachhead since their VP already uses us at a "
                    "previous employer and is a warm champion. I will get an intro call booked "
                    "tomorrow. The open question is whether we discount the beachhead deal to buy the "
                    "reference."
                ),
            },
        ],
    },
    {
        "account": f"{DEMO_TAG} - Corvus Bank",
        "opportunity": "Corvus Bank - Data Residency Program",
        "stage": "Qualification",
        "amount": 420000,
        "close_in_days": 95,
        "meetings": [
            {
                "days_ago": 26,
                "attendees": "Alex Imperiale, Dana Whitlock",
                "recap": (
                    "Attendees: Alex Imperiale, Dana Whitlock\n"
                    "Big one but early. We decided not to chase this quarter, because the budget "
                    "does not exist until their next planning cycle and burning the champion on a "
                    "premature push would cost us the deal. The plan is to stay warm and build the "
                    "business case with them. "
                    "I'll schedule a monthly check in this week. "
                    "Dana Whitlock needs to draft the ROI model next week. "
                    "We still need to decide whether this stays in the forecast at all."
                ),
            },
            {
                "days_ago": 2,
                "attendees": "Alex Imperiale",
                "recap": (
                    "Champion flagged that a competitor is running a POC. We agreed to accelerate the "
                    "business case rather than match the POC, since we cannot staff a POC this "
                    "quarter and a rushed one would lose on its own merits. I will finish the ROI "
                    "narrative this week."
                ),
            },
        ],
    },
]


def run_apex(org, body, label):
    """Execute anonymous Apex, returning (ok, combined_output)."""
    with tempfile.NamedTemporaryFile("w", suffix=".apex", delete=False) as fh:
        fh.write(body)
        path = fh.name
    proc = subprocess.run(
        ["sf", "apex", "run", "--target-org", org, "--file", path, "--json"],
        capture_output=True,
        text=True,
    )
    out = proc.stdout or proc.stderr
    try:
        result = json.loads(out).get("result", {})
        ok = result.get("success", False) and result.get("compiled", False)
        detail = result.get("compileProblem") or result.get("exceptionMessage") or ""
        logs = result.get("logs", "")
    except json.JSONDecodeError:
        ok, detail, logs = False, out[:400], ""
    marker = [ln for ln in logs.splitlines() if "SEED_RESULT" in ln]
    print(f"  {'ok ' if ok else 'FAILED'} {label}" + (f"  {detail}" if detail else ""))
    for m in marker:
        print("      " + m.split("SEED_RESULT:")[-1].strip())
    return ok, logs


def apex_str(value):
    """Quote a Python string as an Apex string literal."""
    escaped = value.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n")
    return f"'{escaped}'"


def build_deal_script(deal):
    today = date.today()
    close = today + timedelta(days=deal["close_in_days"])

    lines = [
        "// Seeds one deal through Huddle's real invocables.",
        f"Account a = new Account(Name = {apex_str(deal['account'])});",
        "insert a;",
        "Opportunity o = new Opportunity(",
        f"    Name = {apex_str(deal['opportunity'])},",
        "    AccountId = a.Id,",
        f"    StageName = {apex_str(deal['stage'])},",
        f"    CloseDate = Date.newInstance({close.year}, {close.month}, {close.day}),",
        f"    Amount = {deal['amount']}",
        ");",
        "insert o;",
        "Integer logged = 0, tasks = 0, decisions = 0;",
    ]

    for i, meeting in enumerate(deal["meetings"]):
        met = today - timedelta(days=meeting["days_ago"])
        lines += [
            "",
            f"// --- meeting {i + 1}, held {meeting['days_ago']} days ago ---",
            f"Huddle_LogStrategyInvocable.Request lr{i} = new Huddle_LogStrategyInvocable.Request();",
            f"lr{i}.meetingRecap = {apex_str(meeting['recap'])};",
            f"lr{i}.opportunityId = o.Id;",
            f"lr{i}.meetingDate = '{met.isoformat()}';",
            f"lr{i}.attendees = {apex_str(meeting['attendees'])};",
            f"String logId{i} = Huddle_LogStrategyInvocable.run("
            f"new List<Huddle_LogStrategyInvocable.Request>{{ lr{i} }})[0].strategyLogId;",
            "logged++;",
            "",
            f"Huddle_CreateActionItemsInvocable.Request cr{i} = new Huddle_CreateActionItemsInvocable.Request();",
            f"cr{i}.strategyLogId = logId{i};",
            f"cr{i}.opportunityId = o.Id;",
            f"cr{i}.apply = true;  // the rep confirmed the assignment preview",
            f"tasks += Huddle_CreateActionItemsInvocable.run("
            f"new List<Huddle_CreateActionItemsInvocable.Request>{{ cr{i} }})[0].taskCount;",
            "",
            f"Huddle_IdentifyOpenDecisionsInvocable.Request dr{i} = new Huddle_IdentifyOpenDecisionsInvocable.Request();",
            f"dr{i}.strategyLogId = logId{i};",
            f"dr{i}.opportunityId = o.Id;",
            f"decisions += Huddle_IdentifyOpenDecisionsInvocable.run("
            f"new List<Huddle_IdentifyOpenDecisionsInvocable.Request>{{ dr{i} }})[0].decisionCount;",
        ]

    lines += [
        "",
        "System.debug('SEED_RESULT: ' + o.Name + ' -> ' + logged + ' sessions, ' "
        "+ tasks + ' action items, ' + decisions + ' open decisions');",
    ]
    return "\n".join(lines)


# Progress is applied after seeding so the dashboard shows movement rather than a
# wall of untouched records: older work is likelier to be done.
FINISH_SCRIPT = """
// Close out a realistic share of the seeded work.
List<Task> tasks = [
    SELECT Id, Status, ActivityDate, Huddle_Owner_Unclear__c
    FROM Task
    WHERE Huddle_Generated__c = TRUE AND Status != 'Completed'
    ORDER BY ActivityDate ASC
];
List<Task> toClose = new List<Task>();
Integer i = 0;
for (Task t : tasks) {
    // Roughly the older 55%, and never one Huddle could not confidently assign:
    // an unclear owner is exactly the thing that does NOT quietly get done.
    if (i < tasks.size() * 0.55 && t.Huddle_Owner_Unclear__c != true) {
        t.Status = 'Completed';
        toClose.add(t);
    }
    i++;
}
update toClose;

List<Huddle_Open_Decision__c> open = [
    SELECT Id, Status__c, Resolution__c, Raised_On__c
    FROM Huddle_Open_Decision__c
    WHERE Status__c = 'Open'
    ORDER BY Raised_On__c ASC
];
List<Huddle_Open_Decision__c> resolved = new List<Huddle_Open_Decision__c>();
List<Huddle_Change_Log__c> audit = new List<Huddle_Change_Log__c>();
Integer j = 0;
for (Huddle_Open_Decision__c d : open) {
    // Resolve the oldest third; the rest stay open and age, which is what the
    // aging card exists to surface.
    if (j < open.size() / 3) {
        d.Status__c = 'Resolved';
        d.Resolution__c = 'Settled in the following deal review.';
        resolved.add(d);
    }
    j++;
}
update resolved;

// Resolving a decision is a Huddle action, so it gets its audit row like anything else.
for (Huddle_Open_Decision__c d : [
    SELECT Id, Question__c, Resolution__c, Strategy_Log__c, Opportunity__c
    FROM Huddle_Open_Decision__c
    WHERE Id IN :resolved
]) {
    audit.add(Huddle_ChangeLogService.buildDecisionResolved(d, UserInfo.getUserId()));
}
Huddle_ChangeLogService.insertLogs(audit);

System.debug('SEED_RESULT: completed ' + toClose.size() + ' tasks, resolved ' + resolved.size() + ' decisions');
"""

CLEAN_SCRIPT = f"""
// Remove everything this seeder created. Change logs go last: they are the audit
// trail for the rest, so nothing is orphaned mid-delete.
List<Opportunity> opps = [
    SELECT Id FROM Opportunity WHERE Account.Name LIKE '{DEMO_TAG}%'
];
delete [SELECT Id FROM Task WHERE Huddle_Generated__c = TRUE AND WhatId IN :opps];
delete [SELECT Id FROM Huddle_Change_Log__c WHERE Opportunity__c IN :opps];
delete [SELECT Id FROM Huddle_Open_Decision__c WHERE Opportunity__c IN :opps];
delete [SELECT Id FROM Huddle_Strategy_Log__c WHERE Opportunity__c IN :opps];
delete opps;
delete [SELECT Id FROM Account WHERE Name LIKE '{DEMO_TAG}%'];
System.debug('SEED_RESULT: demo data removed');
"""


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--org", required=True, help="target org username or alias")
    parser.add_argument(
        "--clean", action="store_true", help="delete the demo data instead of creating it"
    )
    args = parser.parse_args()

    if args.clean:
        print("Removing Huddle demo data...")
        ok, _ = run_apex(args.org, CLEAN_SCRIPT, "cleanup")
        return 0 if ok else 1

    print(f"Seeding {len(DEALS)} deals into {args.org} (one transaction each)...")
    failures = 0
    for deal in DEALS:
        ok, _ = run_apex(args.org, build_deal_script(deal), deal["opportunity"])
        failures += 0 if ok else 1

    print("Applying completion and resolution...")
    ok, _ = run_apex(args.org, FINISH_SCRIPT, "progress pass")
    failures += 0 if ok else 1

    if failures:
        print(f"\n{failures} step(s) failed.")
        return 1
    print("\nDone. Open the Huddle app to see it.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
