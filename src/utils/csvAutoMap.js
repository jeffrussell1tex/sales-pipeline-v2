// CSV header -> app field auto-mapping.
//
// WHY THIS IS ITS OWN MODULE
// --------------------------
// The previous matcher lived inline in CsvImportModal.parseCSV as a single flat
// `||` chain fed to headers.findIndex(). That has three structural faults, and a
// real Outlook export hits all three:
//
//   1. FIRST MATCH WINS. findIndex returns the first header CONTAINING the
//      substring, so "Company Main Phone" beat "Company" and the Company field
//      received a phone number. Likewise "E-mail Address" beat "Business Street"
//      for Address, and "Home Phone" beat "Business Phone".
//   2. NO ONE-TO-ONE CONSTRAINT. One header could be claimed by several fields —
//      "E-mail Address" was assigned to BOTH email and address.
//   3. DISHONEST CONFIDENCE. Score was derived from HOW the match was made, not
//      how good it was. A bare substring hit scored 0.85, above the 0.85 warn
//      threshold, so a wrong mapping rendered as a green bar. The one signal that
//      could have caught this reported everything as fine.
//
// Replaced by weighted aliases plus a global greedy assignment. Pure and
// dependency-free so it can be unit-tested — see tests/csv-automap.test.mjs.

// Normalise a header or label for comparison: lowercase, strip everything that
// is not a letter or digit. "E-mail 2 Address" -> "email2address".
export const normalize = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Weighted aliases per field key: [pattern, weight].
//
// Weight is the confidence the match deserves, and it is what the UI bar shows.
// Anything below 0.85 renders as a warning, so a merely-plausible match is
// visibly uncertain instead of quietly green.
//
//   1.00  unambiguous — this header means exactly this field
//   0.90  strong and conventional
//   0.70  plausible but genuinely ambiguous; the user should look
//
// ORDER DOES NOT MATTER — the best weight wins, not the first hit. That is the
// whole point. 'jobtitle' outranks bare 'title' so Outlook's honorific "Title"
// column cannot take the Job Title slot when a real "Job Title" column exists.
const ALIASES = {
    firstName:      [['firstname', 1], ['givenname', 1], ['fname', 0.9], ['first', 0.9], ['forename', 0.9]],
    middleName:     [['middlename', 1], ['middle', 0.9], ['mname', 0.9]],
    lastName:       [['lastname', 1], ['surname', 1], ['familyname', 1], ['lname', 0.9], ['last', 0.9]],
    email:          [['emailaddress', 1], ['email', 1], ['email1', 1], ['primaryemail', 1], ['workemail', 0.9], ['businessemail', 0.9], ['email1address', 1]],
    personalEmail:  [['email2', 1], ['email2address', 1], ['secondaryemail', 0.9], ['personalemail', 1], ['homeemail', 0.9], ['otheremail', 0.9]],
    phone:          [['businessphone', 1], ['workphone', 1], ['officephone', 1], ['phone', 0.9], ['telephone', 0.9], ['businessphone1', 1], ['phonenumber', 0.9]],
    mobile:         [['mobilephone', 1], ['mobile', 1], ['cellphone', 1], ['cell', 1], ['mobilenumber', 1]],
    title:          [['jobtitle', 1], ['position', 0.9], ['role', 0.7], ['title', 0.7]],
    company:        [['companyname', 1], ['company', 1], ['organization', 1], ['organisation', 1], ['employer', 0.9], ['accountname', 0.9], ['org', 0.7]],
    workLocation:   [['officelocation', 1], ['worklocation', 1], ['location', 0.7], ['office', 0.7]],
    address:        [['businessstreet', 1], ['streetaddress', 1], ['address', 0.9], ['address1', 0.9], ['street', 0.9], ['businessaddress', 1], ['mailingstreet', 1]],
    city:           [['businesscity', 1], ['city', 1], ['mailingcity', 1], ['town', 0.9]],
    state:          [['businessstate', 1], ['state', 1], ['province', 1], ['stateprovince', 1], ['mailingstate', 1], ['region', 0.7]],
    zip:            [['businesspostalcode', 1], ['postalcode', 1], ['zip', 1], ['zipcode', 1], ['mailingzip', 1], ['postcode', 1]],
    country:        [['businesscountryregion', 1], ['country', 1], ['countryregion', 1], ['mailingcountry', 1]],
    // account-only
    name:           [['accountname', 1], ['companyname', 1], ['name', 0.9], ['organization', 0.9]],
    parentAccount:  [['parentaccount', 1], ['parent', 0.9], ['parentcompany', 1], ['parentaccountname', 1]],
    verticalMarket: [['verticalmarket', 1], ['vertical', 1], ['industry', 1], ['sector', 0.9]],
    accountOwner:   [['accountowner', 1], ['owner', 0.9], ['assignedto', 0.7]],
    website:        [['website', 1], ['webpage', 1], ['url', 0.9], ['websiteurl', 1], ['domain', 0.7]],
    // opportunity-only
    opportunityName:[['opportunityname', 1], ['dealname', 1], ['opportunity', 0.9], ['deal', 0.9]],
    account:        [['accountname', 1], ['account', 1], ['company', 0.9], ['customer', 0.9]],
    salesRep:       [['salesrep', 1], ['owner', 0.9], ['rep', 0.9], ['assignedto', 0.9], ['opportunityowner', 1]],
    stage:          [['stage', 1], ['salesstage', 1], ['dealstage', 1], ['status', 0.7]],
    arr:            [['arr', 1], ['annualrecurringrevenue', 1], ['amount', 0.9], ['value', 0.7], ['dealvalue', 0.9]],
};

