// settings/security/FlsDetail.jsx
//
// Honest by construction (state §0.171 — Jeff: "Honest page now"). What was here:
// a field × role grid — Edit / Read / Masked / Hidden for 42 fields of five
// objects — saved as `fieldVisibility`. 28 of the 42 field keys were no column
// of their object (a tax ID, a credit score, a date of birth …), and the levels
// it saved were strings while the app's one field check (`canViewField`) hid a
// field only for the boolean `false`: no level ever hid anything — and no org had
// saved one (read 5 Oct: six settings rows, none). A field hidden on screen would
// still have arrived in the record's data; per-field rules have to be the
// server's, in every answer. The page now says what Accelerep does instead.
import React from 'react';
import { T } from '../shared/tokens.js';
import { SecCrumb, SecTitle, SecCallout, SecCard } from './shared.jsx';

export const FlsDetail = ({ onBack }) => (
    <div style={{ fontFamily:T.sans }}>
        <SecCrumb page="Field-level security" onBack={onBack}/>
        <SecTitle title="Field-level security" sub="Per-field rules are not available"/>

        <SecCallout tone="info"
            text={<>
                Accelerep decides access by <b>role</b> and by <b>record</b> — who can see and change which records
                (Settings → People &amp; Teams → <b>Roles &amp; permissions</b>). It has no per-field rules: every field of a
                record someone can see is shown to them.
            </>}/>

        <SecCard title="Why there is no setting here" desc="A control that looked like security and did nothing was worse than none.">
            <ul style={{ margin:0, paddingLeft:18, fontSize:13, color:T.inkMid, lineHeight:1.7, fontFamily:T.sans }}>
                <li>Hiding a field on screen keeps nothing private: the record still arrives from the server whole, and a browser’s developer tools show it.</li>
                <li>Real field-level security leaves the field out on the server, in every answer — records, reports, exports and the API. Accelerep does not do that, so it offers no setting that would look as if it did.</li>
            </ul>
        </SecCard>
    </div>
);
