import React from 'react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, info) {
        console.error('[ErrorBoundary]', this.props.tabName || 'Unknown tab', error, info.componentStack);
    }

    handleReset() {
        this.setState({ hasError: false, error: null });
    }

    render() {
        if (this.state.hasError) {
            const { tabName = 'this tab' } = this.props;
            return (
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: '400px',
                    padding: '2rem',
                    textAlign: 'center',
                }}>
                    <div style={{
                        background: '#fff',
                        border: '1px solid #fecaca',
                        borderRadius: '12px',
                        padding: '2.5rem 2rem',
                        maxWidth: '440px',
                        width: '100%',
                        boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
                    }}>
                        <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>⚠️</div>
                        <h3 style={{
                            fontSize: '1.0625rem',
                            fontWeight: '700',
                            color: '#1e293b',
                            margin: '0 0 0.5rem',
                        }}>
                            Something went wrong
                        </h3>
                        <p style={{
                            fontSize: '0.875rem',
                            color: '#64748b',
                            margin: '0 0 1.5rem',
                            lineHeight: 1.6,
                        }}>
                            {tabName.charAt(0).toUpperCase() + tabName.slice(1)} encountered an unexpected error and couldn't load.
                        </p>
                        {this.state.error?.message && (
                            <div style={{
                                background: '#fef2f2',
                                border: '1px solid #fecaca',
                                borderRadius: '6px',
                                padding: '0.625rem 0.875rem',
                                marginBottom: '1.5rem',
                                fontSize: '0.75rem',
                                color: '#b91c1c',
                                fontFamily: 'monospace',
                                textAlign: 'left',
                                wordBreak: 'break-word',
                            }}>
                                {this.state.error.message}
                            </div>
                        )}
                        <button
                            onClick={() => this.handleReset()}
                            style={{
                                padding: '0.5rem 1.5rem',
                                background: '#2563eb',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '7px',
                                fontSize: '0.875rem',
                                fontWeight: '700',
                                cursor: 'pointer',
                                fontFamily: 'inherit',
                            }}
                        >
                            Try Again
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
