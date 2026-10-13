# Integrating an External SOAP Partner — Code Execution Service

*(Design-only deliverable — no server implements this; see note at the
bottom on why.)*

## 1. Context & why SOAP here

CollabCode's "Run Code" feature lets a user execute the code currently in
a room's document and see the output. That execution has to happen in an
isolated sandbox we don't operate ourselves, so it's handled by an
external **Code Execution partner** (think Judge0/Piston-style services).

Every other integration in this project is REST (Rooms ↔ Documents, both
ours). This one is different: it crosses a trust and operational boundary
to a third party, the operation can fail in several distinct, important
ways (compile error vs. runtime error vs. timeout vs. unsupported
language), and the caller needs to branch on *which* kind of failure
happened, not just get a generic error. SOAP's WSDL gives us a single
machine-checkable contract (request shape, response shape, and a
dedicated fault structure) that both sides can validate against before
a single byte is sent — a stronger guarantee than "please return JSON
shaped roughly like this," which is what a REST call here would amount
to. For an operation we don't control the other end of and whose typed
failure modes matter more than raw speed, that contract-first strictness
is worth SOAP's extra verbosity.

## 2. WSDL

See `partner.wsdl` in this folder. Summary of its parts:
- **types** — `RunCodeRequest` (`language`, `sourceCode`, `stdin?`,
  `timeoutMs?`) and `RunCodeResponse` (`stdout`, `stderr`, `exitCode`,
  `durationMs`).
- **message** — wraps each type for SOAP's envelope.
- **portType** — one operation, `RunCode`, input message → output message.
- **binding** — binds `RunCode` to SOAP over HTTP, `document/literal` style.
- **service** — the partner's actual endpoint URL.

## 3. Sample SOAP envelopes

- `soap-request.xml` — a `RunCode` call for a short Python snippet.
- `soap-response.xml` — a successful response (stdout + exit code 0).
- `soap-fault.xml` — a `<soap:Fault>` for a request that timed out.

## 4. HTTP binding

- **Method:** `POST` (SOAP always rides on POST; the envelope *is* the body)
- **Endpoint:** `https://partner.codesandbox-example.com/soap/execute`
- **Headers:**
  - `Content-Type: text/xml; charset=utf-8`
  - `SOAPAction: "http://collabcode.dev/soap/RunCode"` — tells the
    partner's dispatcher which operation this envelope is for, without
    it needing to parse the body first.

## 5. Discovery

The partner publishes its WSDL at a well-known URL
(`https://partner.codesandbox-example.com/soap/execute?wsdl`), which is
how we (and our tooling, e.g. `soap`/`zeep`-style clients) discover the
operation's exact shape without hand-writing a client from documentation
alone. In a larger org this WSDL URL would also be registered in an
internal service registry/catalog alongside our own REST services'
OpenAPI specs, so anyone on the team can find "how do I call Code
Execution" in one place.

## 6. Fault mapping

The partner's `<soap:Fault>` responses get translated into our own
`problem+json` shape (the same one every REST error in this project
uses — see `rooms-service/src/errors.js`) at the boundary, so the rest
of the system never has to know SOAP was involved at all:

| Partner SOAP fault code | Meaning | Mapped to our `problem` |
|---|---|---|
| `partner:CompileError` | Source didn't compile | `400` `type: compile-error` |
| `partner:RuntimeError` | Threw/crashed while running | `200` `type: runtime-error` (execution itself "succeeded" — the *code* failed, which is a normal, expected outcome to show the user, not a system error) |
| `partner:Timeout` | Exceeded `timeoutMs` | `504` `type: execution-timeout` |
| `partner:UnsupportedLanguage` | `language` not supported | `422` `type: unsupported-language` |
| *(connection refused / SOAP envelope malformed / no fault at all)* | Partner unreachable | `502` `type: partner-unavailable` |

## 7. Why this stays design-only

Unlike Assignment 4 (REST), this assignment explicitly asks for the
*contract* — WSDL, envelopes, HTTP binding, discovery, fault mapping —
not a running implementation, and we don't have a real sandbox-execution
partner to integrate against. Standing up a fake SOAP server would add
code that doesn't demonstrate anything beyond what the WSDL and sample
envelopes already show. If "Run Code" becomes a real feature later, this
document is the spec to build the mock/real integration against.
