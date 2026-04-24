#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PlanLimits {
    pub name: &'static str,
    pub evidence_events_per_month: u64,
    pub runs_per_month: u64,
    pub events_per_run: u64,
}

pub fn get_plans() -> Vec<PlanLimits> {
    vec![
        PlanLimits {
            name: "free",
            evidence_events_per_month: 2_500,
            runs_per_month: 25,
            events_per_run: 1_000,
        },
        PlanLimits {
            name: "pro",
            evidence_events_per_month: 250_000,
            runs_per_month: 2_500,
            events_per_run: 10_000,
        },
        PlanLimits {
            name: "team",
            evidence_events_per_month: 1_000_000,
            runs_per_month: 10_000,
            events_per_run: 20_000,
        },
    ]
}

pub fn resolve_plan(_api_key: &str) -> &'static str {
    // TEMP: default to "free"
    // if team mapping exists, use it.
    //
    // This is intentionally static for now: until we have stable API-key → team/plan metadata,
    // we do not attempt any DB lookups here.
    "free"
}

pub fn plan_limits_by_name(name: &str) -> Option<PlanLimits> {
    get_plans().into_iter().find(|p| p.name == name)
}
