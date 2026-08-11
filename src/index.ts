#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(join(here, "..", "package.json"), "utf8"),
) as { version: string; name: string };

// Distinctive UA so Apify run meta.userAgent marks MCP-originated runs.
const USER_AGENT = `mambalabs-mcp ${pkg.name}@${pkg.version}`;

type ToolResult = {
  isError?: boolean;
  content: Array<{ type: "text"; text: string }>;
};

// Drop undefined values so optional inputs are not sent to the actor.
function compact(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

// Shared caller. actorPath is the actor's immutable Apify actor ID (a stable key
// that survives Store renames). The /v2/acts/{id} endpoint accepts it directly,
// so a Store rename never breaks these calls.
//
// The token is read here rather than at module load, so the tool registers
// unconditionally and a server started without APIFY_TOKEN still advertises its
// capabilities instead of reporting none.
async function runActor(
  actorPath: string,
  actorLabel: string,
  input: Record<string, unknown>,
): Promise<ToolResult> {
  const APIFY_TOKEN = process.env.APIFY_TOKEN;
  if (!APIFY_TOKEN) {
    return { isError: true, content: [{ type: "text", text: "APIFY_TOKEN is not set. Create a token at https://console.apify.com/account/integrations and set it as the APIFY_TOKEN environment variable." }] };
  }

  const url = `https://api.apify.com/v2/acts/${actorPath}/run-sync-get-dataset-items?timeout=300`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${APIFY_TOKEN}`,
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify(input),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { isError: true, content: [{ type: "text", text: `Could not reach the Apify API: ${message}` }] };
  }

  if (!response.ok) {
    let detail = "";
    try {
      const body = (await response.json()) as { error?: { message?: string } };
      if (body?.error?.message) detail = ` ${body.error.message}`;
    } catch {
      detail = "";
    }

    let message: string;
    switch (response.status) {
      case 400:
        message = `The ${actorLabel} run was rejected as invalid input.${detail}`;
        break;
      case 401:
        message = "Invalid Apify token. Check your APIFY_TOKEN environment variable.";
        break;
      case 402:
        message =
          "Insufficient Apify credits. Check your account balance at https://console.apify.com/billing";
        break;
      case 408:
        message = `The ${actorLabel} run timed out after 300 seconds. Ask for less per call, or run the actor on Apify directly for larger jobs.`;
        break;
      default:
        message = `Apify request to ${actorLabel} failed with status ${response.status}.${detail}`;
    }
    return { isError: true, content: [{ type: "text", text: message }] };
  }

  // A 2xx from run-sync-get-dataset-items normally carries the dataset array.
  // Anything else on this path is a failure the caller must see, never an empty
  // success: surfacing it here is what keeps a failed run from reading as "no
  // results found".
  let items: unknown;
  try {
    items = await response.json();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { isError: true, content: [{ type: "text", text: `The ${actorLabel} run returned a response that could not be parsed: ${message}` }] };
  }

  if (!Array.isArray(items)) {
    const asObj = items as { error?: { type?: string; message?: string } };
    const detail = asObj?.error?.message
      ? `${asObj.error.message}`
      : JSON.stringify(items);
    return { isError: true, content: [{ type: "text", text: `The ${actorLabel} run did not return a dataset. ${detail}` }] };
  }

  return { content: [{ type: "text", text: JSON.stringify(items, null, 2) }] };
}

const server = new McpServer({
  name: "mamba-contact-classifier",
  version: pkg.version,
});

// Contact Classifier (immutable actor ID 0lGSeYJmniXhGANnO)
server.registerTool(
  "classify_contact",
  {
    title: "Classify Contact",
    description:
      "One contact in, one classified row out. Give it a job title and it returns the department, the seniority level, a seniority_rank from 1 to 12 you can filter with a comparison, and classification_rule, the named rule that fired, so every decision is auditable. The classification is a deterministic rule table: it needs no API key, calls no model, and returns the same answer for the same title every time. Only job_title is required. full_name and company_domain are read only when verify_position is on, which checks whether the person is still listed on their employer's own website and adds roughly 3 seconds and 9 requests per contact. The optional LLM fallback for titles the rules cannot place runs on your own key, set as the LLM_API_KEY secret environment variable on your own copy of the actor, and only the title is ever sent, never the person's name. With no key set those titles come back null rather than failing the row. This actor does not discover people: the name and title come from you. Requires an APIFY_TOKEN and consumes Apify credits. Read only.",
    annotations: {
      title: "Classify Contact",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
    job_title: z.string().describe("The contact's job title, exactly as you hold it. Classified by deterministic rules with no API key needed."),
    full_name: z.string().optional().describe("Only needed for position verification. Classification works without it. This name is never sent to any language model."),
    company_domain: z.string().optional().describe("Only needed for position verification. The company's website domain, with or without https."),
    verify_position: z.boolean().optional().describe("Check whether the person is still listed on their employer's own website. Off by default. Adds roughly 3 seconds and 9 requests per contact, and needs both the name and the domain. Default: false."),
    use_llm_fallback: z.boolean().optional().describe("Off by default. When on, titles the rules cannot place are sent to your own model using the LLM_API_KEY secret environment variable you set on your copy of this Actor. Only the title is sent, never the person's name. With no key set the Actor still returns a row, it just leaves those titles null. Default: false."),
    llm_provider: z.enum(["openai", "anthropic", "google"]).optional().describe("Which provider your LLM_API_KEY belongs to. Only read when the LLM fallback is on. Default: \"openai\"."),
    llm_model: z.string().optional().describe("Model id passed straight through to the provider. Only read when the LLM fallback is on. Default: \"gpt-4o-mini\"."),
    skipCache: z.enum(["false", "true"]).optional().describe("Set to true to ignore cached results and classify from scratch. Default: \"false\"."),
    },
  },
  async (args) =>
    runActor("0lGSeYJmniXhGANnO", "Contact Classifier", compact(args as Record<string, unknown>)),
);

const transport = new StdioServerTransport();
await server.connect(transport);
