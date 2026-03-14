import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useCopilot, type TooltipProps } from "react-native-copilot";
import { useTranslation } from "../src/i18n";
import * as Haptics from "expo-haptics";

export function CopilotTooltip({ labels }: TooltipProps) {
  const { t } = useTranslation();
  const {
    goToNext,
    stop,
    currentStepNumber,
    totalStepsNumber,
    isLastStep,
  } = useCopilot();

  const handleNext = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isLastStep) {
      stop();
    } else {
      goToNext();
    }
  };

  const handleSkip = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    stop();
  };

  return (
    <View style={styles.tooltip}>
      {/* Progress row */}
      <View style={styles.progressRow}>
        <View style={styles.dotsContainer}>
          {Array.from({ length: totalStepsNumber }, (_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                {
                  width: i === currentStepNumber - 1 ? 18 : 6,
                  backgroundColor:
                    i === currentStepNumber - 1 ? "#4f9cff" : "#e2e8f0",
                },
              ]}
            />
          ))}
        </View>
        <Text style={styles.counter}>
          {currentStepNumber}/{totalStepsNumber}
        </Text>
      </View>

      {/* Text — injected via CopilotStep `text` as "titleKey||descKey" */}
      <StepText />

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity
          onPress={handleSkip}
          style={styles.btnSkip}
          activeOpacity={0.7}
        >
          <Text style={styles.btnSkipText}>{t("tour.skip")}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleNext}
          style={styles.btnNext}
          activeOpacity={0.85}
        >
          <View style={styles.btnNextInner}>
            <Text style={styles.btnNextText}>
              {isLastStep ? t("tour.done") : t("tour.next")}
            </Text>
            {!isLastStep && (
              <Ionicons name="chevron-forward" size={15} color="#fff" />
            )}
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/** Reads the current step's `text` (format: "titleKey||descKey") and renders
 *  translated title + description. */
function StepText() {
  const { t } = useTranslation();
  const { currentStep } = useCopilot();

  const text = currentStep?.text ?? "";
  const [titleKey, descKey] = text.split("||");

  return (
    <>
      <Text style={styles.title}>{titleKey ? t(titleKey) : ""}</Text>
      <Text style={styles.desc}>{descKey ? t(descKey) : ""}</Text>
    </>
  );
}

const styles = StyleSheet.create({
  tooltip: {
    backgroundColor: "#ffffff",
    borderRadius: 22,
    padding: 20,
    maxWidth: 340,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  dotsContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flex: 1,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
  counter: {
    fontSize: 12,
    color: "#64748b",
    fontWeight: "600",
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1e293b",
    marginBottom: 6,
  },
  desc: {
    fontSize: 14,
    color: "#64748b",
    lineHeight: 22,
    marginBottom: 18,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
  },
  btnSkip: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "center",
  },
  btnSkipText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#64748b",
  },
  btnNext: {
    flex: 2,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: "#4f9cff",
    alignItems: "center",
    justifyContent: "center",
  },
  btnNextInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  btnNextText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#ffffff",
  },
});
