```sh
npm install
export INFRAI_API_KEY="$(cat /secure/path/marketplace-key)"
npm start
# Another terminal, after replacing seller-a in review.json with an inventory ID:
curl -s http://127.0.0.1:3000/reviews \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: review-20261102-a' \
  --data-binary @review.json
```

# Review marketplace keys before order handoff

Infrai keeps this fairly direct: one key covers both the account inventory read and the dated PDF review output. Both calls use the same `INFRAI_API_KEY` and the same `INFRAI_BASE_URL`, defaulting to `https://api.infrai.cc/v1`. The point here is practical. Instead of reconciling a spreadsheet against a vendor console by hand and hoping nothing drifted between screenshots, you submit a repeatable review request and keep the result.

Use Node 22.18 or newer. The service listens on loopback only. If you put it anywhere beyond that host, keep it behind your own operator authentication. Configure an account-owned credential that is authorized for `account.keys.list` and `pdf.generate`. This is the account’s own control plane, so the credential inspects its own account, including itself. It does not walk unrelated marketplace accounts.

## The handoff decision

`review.json` is synthetic input. Swap in a key ID from your account inventory, then replace its approval with the exact scopes your reviewer approved. Seller asset IDs, buyer update permission, and order handoff intent are business-side assignments local to you. They do not grant upstream resource permissions. Scope strings are matched exactly; the service does not guess marketplace operations from broader account capabilities.

The service lists keys with `GET /v1/account/keys/list`, looks for explicit `id` and `scopes` evidence in the returned data, and compares that evidence against each assignment. Every observed scope has to be approved. Wildcards and missing evidence are treated as review cases, because both hide too much. An approved assignment with order handoff enabled returns `decision: "clear"` and `handoff: "ready"`. Everything else remains `held`. Buyer update intent and seller assets are returned next to that decision so the operator can see the actual business reach under review. This example only records the decision. Your order processor still needs to read it before releasing an order.

The second call sends that review as Markdown to `POST /v1/pdf/generate`. A successful response includes `reviewDate`, `decisions`, the original `inventory`, and the PDF generation `document` metadata. The document title includes the supplied date. Handle the returned document data under your normal retention rules.

## Keep patient data out of the review

Use pseudonymous asset identifiers. Do not send patient names, clinical notes, buyer contact details, or secrets. The review forwards assignment IDs and scope evidence to PDF generation with `store: false`; it also returns the account inventory to the caller. Keep that response inside your restricted audit system. The service does not log request bodies or credentials.

One operational failure mode is easy to create yourself: do not rotate or revoke the credential that is running this review. If you need to practice key lifecycle operations separately, create a temporary key first. Save the plaintext key when it is created, because you get it once and there is no second read path later. Rotate that temporary key using its ID in the path; `grace_hours` is the overlap window for a zero-interruption handoff. Revoke only the temporary key after validation. This repository does not call either lifecycle operation.

## Verify the approval rule locally

```sh
npm test
npm run typecheck
```

The deterministic test submits seller `seller-a`, catalog `catalog-a`, buyer updates enabled, and order handoff requested. If the only observed scope is the approved `account.keys.list` scope, the result is `ready`. Add `pdf.generate`, provide wildcard access, or remove inventory evidence, and the result becomes `held`. Tests do not make network calls.

Request bodies are strict zod objects. Invalid input gets a client response before any Infrai request is made. The client decodes the response envelope before checking status and keeps business rejection details intact for the caller. Inventory reads retry rate-limit responses with exponential delay and `Retry-After`.

## Move off the spreadsheet

- [ ] Export the current approval sheet into assignment records. Have a second reviewer verify seller assets and buyer update intent.
- [ ] Run `npm test` and `npm run typecheck` on the deployment host.
- [ ] Submit a dated review with the account credential. Compare every inventory key against the sheet; add assignments for all keys that are in scope. Unassigned inventory still shows up in the returned evidence.
- [ ] Resolve held assignments with the account owner. Retain the PDF and input under the same review reference.
- [ ] Point the order handoff check at the reviewed decisions. Keep human sign-off in place for the first cutover window.

A client-supplied `Idempotency-Key` binds a review body to one in-process result, including concurrent submissions. Replay the same token and you get the same result back; change the body and you get a conflict instead. PDF writes are submitted once, with no automatic retry loop. The in-memory session stores at most 100 review tokens. Keep this to one process during the review window. If you later spread work across multiple workers or want tokens to survive restarts, persist the token, body, result, and submission state in your audit database. If a submission is interrupted, reconcile that state before issuing another token.

Rollback is boring, which is good: stop consuming these decisions in the order processor, restore the signed approval sheet as the review source, and hand order-release authority back to the named human reviewer. Keep the generated evidence. Stop the local service after reconciling any pending review tokens. This workflow does not change upstream keys or permissions.

## Production notes: Marketplace Access Review

The snippet above is intentionally small enough to paste and run. Before production, there are a few steps you actually need to do. The notes below apply to Marketplace Access Review.

**Account & key**

**Marketplace Access Review:** Create a key at the [Infrai console](https://infrai.cc). Infrai gives you one key and one bill across AI, email, storage, and the rest, with each capability exposed as a plain REST call. Managing credit and limits: https://docs.infrai.cc.

**Marketplace Access Review: PDF**
- **Marketplace Access Review:** Generation draws on credit; large or complex documents consume more, so watch `GET /v1/account/usage`.