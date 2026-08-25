import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
          <div className="max-w-lg w-full bg-white border border-red-200 rounded-xl p-6 shadow-sm">
            <h1 className="text-lg font-bold text-red-600 mb-1">Algo deu errado</h1>
            <p className="text-sm text-gray-600 mb-4">
              Ocorreu um erro inesperado na interface. Tente recarregar — se persistir, envie o texto abaixo ao suporte.
            </p>
            <pre className="text-[11px] bg-gray-50 border border-gray-200 rounded-lg p-3 overflow-auto max-h-48 text-gray-700 whitespace-pre-wrap">
              {String(this.state.error.stack || this.state.error)}
            </pre>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 px-4 py-2 bg-primary-500 text-white text-sm font-medium rounded-lg hover:bg-primary-600 transition-colors"
            >
              Recarregar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
