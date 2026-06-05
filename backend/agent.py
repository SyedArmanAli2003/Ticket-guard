"""PitchCraft multi-agent team (Google ADK + Gemini).

Instead of one model doing everything, PitchCraft orchestrates a TEAM of
specialist Gemini agents — each with its own role, instructions, and tools —
coordinated by the pipeline, then reviewed by a QA critic agent:

    Validator → Market Analyst → Persona Designer → Business Architect →
    Financial Modeler → Risk Officer → Action Planner → QA Critic

The Market Analyst is the data-grounded one: it uses the official MongoDB MCP
server (find/aggregate/count) and Atlas Vector Search to ground its research.
"""

from __future__ import annotations

import os

from google.adk.agents import LlmAgent
from google.adk.tools.mcp_tool.mcp_toolset import McpToolset
from google.adk.tools.mcp_tool.mcp_session_manager import StdioConnectionParams
from mcp import StdioServerParameters

import config
import db

_NPX = "npx.cmd" if os.name == "nt" else "npx"


# --------------------------------------------------------------------------- #
# Tools
# --------------------------------------------------------------------------- #
def search_market_intelligence(query: str) -> dict:
    """Semantic search over the market-intelligence corpus via Atlas Vector Search.

    Use for market size, growth, competitor weaknesses, risks, and go-to-market
    playbooks. Pass a focused natural-language query. Call at most twice.
    """
    return db.vector_search_market(query)


def find_similar_plans(industry: str) -> dict:
    """Look up prior business plans in the same market (viability + revenue signal)."""
    plans = db.find_similar_plans(industry)
    return {"results": plans, "count": len(plans)}


def build_mcp_toolset() -> McpToolset | None:
    """The official MongoDB MCP server (read-only). None if Atlas not reachable."""
    if not config.mongo_configured() or not db.is_connected():
        return None
    try:
        return McpToolset(
            connection_params=StdioConnectionParams(
                server_params=StdioServerParameters(
                    command=_NPX,
                    args=["-y", "mongodb-mcp-server",
                          "--connectionString", config.MONGODB_URI, "--readOnly"],
                ),
                timeout=90.0,
            ),
            tool_filter=["find", "aggregate", "count", "collection-schema", "list-collections"],
        )
    except Exception as exc:  # noqa: BLE001
        print(f"ℹ️  MongoDB MCP toolset unavailable ({str(exc)[:80]}).")
        return None


# --------------------------------------------------------------------------- #
# Specialist roster — each entry becomes its own Gemini LlmAgent
# --------------------------------------------------------------------------- #
_TEAM = "You are part of PitchCraft, an AI venture-analysis team. "
_JSON_RULE = (" Return ONLY one valid JSON object for your section — no prose, "
              "no markdown fences. Be concrete, specific, realistic.")

