// MUST BE CAUGHT — CsvImportModal, four sites. React does NOT merge style objects:
// priBtn was discarded entirely, so both primary CTAs in the import flow rendered
// as raw unstyled browser buttons.
const Actions = () => (
    <button style={priBtn} onClick={go} style={{ display: 'flex', gap: 8 }}>Import</button>
);
