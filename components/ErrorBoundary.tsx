import React from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Sentry from "@sentry/react-native";
import { useTranslation } from "../src/i18n";
import { useAppTheme } from "../src/hooks/useAppTheme";
import { AppPressable } from "./AppPressable";

export function ErrorRecovery({
  onRetry,
  loading = false,
}: {
  onRetry: () => void;
  loading?: boolean;
}) {
  const { t } = useTranslation();
  const theme = useAppTheme();
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        padding: 32,
        backgroundColor: theme.background,
        gap: 16,
      }}
    >
      <Ionicons name="alert-circle-outline" size={48} color={theme.danger} />
      <Text
        accessibilityRole="header"
        style={{
          fontSize: 24,
          fontWeight: "700",
          color: theme.text,
          textAlign: "center",
        }}
      >
        {t("ux.errorTitle")}
      </Text>
      <Text
        style={{
          fontSize: 16,
          lineHeight: 24,
          color: theme.muted,
          textAlign: "center",
        }}
      >
        {t("ux.errorBody")}
      </Text>
      <AppPressable
        disabled={loading}
        onPress={onRetry}
        style={{
          backgroundColor: theme.actionFill,
          paddingHorizontal: 24,
          paddingVertical: 14,
          borderRadius: 16,
        }}
      >
        <Text
          style={{ color: theme.onAction, fontSize: 17, fontWeight: "600" }}
        >
          {t("ux.retry")}
        </Text>
      </AppPressable>
    </View>
  );
}
export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    Sentry.captureException(error, {
      extra: { componentStack: info.componentStack },
    });
  }
  render() {
    if (this.state.hasError)
      return (
        <ErrorRecovery onRetry={() => this.setState({ hasError: false })} />
      );
    return this.props.children;
  }
}
