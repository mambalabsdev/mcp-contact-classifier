# Contact Classifier MCP Server

[![Smithery](https://smithery.ai/badge/mambabuilt/mcp-contact-classifier)](https://smithery.ai/servers/mambabuilt/mcp-contact-classifier) [![Glama score](https://glama.ai/mcp/servers/mambalabsdev/mcp-contact-classifier/badges/score.svg)](https://glama.ai/mcp/servers/mambalabsdev/mcp-contact-classifier) [![MCP Registry](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fregistry.modelcontextprotocol.io%2Fv0%2Fservers%3Fsearch%3Dcom.mambabuilt%252Fmcp-contact-classifier%26limit%3D1&query=%24.servers%5B0%5D._meta%5B%22io.modelcontextprotocol.registry%2Fofficial%22%5D.status&label=mcp%20registry&color=blue)](https://registry.modelcontextprotocol.io/v0/servers?search=com.mambabuilt/mcp-contact-classifier&limit=1) [![npm version](https://img.shields.io/npm/v/@mambalabsdev/mcp-contact-classifier)](https://www.npmjs.com/package/@mambalabsdev/mcp-contact-classifier) [![npm downloads](https://img.shields.io/npm/dm/@mambalabsdev/mcp-contact-classifier)](https://www.npmjs.com/package/@mambalabsdev/mcp-contact-classifier) [![license](https://img.shields.io/github/license/mambalabsdev/mcp-contact-classifier)](https://github.com/mambalabsdev/mcp-contact-classifier/blob/main/LICENSE) [![mcpservers.org](https://img.shields.io/badge/mcpservers.org-listed-blue)](https://mcpservers.org/servers/mambalabsdev/mcp-contact-classifier)

MCP server for the Mamba Labs [Contact Classifier](https://apify.com/mambalabs/contact-classifier) actor on Apify.

Give it a job title and it returns the department and the seniority level. Give it a name and a company domain too, and it also checks whether that person is still listed on their employer's own website. The classification is a deterministic rule table, so it needs no API key and returns the same answer for the same title every time.

## Install

```bash
npx -y @mambalabsdev/mcp-contact-classifier
```

### Claude Desktop

```json
{
  "mcpServers": {
    "mamba-contact-classifier": {
      "command": "npx",
      "args": ["-y", "@mambalabsdev/mcp-contact-classifier"],
      "env": { "APIFY_TOKEN": "your-apify-token" }
    }
  }
}
```

Get an Apify token at [console.apify.com/account/integrations](https://console.apify.com/account/integrations).

## Tool

### `classify_contact`

One contact in, one classified row out. Only the job title is required.

| Input | Type | Required | Notes |
| --- | --- | --- | --- |
| `job_title` | string | yes | The contact's job title, exactly as you hold it. Classified by deterministic rules with no API key needed. |
| `full_name` | string | no | Only needed for position verification. Classification works without it. This name is never sent to any language model. |
| `company_domain` | string | no | Only needed for position verification. The company's website domain, with or without https. |
| `verify_position` | boolean | no | Check whether the person is still listed on their employer's own website. Adds roughly 3 seconds and 9 requests per contact, and needs both the name and the domain. Default `false`. |
| `use_llm_fallback` | boolean | no | Sends titles the rules cannot place to your own model, using the `LLM_API_KEY` secret environment variable on your own copy of the actor. Only the title is sent, never the person's name. Default `false`. |
| `llm_provider` | enum | no | `openai`, `anthropic` or `google`. Which provider your `LLM_API_KEY` belongs to. Only read when the LLM fallback is on. Default `openai`. |
| `llm_model` | string | no | Model id passed straight through to the provider. Only read when the LLM fallback is on. Default `gpt-4o-mini`. |
| `skipCache` | enum | no | Set to `true` to ignore cached results and classify from scratch. Default `false`. |

## Reading the output

21 flat `snake_case` fields, one row per contact. `department` is one of 12, `seniority` one of 12, and `seniority_rank` is 1 to 12 so a decision maker filter is a comparison rather than a list of strings. `classification_rule` names the rule that fired, which is what makes the decision auditable.

With no `LLM_API_KEY` set, titles the rules cannot place come back null. The row is still returned.

## Billing

You are charged per contact classified, plus a small actor start fee. The deterministic classification calls no model and no third party API.

Pricing is on the [actor's Apify page](https://apify.com/mambalabs/contact-classifier). Running this server consumes Apify credits.

## What this server does and does not do

It is a thin client for the Apify actor. It passes your input through and returns the actor's output unchanged. Every behavior described above lives in the actor, not here.

This actor does not discover people. The name and title come from you. It classifies a title and, optionally, checks a name against a page the employer published. To find people in the first place, use [People Finder](https://apify.com/mambalabs/people-finder).

Errors are surfaced, never swallowed. An invalid input, an invalid token, an exhausted balance, a timeout, or a run that returns anything other than a dataset all come back as an explicit tool error rather than as an empty result.

## Source

The actor is on the [Apify Store](https://apify.com/mambalabs/contact-classifier). This wrapper is [MIT licensed](LICENSE).

Built by [Mamba Labs](https://apify.com/mambalabs)