// Headers a field must NEVER take, regardless of substring overlap. These exist
// for the case where the RIGHT column is absent: without them, a CSV containing
// "Company Main Phone" but no "Company" would still put a phone number in the
// Company field. No mapping is strictly better than a wrong one — a blank cell
// is visible, a phone number in a company column reads as data.
const DENY = {
    company:       [/phone|fax|email|url|web|address|street|city|state|zip|postal/],
    name:          [/phone|fax|email|url|owner|parent|address|street/],
    account:       [/phone|fax|email|owner|address|street/],
    address:       [/email|web|url|phone|fax/],
    phone:         [/mobile|cell|fax|pager|home|car|other|radio|telex|tty|callback|assistant|companymain|ext/],
    mobile:        [/fax|pager|business|work|home|office/],
    email:         [/optout|status|invalid|display|2|3/],
    personalEmail: [/optout|status|invalid|display/],
    title:         [/courtesy|salutation|honorific|prefix/],
    website:       [/email/],
};

// Score one (field, header) pair. 0 means "no match".
export const scoreMatch = (fieldKey, fieldLabel, header) => {
    const h = normalize(header);
    if (!h) return 0;

    for (const re of DENY[fieldKey] || []) if (re.test(h)) return 0;

    // The field's own key and label act as implicit exact aliases, but an
    // EXPLICIT entry in ALIASES always wins. Without this precedence the
    // implicit `title` (weight 1, from the key) overrode the deliberate
    // ['title', 0.7] entry, so Outlook's honorific "Title" tied with "Job Title"
    // at 1.0 and the winner fell back to column order — reintroducing the exact
    // order-dependence this module exists to remove. Caught by the
    // 'column ORDER does not change the result' test.
    const weights = new Map();
    weights.set(normalize(fieldKey), 1);
    weights.set(normalize(fieldLabel), 1);
    for (const [alias, weight] of ALIASES[fieldKey] || []) weights.set(alias, weight);

    let best = 0;
    for (const [alias, weight] of weights) {
        if (!alias) continue;
        if (h === alias) {
            best = Math.max(best, weight);              // exact
        } else if (h.startsWith(alias) || h.endsWith(alias)) {
            best = Math.max(best, weight * 0.8);        // prefix/suffix — "businessphone2"
        } else if (h.includes(alias) && alias.length >= 4) {
            best = Math.max(best, weight * 0.6);        // buried substring — weakest
        }
    }
    return best;
};

/**
 * Map CSV headers onto app fields.
 *
 * Assignment is GLOBAL and one-to-one: every (field, header) pair is scored,
 * the pairs are sorted by score, and the best available pair is taken until
 * nothing is left. A field takes at most one header and a header serves at most
 * one field. Greedy-by-descending-score is not provably optimal in general, but
 * with exact matches scoring 1.0 it always assigns the exact ones first, which
 * is the case that actually matters.
 *
 * @param   {string[]} headers   CSV header row
 * @param   {{key:string,label:string}[]} appFields
 * @param   {number} threshold   drop anything at or below this (default 0.35)
 * @returns {{mapping: Object<string,number>, confidence: Object<string,number>}}
 *          mapping maps fieldKey -> header INDEX, matching what the modal's
 *          <select> expects.
 */
export const autoMapHeaders = (headers, appFields, threshold = 0.35) => {
    const pairs = [];
    appFields.forEach(field => {
        headers.forEach((header, idx) => {
            const score = scoreMatch(field.key, field.label, header);
            if (score > threshold) pairs.push({ fieldKey: field.key, idx, score });
        });
    });

    // Descending score. Ties break on header order so behaviour is deterministic
    // rather than dependent on Array.prototype.sort stability across engines.
    pairs.sort((a, b) => b.score - a.score || a.idx - b.idx);

    const mapping = {};
    const confidence = {};
    const usedHeaders = new Set();

    for (const p of pairs) {
        if (mapping[p.fieldKey] !== undefined) continue;
        if (usedHeaders.has(p.idx)) continue;
        mapping[p.fieldKey] = p.idx;
        confidence[p.fieldKey] = Math.round(p.score * 100) / 100;
        usedHeaders.add(p.idx);
    }

    return { mapping, confidence };
};
