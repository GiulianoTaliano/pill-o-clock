import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * React class-based Error Boundary.
 * Wraps the entire app in _layout.tsx so unexpected render errors show a
 * controlled fallback instead of a blank / crashed screen.
 *
 * Note: hooks (useTranslation, etc.) cannot be used inside class components,
 * so the fallback text is bilingual to cover both supported languages.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary] Uncaught error:", error, info.componentStack);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Ionicons name="alert-circle-outline" size={56} color="#dc2626" />
          <Text style={styles.title}>
            Algo salió mal · Something went wrong
          </Text>
          <Text style={styles.detail} numberOfLines={4}>
            {this.state.error?.message ?? "Unknown error"}
          </Text>
          <TouchableOpacity style={styles.button} onPress={this.handleRetry}>
            <Text style={styles.buttonText}>Reintentar · Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    backgroundColor: "#fff",
    gap: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
    color: "#0f172a",
  },
  detail: {
    fontSize: 13,
    color: "#64748b",
    textAlign: "center",
  },
  button: {
    marginTop: 8,
    paddingHorizontal: 28,
    paddingVertical: 12,
    backgroundColor: "#4f9cff",
    borderRadius: 12,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
});
