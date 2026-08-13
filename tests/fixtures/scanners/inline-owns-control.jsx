// MUST BE CAUGHT — the original class: the inline component contains the control.
const Form = () => {
    const [v, setV] = React.useState('');
    const Field = () => <input value={v} onChange={e => setV(e.target.value)} />;
    return <Field />;
};
