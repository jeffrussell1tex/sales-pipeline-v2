// src/utils/pressNotice.js
// A press notice (state §0.245, docs/design/refusal-sweep 1a; Jeff's Q1): a refusal said where a press had no error
// place of its own — the Pipeline's stage drag, among others, and the profile load that failed (App.jsx, state §0.292:
// one id of its own, taken back when a later load lands). Drawn bottom-left by ModalLayer, "⚠ <title> — <words>", kept until its ✕
// and cleared by an org switch (useModalState's pressNotices, useOrgBoundState) — never on a timer, never the one-slot
// toast a later toast replaces (§0.199's fifth re-check). `refused` is the task rail's notes refused (TaskRail); none here.
export const pressNoticeOf = (title, words) => ({ id: 'press_' + crypto.randomUUID(), title, words, refused: null });
