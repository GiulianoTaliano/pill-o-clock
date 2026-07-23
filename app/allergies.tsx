/**
 * Allergy manager (F3) — per active profile. Entries picked from the NLM
 * ingredient autocomplete carry an RxCUI and power the conflict check when
 * adding medications; free-text entries are display-only (we never guess
 * from strings). Informational, never blocking.
 */
import { View, Text, TextInput, TouchableOpacity, FlatList } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useEffect, useState } from "react";
import { useRouter, Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTranslation } from "../src/i18n";
import { useAppTheme } from "../src/hooks/useAppTheme";
import { getActiveAllergies, insertAllergy, deleteAllergy } from "../src/db/database";
import { searchIngredients, type IngredientSuggestion } from "../src/services/interactions";
import { generateId, toISOString } from "../src/utils";
import type { Allergy } from "../src/types";

export default function AllergiesScreen() {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const router = useRouter();
  const [allergies, setAllergies] = useState<Allergy[]>([]);
  const [draft, setDraft] = useState("");
  const [suggestions, setSuggestions] = useState<IngredientSuggestion[]>([]);

  const reload = async () => setAllergies(await getActiveAllergies());
  useEffect(() => {
    reload();
  }, []);

  const add = async (name: string, ingRxcui?: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    Haptics.selectionAsync();
    await insertAllergy({ id: generateId(), name: trimmed, ingRxcui, createdAt: toISOString(new Date()) });
    setDraft("");
    setSuggestions([]);
    await reload();
  };

  const remove = async (id: string) => {
    await deleteAllergy(id);
    await reload();
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <Stack.Screen options={{ headerShown: false }} />
      {/* Header */}
      <View className="px-5 pt-4 pb-2 flex-row items-center gap-3">
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t("common.back")}
          onPress={() => router.back()}
          className="w-10 h-10 rounded-full bg-card border border-border items-center justify-center"
        >
          <Ionicons name="arrow-back" size={20} color={theme.primary} />
        </TouchableOpacity>
        <Text className="text-2xl font-black text-text">{t("allergies.title")}</Text>
      </View>
      <Text className="px-5 text-sm text-muted mb-3">{t("allergies.subtitle")}</Text>

      {/* Add row with ingredient autocomplete */}
      <View className="px-5">
        <View className="flex-row items-center gap-2">
          <TextInput
            value={draft}
            onChangeText={(v) => {
              setDraft(v);
              setSuggestions(searchIngredients(v));
            }}
            placeholder={t("allergies.placeholder")}
            placeholderTextColor={theme.muted}
            className="flex-1 border border-border rounded-xl px-3 py-2.5 text-text text-base bg-card"
            autoCapitalize="words"
          />
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={t("allergies.addFreeText")}
            onPress={() => add(draft)}
            disabled={!draft.trim()}
            className={`rounded-xl px-4 py-2.5 ${draft.trim() ? "bg-primary" : "bg-slate-300"}`}
          >
            <Ionicons name="add" size={20} color="#ffffff" />
          </TouchableOpacity>
        </View>
        {suggestions.length > 0 && (
          <View className="mt-1 rounded-xl border border-border bg-card overflow-hidden">
            {suggestions.map((sug) => (
              <TouchableOpacity
                key={sug.rxcui}
                accessibilityRole="button"
                accessibilityLabel={sug.name}
                onPress={() => add(sug.name, sug.rxcui)}
                className="px-3 py-2.5 border-b border-border flex-row items-center gap-2"
              >
                <Ionicons name="shield-checkmark-outline" size={14} color={theme.primary} />
                <Text className="text-sm font-medium text-text flex-1" numberOfLines={1}>{sug.name}</Text>
              </TouchableOpacity>
            ))}
            <Text className="px-3 py-1.5 text-[10px] text-muted">{t("allergies.checkableHint")}</Text>
          </View>
        )}
      </View>

      {/* List */}
      <FlatList
        data={allergies}
        keyExtractor={(a) => a.id}
        contentContainerStyle={{ padding: 20, paddingTop: 12 }}
        ListEmptyComponent={
          <Text className="text-sm text-muted text-center mt-8">{t("allergies.empty")}</Text>
        }
        renderItem={({ item }) => (
          <View className="flex-row items-center gap-3 bg-card border border-border rounded-2xl px-4 py-3 mb-2">
            <Ionicons
              name={item.ingRxcui ? "shield-checkmark" : "shield-outline"}
              size={18}
              color={item.ingRxcui ? theme.primary : theme.muted}
            />
            <View className="flex-1">
              <Text className="text-[15px] font-semibold text-text">{item.name}</Text>
              <Text className="text-[11px] text-muted mt-0.5">
                {item.ingRxcui ? t("allergies.checkable") : t("allergies.freeText")}
              </Text>
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t("common.delete")}
              onPress={() => remove(item.id)}
              className="p-2"
            >
              <Ionicons name="trash-outline" size={18} color={theme.danger} />
            </TouchableOpacity>
          </View>
        )}
      />
    </SafeAreaView>
  );
}