SPECIALISTS = [
    {
        "key": "validation", "name": "validator", "step": 1, "label": "Validate Idea",
        "tools": ["vector"],
        "instruction": _TEAM + "You are the IDEA VALIDATOR. Judge if the idea is "
        "viable. You MAY call search_market_intelligence ONCE to sanity-check the "
        "market. Output JSON: {\"viable\":true/false,\"viability_score\":1-10,"
        "\"one_line_summary\":\"\",\"core_problem_solved\":\"\",\"target_market\":\"\","
        "\"innovation_factor\":\"\",\"main_concerns\":[\"\",\"\"]}" + _JSON_RULE,
    },
    {
        "key": "market_research", "name": "market_analyst", "step": 2, "label": "Research Market",
        "tools": ["vector", "similar", "mcp"],
        "instruction": _TEAM + "You are the MARKET ANALYST — the data-grounded one. "
        "FIRST call search_market_intelligence (once or twice) and find_similar_plans "
        "for the target market. If MongoDB database tools are available, you may use "
        "them too. Ground every number in tool output. Output JSON: "
        "{\"market_size\":\"\",\"growth_rate\":\"\",\"top_competitors\":"
        "[{\"name\":\"\",\"weakness\":\"\"}],\"market_gap\":\"\",\"opportunity_score\":1-10}"
        + _JSON_RULE,
    },
    {
        "key": "personas", "name": "persona_designer", "step": 3, "label": "Define Audience",
        "tools": [],
        "instruction": _TEAM + "You are the CUSTOMER INSIGHTS designer. Create 3 vivid "
        "personas. Output JSON: {\"personas\":[{\"name\":\"\",\"age\":\"\",\"job\":\"\","
        "\"pain_point\":\"\",\"willingness_to_pay\":\"\",\"how_they_find_us\":\"\"}]}" + _JSON_RULE,
    },
    {
        "key": "business_plan", "name": "business_architect", "step": 4, "label": "Build Business Plan",
        "tools": [],
        "instruction": _TEAM + "You are the BUSINESS ARCHITECT. Output JSON: "
        "{\"problem\":\"\",\"solution\":\"\",\"unique_value_proposition\":\"\","
        "\"revenue_model\":\"\",\"revenue_streams\":[\"\",\"\"],\"go_to_market\":\"\","
        "\"key_milestones\":[{\"month\":1,\"milestone\":\"\"}]}" + _JSON_RULE,
    },
    {
        "key": "financials", "name": "financial_modeler", "step": 5, "label": "Financial Projections",
        "tools": [],
        "instruction": _TEAM + "You are the FINANCIAL MODELER. Build a realistic 3-year "
        "projection consistent with the revenue model in the context. Output JSON: "
        "{\"year1_revenue\":\"\",\"year2_revenue\":\"\",\"year3_revenue\":\"\","
        "\"startup_cost\":\"\",\"monthly_burn\":\"\",\"break_even_month\":12,"
        "\"funding_needed\":\"\"}" + _JSON_RULE,
    },
    {
        "key": "risks", "name": "risk_officer", "step": 6, "label": "Risk Analysis",
        "tools": [],
        "instruction": _TEAM + "You are the RISK OFFICER. Output JSON: "
        "{\"risks\":[{\"risk\":\"\",\"severity\":\"High/Medium/Low\",\"mitigation\":\"\"}],"
        "\"swot\":{\"strengths\":[\"\"],\"weaknesses\":[\"\"],\"opportunities\":[\"\"],"
        "\"threats\":[\"\"]}}" + _JSON_RULE,
    },
    {
        "key": "action_items", "name": "action_planner", "step": 7, "label": "Action Plan",
        "tools": [],
        "instruction": _TEAM + "You are the CHIEF OF STAFF. Turn the plan into action. "
        "Output JSON: {\"next_30_days\":[\"\"],\"next_60_days\":[\"\"],"
        "\"next_90_days\":[\"\"],\"investor_one_liner\":\"\",\"recommended_kpis\":[\"\"]}" + _JSON_RULE,
    },
    {
        "key": "qa_review", "name": "qa_critic", "step": 8, "label": "QA Review",
        "tools": [],
        "instruction": _TEAM + "You are the QA CRITIC. You are given the full assembled "
        "plan. Critically score its coherence, realism, and investment-readiness. "
        "Output JSON: {\"overall_score\":1-10,\"investment_ready\":true/false,"
        "\"strengths\":[\"\"],\"weaknesses\":[\"\"],\"verdict\":\"one sentence\"}" + _JSON_RULE,
    },
]


def _tools_for(spec: dict, mcp: McpToolset | None) -> list:
    tools: list = []
    if "vector" in spec["tools"]:
        tools.append(search_market_intelligence)
    if "similar" in spec["tools"]:
        tools.append(find_similar_plans)
    if "mcp" in spec["tools"] and mcp is not None:
        tools.append(mcp)
    return tools


def build_team() -> tuple[list[dict], McpToolset | None]:
    """Build the specialist agents. Returns (specs_with_agent, mcp_toolset)."""
    mcp = build_mcp_toolset()
    built = []
    for spec in SPECIALISTS:
        agent = LlmAgent(
            model=config.GEMINI_MODEL,
            name=spec["name"],
            instruction=spec["instruction"],
            tools=_tools_for(spec, mcp),
        )
        built.append({**spec, "agent": agent})
    return built, mcp
