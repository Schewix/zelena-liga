import React from 'react';
import AppErrorScreen from './AppErrorScreen';

type ErrorBoundaryProps = {
  children: React.ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
  detail: string | null;
};

export default class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    detail: null,
  };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      detail: error instanceof Error && error.message ? error.message : null,
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Unhandled application error', { error, info });
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return <AppErrorScreen detail={this.state.detail} />;
  }
}
